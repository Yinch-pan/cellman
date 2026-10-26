import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID, randomBytes } from "node:crypto";
import { Pool, migrate } from "../src/db/pool";
import { register, login, authenticate } from "../src/auth/sessions";
import { createApp } from "../src/app";
import {
  encryptedMailer,
  disabledMailer,
  type Mailer,
} from "../src/mail/transport";
import {
  registerWithEmail,
  resendRegistration,
  consumeEmailToken,
} from "../src/mail/accounts";
import { digest } from "../src/auth/password";

const url = process.env.TEST_DATABASE_URL;
const schema = "registration_" + randomUUID().replaceAll("-", "");
const admin = new Pool({ connectionString: url });
const db = new Pool({
  connectionString: url,
  options: `-c search_path=${schema}`,
});
const mailer = encryptedMailer(randomBytes(32), async () => {});
const origin = "http://127.0.0.1:5173";
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
const input = () => {
  const username = "reg" + randomUUID().replaceAll("-", "").slice(0, 15);
  return { username, password: "abc123", email: username + "@example.test" };
};
async function account(username: string) {
  return (
    await db.query("SELECT * FROM accounts WHERE username=$1", [username])
  ).rows[0];
}
async function token(username: string) {
  const a = await account(username);
  const row = (
    await db.query(
      "SELECT payload FROM email_outbox WHERE user_id=$1 AND kind='signup' AND status='pending' ORDER BY created_at DESC LIMIT 1",
      [a.id],
    )
  ).rows[0];
  return mailer.open(row.payload).text.match(/token=([A-Za-z0-9_-]+)/)![1];
}
async function age(username: string) {
  await db.query(
    "UPDATE email_attempts SET created_at=now()-interval '2 minutes' WHERE user_id=$1",
    [(await account(username)).id],
  );
}
it("requires an email and enabled delivery before creating an account", async () => {
  for (const delivery of [mailer, disabledMailer]) {
    const app = createApp(db, origin, false, [], [], delivery);
    const i = input();
    try {
      const missing = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: { origin },
        payload: { username: i.username, password: i.password },
      });
      expect(missing.statusCode).toBe(400);
      if (!delivery.enabled) {
        const off = await app.inject({
          method: "POST",
          url: "/api/auth/register",
          headers: { origin },
          payload: i,
        });
        expect(off.statusCode).toBe(503);
      }
      expect(await account(i.username)).toBeUndefined();
    } finally {
      await app.close();
    }
  }
});
it("blocks pending logins and sessions; activation permits username/email login only once", async () => {
  const i = input();
  await registerWithEmail(db, mailer, i, origin);
  await expect(login(db, i.username, i.password)).rejects.toMatchObject({
    code: "REGISTRATION_PENDING",
  });
  const a = await account(i.username);
  await db.query(
    "INSERT INTO sessions(token_hash,user_id,csrf,expires_at) VALUES($1,$2,'test',now()+interval '1 hour')",
    [digest("stale-session"), a.id],
  );
  expect(await authenticate(db, "stale-session")).toBeNull();
  const raw = await token(i.username);
  await expect(
    consumeEmailToken(db, raw, "verify", i.password),
  ).rejects.toMatchObject({ code: "EMAIL_LINK_INVALID" });
  await consumeEmailToken(db, raw, "signup", "");
  expect((await login(db, i.username, i.password)).user.id).toBe(a.id);
  expect((await login(db, i.email.toUpperCase(), i.password)).user.id).toBe(
    a.id,
  );
  await expect(consumeEmailToken(db, raw, "signup", "")).rejects.toMatchObject({
    code: "EMAIL_LINK_INVALID",
  });
  await expect(resendRegistration(db, mailer, i, origin)).rejects.toMatchObject(
    { code: "REGISTRATION_ALREADY_VERIFIED" },
  );
});
it("resending authenticates the applicant, throttles requests and replaces the old mailbox link", async () => {
  const i = input();
  await registerWithEmail(db, mailer, i, origin);
  const old = await token(i.username);
  await expect(
    resendRegistration(
      db,
      mailer,
      { ...i, password: "wrong-password" },
      origin,
    ),
  ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
  await expect(resendRegistration(db, mailer, i, origin)).rejects.toMatchObject(
    { code: "MAIL_RATE_LIMIT" },
  );
  await age(i.username);
  const nextEmail = "changed-" + i.email;
  await resendRegistration(db, mailer, { ...i, email: nextEmail }, origin);
  await expect(consumeEmailToken(db, old, "signup", "")).rejects.toMatchObject({
    code: "EMAIL_LINK_INVALID",
  });
  await consumeEmailToken(db, await token(i.username), "signup", "");
  expect((await account(i.username)).email).toBe(nextEmail);
  await expect(login(db, i.email, i.password)).rejects.toMatchObject({
    code: "INVALID_CREDENTIALS",
  });
});
it("expired links require another email; duplicate mailboxes cannot activate two accounts", async () => {
  const a = input(),
    b = { ...input(), email: a.email };
  await registerWithEmail(db, mailer, a, origin);
  const expired = await token(a.username);
  await db.query(
    "UPDATE email_tokens SET expires_at=now()-interval '1 second' WHERE token_hash=$1",
    [digest(expired)],
  );
  await expect(
    consumeEmailToken(db, expired, "signup", ""),
  ).rejects.toMatchObject({ code: "EMAIL_LINK_INVALID" });
  await age(a.username);
  await resendRegistration(db, mailer, a, origin);
  await registerWithEmail(db, mailer, b, origin);
  const results = await Promise.allSettled([
    consumeEmailToken(db, await token(a.username), "signup", ""),
    consumeEmailToken(db, await token(b.username), "signup", ""),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  expect(
    (
      await db.query(
        "SELECT id FROM accounts WHERE email=$1 AND NOT registration_pending",
        [a.email],
      )
    ).rowCount,
  ).toBe(1);
});
it("queue failure rolls back registration, and existing accounts remain usable", async () => {
  const i = input();
  const broken: Mailer = {
    ...mailer,
    seal() {
      throw Error("queue failure");
    },
  };
  await expect(registerWithEmail(db, broken, i, origin)).rejects.toThrow(
    "queue failure",
  );
  expect(await account(i.username)).toBeUndefined();
  const legacy = await register(db, i);
  expect((await login(db, i.username, i.password)).user.id).toBe(legacy.userId);
});
