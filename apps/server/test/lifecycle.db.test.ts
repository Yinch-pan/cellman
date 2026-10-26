import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool, migrate } from "../src/db/pool";
import { register, login } from "../src/auth/sessions";
import {
  createRoom,
  joinRoom,
  setReady,
  startRoom,
} from "../src/rooms/service";
import { getGame, getReplay, submitCommand } from "../src/games/commands";
import {
  adjudicateGame,
  maintainGame,
  sweepGames,
  INACTIVE_MS,
} from "../src/games/lifecycle";
import { playerStats } from "../src/games/stats";
import { requestUndo, voteUndo } from "../src/games/undo";
import { createApp } from "../src/app";
import { replayRecord } from "../../../packages/rules/src/replay";
import { draftOptions } from "../../../packages/rules/src/setup";

const url = process.env.TEST_DATABASE_URL,
  schema = "lifecycle_" + randomUUID().replaceAll("-", "");
const admin = new Pool({ connectionString: url }),
  db = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
const actors: string[] = [];
let created = false;
const app = createApp(db);
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
          username: `lifetest${i}`,
          password: "lifecycle-test-password",
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
async function game() {
  const room = await createRoom(db, actors[0], {
    visibility: "private",
    seats: 3,
    setupMode: "snake-forward",
    settings: { time: { mode: "paced", movesPerDay: 2 }, seatOrder: "seated" },
  });
  for (const actor of actors.slice(1, 3))
    await joinRoom(db, actor, room.id, room.inviteToken);
  for (const actor of actors.slice(0, 3))
    await setReady(db, actor, room.id, true);
  return (await startRoom(db, actors[0], room.id)).gameId;
}
async function late(id: string, target = "p1") {
  await db.query(
    "UPDATE games SET clock=jsonb_set(clock,'{at}',to_jsonb($2::bigint)),last_activity_at=now() WHERE id=$1",
    [id, Date.now() - 25 * 3600000],
  );
  expect(
    (await getGame(db, actors[0], id)).clock!.remaining[target],
  ).toBeLessThan(0);
}
async function pick(id: string) {
  const { state } = await getGame(db, actors[0], id),
    seat = state.activeSeat;
  const category = (["faction", "native", "palace", "bonus"] as const).find(
    (c) => draftOptions(state, seat, c).length,
  )!;
  const command = {
    commandId: randomUUID(),
    expectedRevision: state.revision,
    action: {
      kind: "draftPick" as const,
      category,
      option: draftOptions(state, seat, category)[0],
    },
  };
  return { actor: actors[Number(seat.slice(1)) - 1], command };
}
it("only eligible opponents may expel; simultaneous requests settle once; removed player cannot play or undo", async () => {
  const id = await game();
  await expect(
    adjudicateGame(db, actors[3], id, {
      expectedRevision: 0,
      reason: "forfeit",
      target: "p1",
    }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(
    adjudicateGame(db, actors[1], id, {
      expectedRevision: 0,
      reason: "forfeit",
      target: "p1",
    }),
  ).rejects.toMatchObject({ code: "PLAYER_NOT_OVERDUE" });
  await late(id);
  await expect(
    adjudicateGame(db, actors[0], id, {
      expectedRevision: 0,
      reason: "forfeit",
      target: "p1",
    }),
  ).rejects.toMatchObject({ code: "INVALID_TIMEOUT_TARGET" });
  const attempts = await Promise.allSettled(
    [1, 2].map((i) =>
      adjudicateGame(db, actors[i], id, {
        expectedRevision: 0,
        reason: "forfeit",
        target: "p1",
      }),
    ),
  );
  expect(attempts.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const { state, clock } = await getGame(db, actors[0], id);
  expect(state.matchResult).toMatchObject({
    reason: "forfeit",
    loser: "p1",
    winners: ["p2", "p3"],
  });
  expect(state.activeSeat).toBe("p2");
  expect(clock!.running).toEqual([]);
  expect(replayRecord(await getReplay(db, actors[0], id)).state).toEqual(state);
  await expect(
    submitCommand(db, actors[0], id, {
      commandId: randomUUID(),
      expectedRevision: state.revision,
      action: { kind: "setLeech", enabled: false, maxVpCost: 0 },
    }),
  ).rejects.toMatchObject({ code: "PLAYER_REMOVED" });
  await expect(
    requestUndo(db, actors[1], id, {
      requestId: randomUUID(),
      expectedRevision: state.revision,
      targetRevision: 0,
      reason: "undo",
    }),
  ).rejects.toMatchObject({ code: "RESULT_ALREADY_SETTLED" });
  const stats = await playerStats(db, actors[0]),
    winner = await playerStats(db, actors[1]);
  expect(stats.games.find((g) => g.id === id)).toMatchObject({
    rank: 3,
    score: null,
    forfeited: true,
  });
  expect(winner.games.find((g) => g.id === id)).toMatchObject({
    rank: 1,
    winShare: 0.5,
  });
  const move = await pick(id);
  await submitCommand(db, move.actor, id, move.command);
  const next = await getGame(db, actors[1], id);
  await adjudicateGame(db, actors[1], id, {
    reason: "close",
    expectedRevision: next.state.revision,
  });
  expect(
    (await playerStats(db, actors[1])).games.find((g) => g.id === id),
  ).toEqual(winner.games.find((g) => g.id === id));
  expect(replayRecord(await getReplay(db, actors[0], id)).state).toEqual(
    (await getGame(db, actors[0], id)).state,
  );
});
it("returning before removal adds time but retains one timeout per game", async () => {
  const id = await game();
  await late(id);
  const { actor, command } = await pick(id);
  await submitCommand(db, actor, id, command);
  expect(
    (await getGame(db, actors[0], id)).clock!.remaining.p1,
  ).toBeGreaterThan(0);
  await submitCommand(db, actor, id, command);
  expect(
    (await db.query("SELECT * FROM game_timeouts WHERE game_id=$1", [id]))
      .rowCount,
  ).toBe(1);
  await expect(
    adjudicateGame(db, actors[1], id, {
      reason: "forfeit",
      target: "p1",
      expectedRevision: 1,
    }),
  ).rejects.toMatchObject({ code: "PLAYER_NOT_OVERDUE" });
});
it("a more overdue player cannot expel, and pause prevents expulsion", async () => {
  const id = await game();
  await late(id);
  await db.query(
    "UPDATE games SET clock=jsonb_set(clock,'{remaining,p2}','-99999999') WHERE id=$1",
    [id],
  );
  await expect(
    adjudicateGame(db, actors[1], id, {
      reason: "forfeit",
      target: "p1",
      expectedRevision: 0,
    }),
  ).rejects.toMatchObject({ code: "OWN_CLOCK_WORSE" });
  await db.query(
    "UPDATE games SET clock=jsonb_set(clock,'{paused}','true') WHERE id=$1",
    [id],
  );
  await expect(
    adjudicateGame(db, actors[2], id, {
      reason: "forfeit",
      target: "p1",
      expectedRevision: 0,
    }),
  ).rejects.toMatchObject({ code: "CLOCK_PAUSED" });
});
it("10-day boundary is wall time, survives restarts, and repeated sweeps do not duplicate results", async () => {
  const id = await game(),
    now = Date.now(),
    start = now - INACTIVE_MS;
  await db.query(
    "UPDATE games SET last_activity_at=$2,clock=jsonb_set(clock,'{paused}','true') WHERE id=$1",
    [id, new Date(start)],
  );
  expect(await maintainGame(db, id, now - 1)).toBeNull();
  const notices: string[] = [];
  await sweepGames(db, (gameId) => notices.push(gameId), now);
  expect(notices).toContain(id);
  await sweepGames(db, () => {}, now + 60000);
  const state = (await getGame(db, actors[0], id)).state;
  expect(state).toMatchObject({
    status: "finished",
    matchResult: { reason: "inactive", winners: [] },
  });
  expect(state.revision).toBe(1);
  expect(replayRecord(await getReplay(db, actors[0], id)).state).toEqual(state);
  expect(
    (await playerStats(db, actors[0])).games.find((g) => g.id === id),
  ).toMatchObject({ rank: null, score: null, winShare: 0, reason: "inactive" });
  await expect(
    submitCommand(db, actors[0], id, {
      commandId: randomUUID(),
      expectedRevision: 1,
      action: { kind: "setLeech", enabled: false, maxVpCost: 0 },
    }),
  ).rejects.toMatchObject({ code: "GAME_FINISHED" });
});
it("reads, preferences and undo votes do not postpone the deadline; committed moves do", async () => {
  const id = await game(),
    earlier = new Date(Date.now() - 9 * 86400000);
  await db.query("UPDATE games SET last_activity_at=$2 WHERE id=$1", [
    id,
    earlier,
  ]);
  for (let i = 0; i < 2; i++) await getGame(db, actors[0], id);
  await submitCommand(db, actors[0], id, {
    commandId: randomUUID(),
    expectedRevision: 0,
    action: { kind: "setLeech", enabled: false, maxVpCost: 0 },
  });
  expect(
    new Date(
      (await db.query("SELECT last_activity_at FROM games WHERE id=$1", [id]))
        .rows[0].last_activity_at,
    ),
  ).toEqual(earlier);
  const { actor, command } = await pick(id);
  await submitCommand(db, actor, id, command);
  const saved = (
    await db.query("SELECT last_activity_at FROM games WHERE id=$1", [id])
  ).rows[0].last_activity_at;
  expect(new Date(saved).getTime()).toBeGreaterThan(earlier.getTime());
  const requestId = randomUUID();
  await requestUndo(db, actor, id, {
    requestId,
    expectedRevision: 2,
    targetRevision: 1,
    reason: "test",
  });
  await voteUndo(db, actors[1], id, { requestId, decision: "reject" });
  expect(
    (await db.query("SELECT last_activity_at FROM games WHERE id=$1", [id]))
      .rows[0].last_activity_at,
  ).toEqual(saved);
  await db.query("UPDATE games SET last_activity_at=$2 WHERE id=$1", [
    id,
    new Date(Date.now() - INACTIVE_MS - 100),
  ]);
  await expect(
    submitCommand(db, actor, id, {
      ...command,
      commandId: randomUUID(),
      expectedRevision: 2,
    }),
  ).rejects.toMatchObject({ code: "GAME_FINISHED" });
});
it("inactivity cancels outstanding undo and preserves already settled forfeit results", async () => {
  const id = await game(),
    move = await pick(id);
  await submitCommand(db, move.actor, id, move.command);
  const requestId = randomUUID();
  await requestUndo(db, move.actor, id, {
    requestId,
    expectedRevision: 1,
    targetRevision: 0,
    reason: "test",
  });
  await maintainGame(db, id, Date.now() + INACTIVE_MS + 1000);
  expect(
    (
      await db.query("SELECT status FROM game_undo_requests WHERE game_id=$1", [
        id,
      ])
    ).rows[0].status,
  ).toBe("cancelled");
  await voteUndo(db, actors[1], id, { requestId, decision: "approve" });
  expect((await getGame(db, actors[0], id)).state.matchResult?.reason).toBe(
    "inactive",
  );
  const other = await game();
  await late(other);
  await adjudicateGame(db, actors[1], other, {
    reason: "forfeit",
    target: "p1",
    expectedRevision: 0,
  });
  const result = (await getGame(db, actors[0], other)).state.matchResult;
  await maintainGame(db, other, Date.now() + INACTIVE_MS + 1000);
  expect((await getGame(db, actors[0], other)).state.matchResult).toEqual(
    result,
  );
});
it("migration is idempotent and HTTP cannot inject system adjudications", async () => {
  const id = await game(),
    before = (await getGame(db, actors[0], id)).inactiveDeadline;
  await db.query(
    await readFile(
      new URL("../migrations/010-game-lifecycle.sql", import.meta.url),
      "utf8",
    ),
  );
  expect((await getGame(db, actors[0], id)).inactiveDeadline).toBe(before);
  const auth = await login(db, "lifetest0", "lifecycle-test-password");
  const response = await app.inject({
    method: "POST",
    url: `/api/games/${id}/commands`,
    headers: {
      origin: "http://127.0.0.1:5173",
      cookie: `session=${auth.session}`,
      "x-csrf-token": auth.csrf,
    },
    payload: {
      commandId: randomUUID(),
      expectedRevision: 0,
      action: {
        kind: "adjudicate",
        reason: "inactive",
        at: new Date().toISOString(),
      },
    },
  });
  expect(response.statusCode).toBe(400);
});
