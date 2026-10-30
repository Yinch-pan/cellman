import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool, migrate } from "../src/db/pool";
import { register, login } from "../src/auth/sessions";
import {
  createRoom,
  joinRoom,
  setReady,
  startRoom,
} from "../src/rooms/service";
import { getGame, submitCommand } from "../src/games/commands";
import { createApp } from "../src/app";
import { publicGames } from "../src/games/spectators";
import { draftOptions } from "../../../packages/rules/src/setup";
import { requestEnd, voteEnd } from "../src/games/end-requests";

const url = process.env.TEST_DATABASE_URL,
  schema = "watch_" + randomUUID().replaceAll("-", "");
const admin = new Pool({ connectionString: url }),
  db = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
const actors: string[] = [],
  app = createApp(db);
let created = false;
beforeAll(async () => {
  if (!url || url === process.env.DATABASE_URL)
    throw Error("Separate test database required");
  await admin.query(`CREATE SCHEMA ${schema}`);
  created = true;
  await migrate(db);
  for (let i = 0; i < 4; i++)
    actors.push(
      (
        await register(db, {
          username: `watchtest${i}`,
          password: "watch-test-password",
        })
      ).userId,
    );
  await app.ready();
});
afterAll(async () => {
  await app.close();
  await db.end();
  if (created) await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
});
async function game(visibility: "public" | "private", start = true) {
  const room = await createRoom(db, actors[0], {
    visibility,
    seats: 3,
    setupMode: "snake-forward",
    settings: { seatOrder: "seated", time: { mode: "paced", movesPerDay: 2 } },
  });
  if (!start) return { room, id: "" };
  for (const actor of actors.slice(1, 3))
    await joinRoom(db, actor, room.id, room.inviteToken);
  for (const actor of actors.slice(0, 3))
    await setReady(db, actor, room.id, true);
  return { room, id: (await startRoom(db, actors[0], room.id)).gameId };
}
const get = (url: string, cookie?: string) =>
  app.inject({ method: "GET", url, headers: cookie ? { cookie } : {} });
