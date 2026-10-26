import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool, migrate } from "../src/db/pool";
import { register, login } from "../src/auth/sessions";
import { createApp } from "../src/app";
import {
  createRoom,
  joinRoom,
  leaveRoom,
  manageRoom,
  roomView,
  setReady,
  startRoom,
} from "../src/rooms/service";
import { getGame, submitCommand } from "../src/games/commands";
import { requestUndo, voteUndo } from "../src/games/undo";

const url = process.env.TEST_DATABASE_URL;
const schema = "participation_" + randomUUID().replaceAll("-", "");
const admin = new Pool({ connectionString: url });
const db = new Pool({
  connectionString: url,
  options: `-c search_path=${schema}`,
});
const app = createApp(db);
const base = {
  visibility: "public" as const,
  seats: 3,
  setupMode: "standard" as const,
};
let created = false,
  host: string,
  sequence = 0;
async function player() {
  const username = "roomlimit" + sequence++;
  const { userId } = await register(db, {
    username,
    password: "room-limit-test",
  });
  return { userId, username };
}
beforeAll(async () => {
  if (!url || url === process.env.DATABASE_URL)
    throw Error("Separate test database required");
  await admin.query(`CREATE SCHEMA ${schema}`);
  created = true;
  await migrate(db);
  host = (await player()).userId;
  await app.ready();
});
afterAll(async () => {
  await app.close();
  await db.end();
  if (created) await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
});

// Bulk fixtures avoid making 100 HTTP requests merely to reach a boundary.
// The boundary operations themselves go through the real service/API.
async function seed(actor: string, count: number, status = "waiting") {
  const ids = Array.from({ length: count }, () => randomUUID());
  await db.query(
    `INSERT INTO rooms(id,host_id,visibility,capacity,invite_hash,status)
     SELECT id,$1,'public',3,'fixture',$3 FROM unnest($2::text[]) AS id`,
    [actor, ids, status],
  );
  await db.query(
    "INSERT INTO room_seats(room_id,user_id,position) SELECT id,$1,1 FROM unnest($2::text[]) AS id",
    [actor, ids],
  );
  return ids;
}
async function membershipCount(actor: string) {
  return (
    await db.query(
      "SELECT count(*)::int AS n FROM room_seats WHERE user_id=$1",
      [actor],
    )
  ).rows[0].n;
}

it("allows room 100, rejects room 101 through HTTP, and leaves no orphan room", async () => {
  const { userId, username } = await player();
  await seed(userId, 99);
  const session = await login(db, username, "room-limit-test");
  const headers = {
    origin: "http://127.0.0.1:5173",
    cookie: "session=" + session.session,
    "x-csrf-token": session.csrf,
  };
  const allowed = await app.inject({
    method: "POST",
    url: "/api/rooms",
    headers,
    payload: base,
  });
  expect(allowed.statusCode).toBe(200);
  const denied = await app.inject({
    method: "POST",
    url: "/api/rooms",
    headers,
    payload: base,
  });
  expect(denied.statusCode).toBe(409);
  expect(denied.json()).toMatchObject({
    error: "ROOM_PARTICIPATION_LIMIT",
  });
  expect(await membershipCount(userId)).toBe(100);
  expect(
    (
      await db.query("SELECT count(*)::int AS n FROM rooms WHERE host_id=$1", [
        userId,
      ])
    ).rows[0].n,
  ).toBe(100);
  const target = await createRoom(db, host, base);
  const join = await app.inject({
    method: "POST",
    url: `/api/rooms/${target.id}/join`,
    headers,
    payload: {},
  });
  expect(join.statusCode).toBe(409);
  expect(join.json()).toMatchObject({
    error: "ROOM_PARTICIPATION_LIMIT",
  });
});

it.each(["public", "private"] as const)(
  "joining %s rooms shares the creation quota and retrying an existing seat is allowed",
  async (visibility) => {
    const { userId } = await player();
    await seed(userId, 99);
    const room = await createRoom(db, host, { ...base, visibility });
    const joined = await joinRoom(db, userId, room.id, room.inviteToken);
    expect(await membershipCount(userId)).toBe(100);
    await expect(createRoom(db, userId, base)).rejects.toMatchObject({
      code: "ROOM_PARTICIPATION_LIMIT",
    });
    const retry = await joinRoom(db, userId, room.id);
    expect(retry.settingsRevision).toBe(joined.settingsRevision);
    expect(retry.seats).toHaveLength(2);
    const other = await createRoom(db, host, { ...base, visibility });
    await expect(
      joinRoom(db, userId, other.id, other.inviteToken),
    ).rejects.toMatchObject({ code: "ROOM_PARTICIPATION_LIMIT" });
    expect((await roomView(db, host, other.id)).settingsRevision).toBe(
      other.settingsRevision,
    );
    await leaveRoom(db, userId, room.id);
    await joinRoom(db, userId, other.id, other.inviteToken);
    const view = await roomView(db, host, other.id);
    await manageRoom(
      db,
      host,
      other.id,
      { kind: "kick", userId },
      view.settingsRevision,
    );
    await createRoom(db, userId, base);
    expect(await membershipCount(userId)).toBe(100);
  },
);

