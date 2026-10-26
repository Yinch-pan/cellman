import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { get, type ClientRequest } from "node:http";
import { Pool, migrate } from "../src/db/pool";
import { createApp } from "../src/app";
import { register, login } from "../src/auth/sessions";
import { createGame } from "../../../packages/rules/src/state";
import { sampleSetup } from "../../../packages/rules/test/fixtures/setup";
const schema = "api_" + randomUUID().replaceAll("-", ""),
  url = process.env.TEST_DATABASE_URL;
const admin = new Pool({ connectionString: url }),
  db = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
const app = createApp(db);
let gameId = "",
  session: any,
  outsider: any;
beforeAll(async () => {
  if (!url) throw Error("TEST_DATABASE_URL required");
  await admin.query(`CREATE SCHEMA ${schema}`);
  await migrate(db);
  const ids = [];
  for (let i = 0; i < 4; i++) {
    ids.push(
      (
        await register(db, {
          username: "apiuser" + i,
          password: "test-password-1234",
        })
      ).userId,
    );
  }
  session = await login(db, "apiuser0", "test-password-1234");
  outsider = await login(db, "apiuser3", "test-password-1234");
  gameId = randomUUID();
  const state = createGame({ ...sampleSetup(), id: gameId });
  await db.query("INSERT INTO games(id,state,rules_version) VALUES($1,$2,$3)", [
    gameId,
    JSON.stringify(state),
    state.rulesVersion,
  ]);
  for (let i = 0; i < 3; i++)
    await db.query(
      "INSERT INTO game_members(game_id,user_id,seat) VALUES($1,$2,$3)",
      [gameId, ids[i], "p" + (i + 1)],
    );
  await app.ready();
});
afterAll(async () => {
  await app.close();
  await db.end();
  if (url) await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.end();
});
const headers = () => ({
  origin: "http://127.0.0.1:5173",
  "x-csrf-token": session.csrf,
  cookie: "session=" + session.session,
});
it("preview and read do not mutate state; commit increments exactly once", async () => {
  const command = {
    commandId: randomUUID(),
    expectedRevision: 0,
    action: { kind: "place", hex: "A1" },
  };
  const preview = await app.inject({
    method: "POST",
    url: "/api/games/" + gameId + "/preview",
    headers: headers(),
    payload: command,
  });
  expect(preview.statusCode).toBe(200);
  expect(preview.json().state.board.buildings.A1.kind).toBe("workshop");
  const before = await app.inject({
    url: "/api/games/" + gameId,
    headers: headers(),
  });
  expect(before.json().state.revision).toBe(0);
  expect(before.json().state.board.buildings).toEqual({});
  const commit = await app.inject({
    method: "POST",
    url: "/api/games/" + gameId + "/commands",
    headers: headers(),
    payload: command,
  });
  expect(commit.statusCode).toBe(200);
  expect(commit.json().revision).toBe(1);
});
it.each(["", "/history", "/events"])(
  "nonmembers cannot access game endpoint %s",
  async (suffix) => {
    const result = await app.inject({
      url: "/api/games/" + gameId + suffix,
      headers: { cookie: "session=" + outsider.session },
    });
    expect(result.statusCode).toBe(403);
    expect(result.json()).toEqual({ error: "FORBIDDEN" });
  },
);
it("rejects foreign origins, missing CSRF and malformed action", async () => {
  const payload = {
    commandId: randomUUID(),
    expectedRevision: 1,
    action: { kind: "setLeech", enabled: true, maxVpCost: 0 },
  };
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/api/games/" + gameId + "/commands",
        headers: { ...headers(), origin: "https://foreign.example" },
        payload,
      })
    ).statusCode,
  ).toBe(403);
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/api/games/" + gameId + "/commands",
        headers: { ...headers(), "x-csrf-token": "" },
        payload,
      })
    ).statusCode,
  ).toBe(403);
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/api/games/" + gameId + "/commands",
        headers: headers(),
        payload: { ...payload, action: { kind: "setResources", coins: 999 } },
      })
    ).statusCode,
  ).toBe(400);
});
it("preview refuses an unavailable rule version without changing the stored game", async () => {
  const { rows } = await db.query("SELECT state FROM games WHERE id=$1", [
    gameId,
  ]);
  const saved = rows[0].state;
  await db.query("UPDATE games SET state=$1,rules_version=$2 WHERE id=$3", [
    JSON.stringify({ ...saved, rulesVersion: "unavailable-version" }),
    "unavailable-version",
    gameId,
  ]);
  try {
    const result = await app.inject({
      method: "POST",
      url: "/api/games/" + gameId + "/preview",
      headers: headers(),
      payload: {
        commandId: randomUUID(),
        expectedRevision: 1,
        action: { kind: "setLeech", enabled: true, maxVpCost: 0 },
      },
    });
    expect(result.statusCode).toBe(503);
    expect(result.json().error).toBe("RULESET_UNAVAILABLE");
  } finally {
    await db.query("UPDATE games SET state=$1,rules_version=$2 WHERE id=$3", [
      JSON.stringify(saved),
      saved.rulesVersion,
      gameId,
    ]);
  }
});
it("history defaults to the latest page and retains explicit forward pagination", async () => {
  await db.query(
    "INSERT INTO game_events(game_id,revision,actor_id,events) SELECT $1,n,$2,'[]'::jsonb FROM generate_series(2,105)n",
    [gameId, session.user.id],
  );
  try {
    const latest = await app.inject({
      url: "/api/games/" + gameId + "/history",
      headers: headers(),
    });
    expect(latest.json()).toHaveLength(100);
    expect(latest.json()[0].revision).toBe(6);
    expect(latest.json().at(-1).revision).toBe(105);
    const next = await app.inject({
      url: "/api/games/" + gameId + "/history?after=100",
      headers: headers(),
    });
    expect(next.json().map((r: any) => r.revision)).toEqual([
      101, 102, 103, 104, 105,
    ]);
  } finally {
    await db.query("DELETE FROM game_events WHERE game_id=$1 AND revision>1", [
      gameId,
    ]);
  }
});
it("logout immediately closes this session event stream", async () => {
  const live = await login(db, "apiuser0", "test-password-1234");
  const address = await app.listen({ port: 0, host: "127.0.0.1" });
  const http = await import("node:http");
  await new Promise<void>((resolve, reject) => {
    const req = http.get(
      address + "/api/games/" + gameId + "/events",
      { headers: { cookie: "session=" + live.session } },
      (res) => {
        const timer = setTimeout(() => {
          res.destroy();
          reject(Error("SSE remained open after logout"));
        }, 1000);
        res.resume();
        res.on("end", () => {
          clearTimeout(timer);
          resolve();
        });
        app
          .inject({
            method: "POST",
            url: "/api/auth/logout",
            headers: {
              origin: "http://127.0.0.1:5173",
              cookie: "session=" + live.session,
              "x-csrf-token": live.csrf,
            },
            payload: {},
          })
          .catch(reject);
      },
    );
    req.on("error", reject);
  });
});

