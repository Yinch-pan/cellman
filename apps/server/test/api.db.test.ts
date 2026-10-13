import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
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