it("started games retain their slot; finishing and closed rooms release it without deleting history", async () => {
  const { userId } = await player(),
    second = (await player()).userId;
  await seed(userId, 99);
  const room = await createRoom(db, userId, base);
  for (const actor of [host, second]) await joinRoom(db, actor, room.id);
  for (const actor of [userId, host, second])
    await setReady(db, actor, room.id, true);
  const { gameId } = await startRoom(db, userId, room.id);
  await expect(createRoom(db, userId, base)).rejects.toMatchObject({
    code: "ROOM_PARTICIPATION_LIMIT",
  });
  await seed(userId, 5, "closed");
  await db.query(
    "UPDATE games SET state=jsonb_set(state,'{status}','\"finished\"') WHERE id=$1",
    [gameId],
  );
  await createRoom(db, userId, base);
  expect(await membershipCount(userId)).toBe(106);
  await expect(createRoom(db, userId, base)).rejects.toMatchObject({
    code: "ROOM_PARTICIPATION_LIMIT",
  });
  expect(
    (await db.query("SELECT game_id FROM rooms WHERE id=$1", [room.id])).rows[0]
      .game_id,
  ).toBe(gameId);
});

it.each(["create/create", "join/join", "create/join"])(
  "concurrent %s requests cannot consume the last slot twice",
  async (mode) => {
    const { userId } = await player();
    await seed(userId, 99);
    const targets = await Promise.all([
      createRoom(db, host, base),
      createRoom(db, host, base),
    ]);
    const results = await Promise.allSettled(
      mode
        .split("/")
        .map((action, i) =>
          action === "create"
            ? createRoom(db, userId, base)
            : joinRoom(db, userId, targets[i].id),
        ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({
      reason: { code: "ROOM_PARTICIPATION_LIMIT" },
    });
    expect(await membershipCount(userId)).toBe(100);
  },
);

it("legacy accounts over the limit can leave and resume creating after falling below 100", async () => {
  const { userId } = await player();
  const ids = await seed(userId, 101);
  await expect(createRoom(db, userId, base)).rejects.toMatchObject({
    code: "ROOM_PARTICIPATION_LIMIT",
  });
  await leaveRoom(db, userId, ids[0]);
  await expect(createRoom(db, userId, base)).rejects.toMatchObject({
    code: "ROOM_PARTICIPATION_LIMIT",
  });
  await leaveRoom(db, userId, ids[1]);
  await createRoom(db, userId, base);
  expect(await membershipCount(userId)).toBe(100);
});

it("undo cannot reopen a finished game beyond any participant's quota; freeing a slot permits retry", async () => {
  const actors = [
    (await player()).userId,
    (await player()).userId,
    (await player()).userId,
  ];
  const room = await createRoom(db, actors[0], base);
  for (const actor of actors.slice(1)) await joinRoom(db, actor, room.id);
  for (const actor of actors) await setReady(db, actor, room.id, true);
  const { gameId } = await startRoom(db, actors[0], room.id);
  const { state } = await getGame(db, actors[0], gameId);
  const mover = actors[Number(state.activeSeat.slice(1)) - 1];
  await submitCommand(db, mover, gameId, {
    commandId: randomUUID(),
    expectedRevision: 0,
    action: { kind: "chooseSetup", offer: 0 },
  });
  await db.query(
    "UPDATE games SET state=jsonb_set(state,'{status}','\"finished\"') WHERE id=$1",
    [gameId],
  );
  const fullActor = actors.find((a) => a !== mover)!;
  const ids = await seed(fullActor, 100);
  const requestId = randomUUID();
  await requestUndo(db, mover, gameId, {
    requestId,
    expectedRevision: 1,
    targetRevision: 0,
    reason: "quota acceptance",
  });
  const voters = actors.filter((a) => a !== mover);
  await voteUndo(db, voters[0], gameId, { requestId, decision: "approve" });
  await expect(
    voteUndo(db, voters[1], gameId, { requestId, decision: "approve" }),
  ).rejects.toMatchObject({ code: "ROOM_REOPEN_LIMIT" });
  expect((await getGame(db, mover, gameId)).state).toMatchObject({
    status: "finished",
    revision: 1,
  });
  await leaveRoom(db, fullActor, ids[0]);
  await voteUndo(db, voters[1], gameId, { requestId, decision: "approve" });
  expect((await getGame(db, mover, gameId)).state).toMatchObject({
    status: "active",
    revision: 2,
  });
  await expect(createRoom(db, fullActor, base)).rejects.toMatchObject({
    code: "ROOM_PARTICIPATION_LIMIT",
  });
});
