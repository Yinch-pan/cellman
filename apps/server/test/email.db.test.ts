import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID, randomBytes } from "node:crypto";
import { Pool, migrate } from "../src/db/pool";
import { register, login, authenticate, recover } from "../src/auth/sessions";
import {
  encryptedMailer,
  disabledMailer,
  configuredMailer,
  type Message,
} from "../src/mail/transport";
import {
  requestEmail,
  emailStatus,
  consumeEmailToken,
  forgotPassword,
  emailPreferences,
  cancelEmailRequest,
} from "../src/mail/accounts";
import { collectReminders, deliverMail } from "../src/mail/worker";
import { getGame, submitCommand } from "../src/games/commands";
import { requestUndo, voteUndo } from "../src/games/undo";
import { createApp } from "../src/app";
import {
  createRoom,
  joinRoom,
  setReady,
  startRoom,
} from "../src/rooms/service";
const url = process.env.TEST_DATABASE_URL,
  schema = "email_" + randomUUID().replaceAll("-", "");
const admin = new Pool({ connectionString: url }),
  db = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
const sent: Message[] = [],
  mailer = encryptedMailer(randomBytes(32), async (m) => {
    sent.push(m);
  }),
  origin = "http://127.0.0.1:5173",
  password = "email-test-password";
let created = false;
beforeAll(async () => {
  if (!url || url === process.env.DATABASE_URL)
    throw Error("Separate test DB required");
  await admin.query(`CREATE SCHEMA ${schema}`);
  created = true;
  await migrate(db);
});
afterAll(async () => {
  await db.end();
  if (created) await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
});
async function user() {
  const username = "mail" + randomUUID().replaceAll("-", "").slice(0, 16);
  return { ...(await register(db, { username, password })), username };
}
async function payload(id: string, kind = "verify") {
  return mailer.open(
    (
      await db.query(
        "SELECT payload FROM email_outbox WHERE user_id=$1 AND kind=$2 AND status='pending' ORDER BY created_at DESC LIMIT 1",
        [id, kind],
      )
    ).rows[0].payload,
  );
}
const raw = (m: Message) => m.text.match(/token=([A-Za-z0-9_-]+)/)![1];
async function age(id: string) {
  await db.query(
    "UPDATE email_attempts SET created_at=now()-interval '2 minutes' WHERE user_id=$1",
    [id],
  );
}
async function verified() {
  const u = await user(),
    email = u.username + "@example.com";
  await requestEmail(db, mailer, u.userId, email, password, origin);
  await consumeEmailToken(db, raw(await payload(u.userId)), "verify", password);
  await age(u.userId);
  return { ...u, email };
}
it("binding requires password and mailbox proof; queue encrypts tokens and verified mail can log in", async () => {
  const u = await user(),
    email = u.username + "@example.com";
  await expect(
    requestEmail(db, mailer, u.userId, email, "wrong", origin),
  ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
  await requestEmail(
    db,
    mailer,
    u.userId,
    email.toUpperCase(),
    password,
    origin,
  );
  await expect(login(db, email, password)).rejects.toMatchObject({
    code: "INVALID_CREDENTIALS",
  });
  await expect(
    emailPreferences(db, u.userId, true, true),
  ).rejects.toMatchObject({ code: "EMAIL_VERIFY_FIRST" });
  const message = await payload(u.userId),
    linkToken = raw(message);
  const tokenRow = (
    await db.query("SELECT token_hash FROM email_tokens WHERE user_id=$1", [
      u.userId,
    ])
  ).rows[0];
  expect(tokenRow.token_hash).not.toBe(linkToken);
  const out = (
    await db.query("SELECT payload FROM email_outbox WHERE user_id=$1", [
      u.userId,
    ])
  ).rows[0];
  expect(out.payload).not.toContain(linkToken);
  expect(out.payload).not.toContain(email);
  await deliverMail(db, mailer);
  expect(sent.some((m) => m.to === email && m.text.includes(linkToken))).toBe(
    true,
  );
  await expect(
    consumeEmailToken(db, linkToken, "verify", "wrong"),
  ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
  await consumeEmailToken(db, linkToken, "verify", password);
  expect((await login(db, email.toUpperCase(), password)).user.id).toBe(
    u.userId,
  );
  await expect(
    consumeEmailToken(db, linkToken, "verify", password),
  ).rejects.toMatchObject({ code: "EMAIL_LINK_INVALID" });
  const status = await emailStatus(db, u.userId, true);
  expect(status.email).toBe(email);
  expect(status.notifyTurn).toBe(false);
});
it("limits resends, cancels superseded tokens, and rejects expired or recovery-invalidated verification", async () => {
  const u = await user(),
    email = u.username + "@example.com";
  await requestEmail(db, mailer, u.userId, email, password, origin);
  const old = raw(await payload(u.userId));
  await expect(
    requestEmail(db, mailer, u.userId, email, password, origin),
  ).rejects.toMatchObject({ code: "MAIL_RATE_LIMIT" });
  await age(u.userId);
  await requestEmail(db, mailer, u.userId, email, password, origin);
  const next = raw(await payload(u.userId));
  await expect(
    consumeEmailToken(db, old, "verify", password),
  ).rejects.toMatchObject({ code: "EMAIL_LINK_INVALID" });
  await db.query(
    "UPDATE email_tokens SET expires_at=now()-interval '1 second' WHERE user_id=$1",
    [u.userId],
  );
  await expect(
    consumeEmailToken(db, next, "verify", password),
  ).rejects.toMatchObject({ code: "EMAIL_LINK_INVALID" });
  await age(u.userId);
  await requestEmail(db, mailer, u.userId, email, password, origin);
  const pending = raw(await payload(u.userId));
  await recover(db, u.username, u.recoveryCode, "changed-password-123");
  await expect(
    consumeEmailToken(db, pending, "verify", "changed-password-123"),
  ).rejects.toMatchObject({ code: "EMAIL_LINK_INVALID" });
});
it("password reset does not reveal account presence, uses one token once and revokes all sessions/recovery codes", async () => {
  const u = await verified(),
    session = await login(db, u.email, password);
  expect(
    await forgotPassword(db, mailer, "unknown@example.com", origin),
  ).toEqual(await forgotPassword(db, mailer, u.email, origin));
  const reset = raw(await payload(u.userId, "reset"));
  const results = await Promise.allSettled([
    consumeEmailToken(db, reset, "reset", "new-email-password"),
    consumeEmailToken(db, reset, "reset", "new-email-password"),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(await authenticate(db, session.session)).toBeNull();
  await expect(login(db, u.email, password)).rejects.toMatchObject({
    code: "INVALID_CREDENTIALS",
  });
  expect((await login(db, u.email, "new-email-password")).user.id).toBe(
    u.userId,
  );
  await expect(
    recover(db, u.username, u.recoveryCode, "another-password"),
  ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
});
it("verified address uniqueness survives concurrent claims and cancelling requests leaves existing email intact", async () => {
  const a = await user(),
    b = await user(),
    email = a.username + "@example.com";
  await requestEmail(db, mailer, a.userId, email, password, origin);
  await requestEmail(db, mailer, b.userId, email, password, origin);
  const ta = raw(await payload(a.userId)),
    tb = raw(await payload(b.userId));
  const result = await Promise.allSettled([
    consumeEmailToken(db, ta, "verify", password),
    consumeEmailToken(db, tb, "verify", password),
  ]);
  expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const winner = result[0].status === "fulfilled" ? a : b;
  await age(winner.userId);
  await requestEmail(
    db,
    mailer,
    winner.userId,
    "new-" + email,
    password,
    origin,
  );
  await cancelEmailRequest(db, winner.userId);
  const s = await emailStatus(db, winner.userId, true);
  expect(s.email).toBe(email);
  expect(s.pendingEmail).toBeNull();
});
it("outbox retries transient failure, survives restart and claims each queued message only once", async () => {
  const u = await user();
  await requestEmail(
    db,
    mailer,
    u.userId,
    u.username + "@example.com",
    password,
    origin,
  );
  // Isolate this recipient; other cases intentionally leave stale messages behind.
  await db.query(
    "UPDATE email_outbox SET status='cancelled' WHERE user_id<>$1 AND status='pending'",
    [u.userId],
  );
  const failing = {
    ...mailer,
    async send() {
      throw Error("SMTP secret should not be logged");
    },
  };
  await deliverMail(db, failing);
  let row = (
    await db.query("SELECT * FROM email_outbox WHERE user_id=$1", [u.userId])
  ).rows[0];
  expect(row.status).toBe("pending");
  expect(row.attempts).toBe(1);
  await db.query("UPDATE email_outbox SET next_at=now() WHERE user_id=$1", [
    u.userId,
  ]);
  const count = sent.length;
  await Promise.all([
    deliverMail(db, { ...mailer }),
    deliverMail(db, { ...mailer }),
  ]);
  expect(sent.length - count).toBe(1);
  row = (
    await db.query("SELECT * FROM email_outbox WHERE user_id=$1", [u.userId])
  ).rows[0];
  expect(row.status).toBe("sent");
  expect(row.payload).toBe("");
});
it("opt-in reminders wait, deduplicate, skip obsolete turns and respect overdue/paused clocks", async () => {
  const u = await verified(),
    other = [await user(), await user()];
  const room = await createRoom(db, u.userId, {
    visibility: "private",
    seats: 3,
    setupMode: "standard",
    settings: { time: { mode: "bank", minutes: 15 }, seatOrder: "seated" },
  });
  for (const p of other)
    await joinRoom(db, p.userId, room.id, room.inviteToken);
  for (const p of [u, ...other]) await setReady(db, p.userId, room.id, true);
  const id = (await startRoom(db, u.userId, room.id)).gameId;
  await db.query(
    "UPDATE games SET state=jsonb_set(state,'{activeSeat}','\"p1\"'),clock=jsonb_set(clock,'{running}','[\"p1\"]') WHERE id=$1",
    [id],
  );
  await collectReminders(db, mailer, origin);
  expect(
    (await db.query("SELECT 1 FROM email_waits WHERE game_id=$1", [id]))
      .rowCount,
  ).toBe(0);
  await emailPreferences(db, u.userId, true, true);
  const now = new Date();
  await collectReminders(db, mailer, origin, now);
  await collectReminders(db, mailer, origin, new Date(now.getTime() + 1000));
  expect(
    (
      await db.query(
        "SELECT 1 FROM email_outbox WHERE user_id=$1 AND kind='turn'",
        [u.userId],
      )
    ).rowCount,
  ).toBe(0);
  await collectReminders(db, mailer, origin, new Date(now.getTime() + 121000));
  await collectReminders(db, mailer, origin, new Date(now.getTime() + 122000));
  expect(
    (
      await db.query(
        "SELECT 1 FROM email_outbox WHERE user_id=$1 AND kind='turn'",
        [u.userId],
      )
    ).rowCount,
  ).toBe(1);
  await db.query(
    "UPDATE games SET state=jsonb_set(state,'{activeSeat}','\"p2\"') WHERE id=$1",
    [id],
  );
  await deliverMail(db, mailer);
  expect(sent.filter((m) => m.gameId === id)).toHaveLength(0);
  await db.query(
    "UPDATE games SET state=jsonb_set(state,'{activeSeat}','\"p1\"'),clock=jsonb_set(jsonb_set(clock,'{at}',to_jsonb($1::bigint)),'{paused}','true') WHERE id=$2",
    [Date.now() - 1000000, id],
  );
  await collectReminders(db, mailer, origin, new Date(now.getTime() + 123000));
  await deliverMail(db, mailer);
  expect(sent.filter((m) => m.gameId === id)).toHaveLength(0);
  await db.query(
    "UPDATE games SET clock=jsonb_set(clock,'{paused}','false') WHERE id=$1",
    [id],
  );
  await collectReminders(db, mailer, origin, new Date(now.getTime() + 124000));
  await collectReminders(db, mailer, origin, new Date(now.getTime() + 125000));
  await deliverMail(db, mailer);
  expect(sent.filter((m) => m.gameId === id)).toHaveLength(1);
  expect(sent.at(-1)!.subject).toContain("超时");
  await emailPreferences(db, u.userId, false, false);
  await collectReminders(db, mailer, origin, new Date(now.getTime() + 9999999));
  expect(sent.filter((m) => m.gameId === id)).toHaveLength(1);
});
it("fast turns between polls invalidate old reminders and start a new waiting period", async () => {
  const u = await verified(),
    players = [u, await user(), await user()];
  const room = await createRoom(db, u.userId, {
    visibility: "private",
    seats: 3,
    setupMode: "standard",
    settings: { seatOrder: "seated" },
  });
  for (const p of players.slice(1))
    await joinRoom(db, p.userId, room.id, room.inviteToken);
  for (const p of players) await setReady(db, p.userId, room.id, true);
  const id = (await startRoom(db, u.userId, room.id)).gameId;
  const state = (await getGame(db, u.userId, id)).state;
  state.phase = "actions";
  state.pending = [];
  state.activeSeat = "p1";
  state.turnOrder = ["p1", "p2", "p3"];
  for (const p of Object.values(state.players)) p.primaryDone = true;
  await db.query("UPDATE games SET state=$1,initial_state=$1 WHERE id=$2", [
    JSON.stringify(state),
    id,
  ]);
  await emailPreferences(db, u.userId, true, false);
  await collectReminders(db, mailer, origin);
  await db.query(
    "UPDATE email_waits SET waiting_since=now()-interval '3 minutes' WHERE game_id=$1",
    [id],
  );
  await collectReminders(db, mailer, origin);
  const old = (
    await db.query(
      "SELECT wait_id FROM email_waits WHERE game_id=$1 AND user_id=$2",
      [id, u.userId],
    )
  ).rows[0].wait_id;
  for (let i = 0; i < 3; i++)
    await submitCommand(db, players[i].userId, id, {
      commandId: randomUUID(),
      expectedRevision: i,
      action: { kind: "endTurn" },
    });
  const wait = (
    await db.query(
      "SELECT * FROM email_waits WHERE game_id=$1 AND user_id=$2",
      [id, u.userId],
    )
  ).rows[0];
  expect(wait.wait_id).not.toBe(old);
  expect(wait.turn_queued).toBe(false);
  expect(Date.now() - new Date(wait.waiting_since).getTime()).toBeLessThan(
    10000,
  );
  await deliverMail(db, mailer);
  expect(sent.filter((m) => m.gameId === id)).toHaveLength(0);
  await db.query(
    "UPDATE email_waits SET waiting_since=now()-interval '3 minutes' WHERE game_id=$1",
    [id],
  );
  await collectReminders(db, mailer, origin);
  expect(
    (
      await db.query(
        "SELECT count(*)::int AS n FROM email_outbox WHERE user_id=$1 AND kind='turn' AND status='pending'",
        [u.userId],
      )
    ).rows[0].n,
  ).toBe(0);
  await db.query(
    "UPDATE email_waits SET waiting_since=now()-interval '3 minutes',last_turn_at=now()-interval '16 minutes' WHERE game_id=$1",
    [id],
  );
  await collectReminders(db, mailer, origin);
  await deliverMail(db, mailer);
  expect(sent.filter((m) => m.gameId === id)).toHaveLength(1);
  await db.query(
    "UPDATE email_waits SET turn_queued=false,waiting_since=now()-interval '3 minutes',last_turn_at=now()-interval '16 minutes' WHERE game_id=$1",
    [id],
  );
  await collectReminders(db, mailer, origin);
  const requestId = randomUUID();
  await requestUndo(db, players[2].userId, id, {
    requestId,
    expectedRevision: 3,
    targetRevision: 2,
    reason: "test pause",
  });
  await voteUndo(db, players[1].userId, id, { requestId, decision: "reject" });
  await deliverMail(db, mailer);
  expect(sent.filter((m) => m.gameId === id)).toHaveLength(1);
  expect(
    (
      await db.query(
        "SELECT waiting_since FROM email_waits WHERE game_id=$1 AND user_id=$2",
        [id, u.userId],
      )
    ).rows[0].waiting_since,
  ).toBeNull();
});
it("HTTP endpoints protect account settings, expose unavailable mail honestly and validate tokens", async () => {
  const u = await user(),
    session = await login(db, u.username, password),
    app = createApp(db, origin, false, [], [], mailer),
    off = createApp(db);
  const headers = {
    origin,
    cookie: "session=" + session.session,
    "x-csrf-token": session.csrf,
  };
  try {
    expect((await off.inject({ url: "/api/auth/mail-status" })).json()).toEqual(
      { available: false },
    );
    expect(
      (
        await off.inject({
          method: "POST",
          url: "/api/auth/email/forgot",
          headers: { origin },
          payload: { email: "a@example.com" },
        })
      ).statusCode,
    ).toBe(503);
    expect((await app.inject({ url: "/api/account/email" })).statusCode).toBe(
      401,
    );
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/account/email",
          headers: { ...headers, "x-csrf-token": "bad" },
          payload: { email: "a@example.com", password },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/account/email",
          headers,
          payload: { email: u.username + "@example.com", password },
        })
      ).statusCode,
    ).toBe(200);
    const t = raw(await payload(u.userId));
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/auth/email/verify",
          headers: { origin },
          payload: { token: t, password },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ url: "/api/account/email", headers })).json().email,
    ).toBe(u.username + "@example.com");
  } finally {
    await app.close();
    await off.close();
  }
});
it("registration rejects occupied email and leaves a new account pending until verification", async () => {
  const u = await verified(),
    app = createApp(db, origin, false, [], [], mailer);
  try {
    const username = "reg" + randomUUID().replaceAll("-", "").slice(0, 12);
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { origin },
      payload: { username, password, email: u.email },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe("EMAIL_UNAVAILABLE");
    expect(
      (await db.query("SELECT id FROM accounts WHERE username=$1", [username]))
        .rowCount,
    ).toBe(0);
    const created = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { origin },
      payload: {
        username: username + "2",
        password,
        email: username + "@example.com",
      },
    });
    expect(created.statusCode).toBe(200);
    expect(created.json().emailDelivery).toBe("queued");
    await expect(login(db, username + "2", password)).rejects.toMatchObject({
      code: "REGISTRATION_PENDING",
    });
  } finally {
    await app.close();
  }
});
it("mail encryption detects tampering and enabled SMTP fails closed on missing credentials", () => {
  expect(configuredMailer({})).toBe(disabledMailer);
  expect(() => configuredMailer({ MAIL_ENABLED: "true" })).toThrow();
  const p = mailer.seal({
      to: "a@example.com",
      subject: "subject",
      text: "secret",
    }),
    data = Buffer.from(p, "base64");
  data[30] ^= 1;
  expect(() => mailer.open(data.toString("base64"))).toThrow();
});
it("changing a verified address replaces email login and invalidates old reset links", async () => {
  const u = await verified(),
    next = "new-" + u.email;
  await forgotPassword(db, mailer, u.email, origin);
  const reset = raw(await payload(u.userId, "reset"));
  await age(u.userId);
  await requestEmail(db, mailer, u.userId, next, password, origin);
  expect((await login(db, u.email, password)).user.id).toBe(u.userId);
  await expect(login(db, next, password)).rejects.toMatchObject({
    code: "INVALID_CREDENTIALS",
  });
  await consumeEmailToken(db, raw(await payload(u.userId)), "verify", password);
  await expect(login(db, u.email, password)).rejects.toMatchObject({
    code: "INVALID_CREDENTIALS",
  });
  expect((await login(db, next, password)).user.id).toBe(u.userId);
  await expect(
    consumeEmailToken(db, reset, "reset", "new-password-value"),
  ).rejects.toMatchObject({ code: "EMAIL_LINK_INVALID" });
});
it("disabling reminders cancels queued mail even when preferences are immediately re-enabled", async () => {
  const u = await verified();
  await db.query(
    "INSERT INTO email_outbox(id,user_id,kind,payload,expires_at) VALUES($1,$2,'turn',$3,now()+interval '1 hour')",
    [
      randomUUID(),
      u.userId,
      mailer.seal({ to: u.email, subject: "test", text: "test" }),
    ],
  );
  await emailPreferences(db, u.userId, false, false);
  await emailPreferences(db, u.userId, true, true);
  const r = (
    await db.query(
      "SELECT status,payload FROM email_outbox WHERE user_id=$1 AND kind='turn'",
      [u.userId],
    )
  ).rows[0];
  expect(r).toEqual({ status: "cancelled", payload: "" });
});
it("terminal SMTP failures and expired queue entries erase encrypted content", async () => {
  const u = await user();
  await requestEmail(
    db,
    mailer,
    u.userId,
    u.username + "@example.com",
    password,
    origin,
  );
  await db.query(
    "UPDATE email_outbox SET status='cancelled',payload='' WHERE user_id<>$1 AND status='pending'",
    [u.userId],
  );
  const failing = {
    ...mailer,
    async send() {
      throw Error("temporary");
    },
  };
  for (let i = 0; i < 5; i++) {
    await db.query("UPDATE email_outbox SET next_at=now() WHERE user_id=$1", [
      u.userId,
    ]);
    await deliverMail(db, failing);
  }
  expect(
    (
      await db.query(
        "SELECT status,payload,attempts FROM email_outbox WHERE user_id=$1",
        [u.userId],
      )
    ).rows[0],
  ).toEqual({ status: "failed", payload: "", attempts: 5 });
  await age(u.userId);
  await requestEmail(
    db,
    mailer,
    u.userId,
    u.username + "@example.com",
    password,
    origin,
  );
  await db.query(
    "UPDATE email_outbox SET expires_at=now()-interval '1 second' WHERE user_id=$1 AND status='pending'",
    [u.userId],
  );
  await deliverMail(db, mailer);
  expect(
    (
      await db.query(
        "SELECT status,payload FROM email_outbox WHERE user_id=$1 AND status='expired'",
        [u.userId],
      )
    ).rows[0],
  ).toEqual({ status: "expired", payload: "" });
});
it("mail endpoints rate-limit token guessing and malformed addresses never queue mail", async () => {
  const app = createApp(db, origin, false, [], [], mailer);
  try {
    for (let i = 0; i < 8; i++)
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/auth/email/verify",
            headers: { origin },
            payload: { token: "z".repeat(43), password },
          })
        ).statusCode,
      ).toBe(400);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/auth/email/verify",
          headers: { origin },
          payload: { token: "z".repeat(43), password },
        })
      ).statusCode,
    ).toBe(429);
    const before = (
      await db.query("SELECT count(*)::int AS n FROM email_outbox")
    ).rows[0].n;
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/auth/email/forgot",
          headers: { origin },
          payload: { email: "invalid-address" },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await db.query("SELECT count(*)::int AS n FROM email_outbox")).rows[0].n,
    ).toBe(before);
  } finally {
    await app.close();
  }
});
it("hourly email quota is enforced after the one-minute cooldown", async () => {
  const u = await user(),
    email = u.username + "@example.com";
  for (let i = 0; i < 5; i++) {
    await requestEmail(db, mailer, u.userId, email, password, origin);
    await age(u.userId);
  }
  await expect(
    requestEmail(db, mailer, u.userId, email, password, origin),
  ).rejects.toMatchObject({ code: "MAIL_RATE_LIMIT" });
  expect(
    (
      await db.query(
        "SELECT count(*)::int AS n FROM email_outbox WHERE user_id=$1 AND status='pending'",
        [u.userId],
      )
    ).rows[0].n,
  ).toBe(1);
});