it("lists only ongoing public games and omits private invite tokens and account data", async () => {
  const publicGame = await game("public"),
    privateGame = await game("private");
  const waiting = await game("public", false);
  let response = await get("/api/public-games");
  expect(response.statusCode).toBe(200);
  expect(response.json().games.map((g: any) => g.id)).toContain(publicGame.id);
  expect(response.json().games.map((g: any) => g.id)).not.toContain(
    privateGame.id,
  );
  expect(response.body).not.toContain(privateGame.room.id);
  expect(response.body).not.toContain(waiting.room.id);
  for (const secret of [
    publicGame.room.inviteToken,
    privateGame.room.inviteToken,
    ...actors,
  ])
    expect(response.body).not.toContain(secret);
  const requestId = randomUUID();
  await requestEnd(db, actors[0], publicGame.id, {
    requestId,
    expectedRevision: 0,
    reason: "done",
  });
  for (const actor of actors.slice(1, 3))
    await voteEnd(db, actor, publicGame.id, { requestId, decision: "approve" });
  response = await get("/api/public-games");
  expect(response.json().games.map((g: any) => g.id)).not.toContain(
    publicGame.id,
  );
  expect((await get(`/api/watch/${publicGame.id}`)).json().state.status).toBe(
    "finished",
  );
});
it("anonymous and non-member viewers can read private links; only participants resolve a player seat", async () => {
  const { id, room } = await game("private");
  const before = (
    await db.query(
      "SELECT revision,clock,last_activity_at FROM games WHERE id=$1",
      [id],
    )
  ).rows[0];
  const guest = await get(`/api/watch/${id}`);
  expect(guest.statusCode).toBe(200);
  expect(guest.json().memberSeat).toBeNull();
  expect(guest.json().state.setup.id).toBe(id);
  expect(guest.body).not.toContain(room.inviteToken);
  for (const i of [0, 3]) {
    const auth = await login(db, `watchtest${i}`, "watch-test-password");
    expect(
      (await get(`/api/watch/${id}`, `session=${auth.session}`)).json()
        .memberSeat,
    ).toBe(i === 0 ? "p1" : null);
  }
  expect((await get(`/api/watch/${id}/history`)).statusCode).toBe(200);
  expect(
    (
      await db.query(
        "SELECT revision,clock,last_activity_at FROM games WHERE id=$1",
        [id],
      )
    ).rows[0],
  ).toEqual(before);
  expect(
    (
      await db.query(
        "SELECT count(*)::int n FROM game_members WHERE game_id=$1",
        [id],
      )
    ).rows[0].n,
  ).toBe(3);
  expect((await get(`/api/watch/${randomUUID()}`)).statusCode).toBe(404);
});
it("viewers cannot preview, command, vote, expel, or join a private preparation room using the game link", async () => {
  const { id, room } = await game("private"),
    auth = await login(db, "watchtest3", "watch-test-password");
  const headers = {
    origin: "http://127.0.0.1:5173",
    cookie: `session=${auth.session}`,
    "x-csrf-token": auth.csrf,
  };
  const payloads = {
    commands: {
      commandId: randomUUID(),
      expectedRevision: 0,
      action: { kind: "endTurn" },
    },
    preview: {
      commandId: randomUUID(),
      expectedRevision: 0,
      action: { kind: "endTurn" },
    },
    "undo/request": {
      requestId: randomUUID(),
      expectedRevision: 0,
      targetRevision: 0,
      reason: "x",
    },
    "undo/vote": { requestId: randomUUID(), decision: "approve" },
    "end/request": {
      requestId: randomUUID(),
      expectedRevision: 0,
      reason: "x",
    },
    "end/vote": { requestId: randomUUID(), decision: "approve" },
    adjudicate: { expectedRevision: 0, reason: "forfeit", target: "p1" },
  };
  for (const [path, payload] of Object.entries(payloads)) {
    const response = await app.inject({
      method: "POST",
      url: `/api/games/${id}/${path}`,
      headers,
      payload,
    });
    expect(response.statusCode, `${path}: ${response.body}`).toBe(403);
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/games/${id}/${path}`,
          headers: { origin: headers.origin },
          payload,
        })
      ).statusCode,
    ).toBe(401);
  }
  expect((await get(`/api/rooms/${room.id}`, headers.cookie)).statusCode).toBe(
    403,
  );
  expect((await get(`/api/games/${id}`, headers.cookie)).statusCode).toBe(403);
  expect((await get(`/api/games/${id}`)).statusCode).toBe(401);
  expect((await getGame(db, actors[0], id)).state.revision).toBe(0);
});
it("spectator history follows committed moves and bounds cursor reads", async () => {
  const { id } = await game("public");
  const { state } = await getGame(db, actors[0], id),
    seat = state.activeSeat;
  const category = (["faction", "native", "palace", "bonus"] as const).find(
    (c) => draftOptions(state, seat, c).length,
  )!;
  await submitCommand(db, actors[Number(seat.slice(1)) - 1], id, {
    commandId: randomUUID(),
    expectedRevision: 0,
    action: {
      kind: "draftPick",
      category,
      option: draftOptions(state, seat, category)[0],
    },
  });
  expect((await get(`/api/watch/${id}`)).json().state.revision).toBe(1);
  const logs = await get(`/api/watch/${id}/history?after=0`);
  expect(logs.json().map((r: any) => r.revision)).toEqual([1]);
  expect(logs.body).not.toContain("actor_id");
  expect((await get(`/api/watch/${id}/history?before=1`)).json()).toEqual([]);
  for (const query of ["after=-1", "before=0", "after=0&before=2", "after=abc"])
    expect((await get(`/api/watch/${id}/history?${query}`)).statusCode).toBe(
      400,
    );
  expect((await get("/api/public-games?page=-1")).statusCode).toBe(400);
});
it("public listing pagination is stable and capped at twenty games", async () => {
  // Each fixture remains a real started room; the count stays below the room cap.
  for (let i = 0; i < 21; i++) await game("public");
  const a = await publicGames(db, 0),
    b = await publicGames(db, 1);
  expect(a.games).toHaveLength(20);
  expect(a.hasMore).toBe(true);
  expect(b.games.length).toBeGreaterThan(0);
  expect(a.games.some((g) => b.games.some((other) => g.id === other.id))).toBe(
    false,
  );
});