it("players sharing an IP have independent request budgets; sessions cannot reset an account budget", async () => {
  const isolated = createApp(db);
  try {
    const a = await login(db, "apiuser0", "test-password-1234");
    const b = await login(db, "apiuser1", "test-password-1234");
    for (let i = 0; i < 300; i++) {
      const r = await isolated.inject({
        url: "/api/me/games",
        headers: { cookie: "session=" + a.session },
      });
      expect(r.statusCode).toBe(200);
    }
    expect(
      (
        await isolated.inject({
          url: "/api/me/games",
          headers: { cookie: "session=" + b.session },
        })
      ).statusCode,
    ).toBe(200);
    const anotherSession = await login(db, "apiuser0", "test-password-1234");
    expect(
      (
        await isolated.inject({
          url: "/api/me/games",
          headers: { cookie: "session=" + anotherSession.session },
        })
      ).statusCode,
    ).toBe(429);
  } finally {
    await isolated.close();
  }
});

it("login attempts are rate limited before password verification", async () => {
  const isolated = createApp(db);
  try {
    for (let i = 0; i < 12; i++) {
      expect(
        (
          await isolated.inject({
            method: "POST",
            url: "/api/auth/login",
            headers: { origin: "http://127.0.0.1:5173" },
            payload: { username: "absent", password: "incorrect" },
          })
        ).statusCode,
      ).toBe(401);
    }
    const blocked = await isolated.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { origin: "http://127.0.0.1:5173" },
      payload: { username: "absent", password: "incorrect" },
    });
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json()).toEqual({ error: "RATE_LIMIT" });
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
  } finally {
    await isolated.close();
  }
});

it("room creation budget follows an account across sessions but allows other users", async () => {
  const isolated = createApp(db);
  const request = (actor: any) =>
    isolated.inject({
      method: "POST",
      url: "/api/rooms",
      headers: {
        origin: "http://127.0.0.1:5173",
        "x-csrf-token": actor.csrf,
        cookie: "session=" + actor.session,
      },
      payload: { seats: 99, visibility: "public" },
    });
  try {
    for (let i = 0; i < 12; i++)
      expect((await request(session)).statusCode).toBe(400);
    const another = await login(db, "apiuser0", "test-password-1234");
    const blocked = await request(another);
    expect(blocked.statusCode).toBe(429);
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
    expect((await request(outsider)).statusCode).toBe(400);
  } finally {
    await isolated.close();
  }
});

it("SSE admission rejects the ninth stream and recovers after close or denied membership", async () => {
  const isolated = createApp(db);
  const address = await isolated.listen({ host: "127.0.0.1", port: 0 });
  const requests: ClientRequest[] = [];
  const stream = (id: string) =>
    new Promise<{ status: number; request: ClientRequest }>(
      (resolve, reject) => {
        const request = get(
          address + "/api/games/" + id + "/events",
          { headers: { cookie: "session=" + session.session } },
          (res) => {
            res.resume();
            resolve({ status: res.statusCode!, request });
          },
        );
        requests.push(request);
        request.on("error", reject);
      },
    );
  try {
    for (let i = 0; i < 10; i++)
      expect((await stream(randomUUID())).status).toBe(403);
    const open = [];
    for (let i = 0; i < 8; i++) {
      const s = await stream(gameId);
      expect(s.status).toBe(200);
      open.push(s);
    }
    expect((await stream(gameId)).status).toBe(429);
    open[0].request.destroy();
    await expect
      .poll(async () => (await stream(gameId)).status, { interval: 50 })
      .toBe(200);
  } finally {
    for (const request of requests) request.destroy();
    await isolated.close();
  }
});
