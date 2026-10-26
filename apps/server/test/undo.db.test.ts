import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool, migrate } from "../src/db/pool";
import { register } from "../src/auth/sessions";
import {
  createRoom,
  joinRoom,
  setReady,
  startRoom,
} from "../src/rooms/service";
import { getGame, getReplay, submitCommand } from "../src/games/commands";
import { requestUndo, voteUndo, undoRequests } from "../src/games/undo";
import { replayRecord } from "../../../packages/rules/src/replay";
import { playerStats, siteStats } from "../src/games/stats";
const url = process.env.TEST_DATABASE_URL;
const schema = "undo_" + randomUUID().replaceAll("-", "");
const admin = new Pool({ connectionString: url });
const db = new Pool({
  connectionString: url,
  options: `-c search_path=${schema}`,
});
const actors: string[] = [];
let created = false;
beforeAll(async () => {
  if (!url || url === process.env.DATABASE_URL)
    throw Error("Separate test database required");
  await admin.query(`CREATE SCHEMA ${schema}`);
  created = true;
  await migrate(db);
  for (let i = 0; i < 5; i++)
    actors.push(
      (
        await register(db, {
          username: `undo${i}`,
          password: "undo-test-password",
        })
      ).userId,
    );
});
afterAll(async () => {
  await db.end();
  if (created) await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
});
async function game() {
  const room = await createRoom(db, actors[0], {
    visibility: "public",
    seats: 4,
    setupMode: "standard",
  });
  for (const actor of actors.slice(1, 4)) await joinRoom(db, actor, room.id);
  for (const actor of actors.slice(0, 4))
    await setReady(db, actor, room.id, true);
  return (await startRoom(db, actors[0], room.id)).gameId;
}
async function move(id: string) {
  const { state } = await getGame(db, actors[0], id);
  const actor = actors[Number(state.activeSeat.slice(1)) - 1];
  const command = {
    commandId: randomUUID(),
    expectedRevision: state.revision,
    action: { kind: "chooseSetup" as const, offer: state.revision },
  };
  await submitCommand(db, actor, id, command);
  return { actor, command };
}
it("atomic turn rejects invalid children without writes; concurrent submissions and retries publish only once", async () => {
  const id = await game();
  const s = (await getGame(db, actors[0], id)).state;
  s.phase = "actions";
  s.activeSeat = "p1";
  s.pending = [];
  s.players.p1.resources.power = [0, 0, 12];
  await db.query("UPDATE games SET state=$1, initial_state=$1 WHERE id=$2", [
    JSON.stringify(s),
    id,
  ]);
  const invalid = {
    commandId: randomUUID(),
    expectedRevision: 0,
    action: {
      kind: "turn" as const,
      actions: [
        { kind: "powerAction" as const, id: "coins" },
        {
          kind: "convert" as const,
          from: "tool" as const,
          to: "coin" as const,
          count: 999,
        },
        { kind: "endTurn" as const },
      ],
    },
  };
  await expect(submitCommand(db, actors[0], id, invalid)).rejects.toMatchObject(
    { code: "INSUFFICIENT_RESOURCES" },
  );
  expect((await getGame(db, actors[0], id)).state).toEqual(s);
  expect(
    (
      await db.query(
        "SELECT count(*)::int AS n FROM game_commands WHERE game_id=$1",
        [id],
      )
    ).rows[0].n,
  ).toBe(0);
  const command = {
    ...invalid,
    commandId: randomUUID(),
    action: {
      kind: "turn" as const,
      actions: [
        { kind: "powerAction" as const, id: "coins" },
        { kind: "endTurn" as const },
      ],
    },
  };
  const other = { ...command, commandId: randomUUID() };
  const results = await Promise.allSettled([
    submitCommand(db, actors[0], id, command),
    submitCommand(db, actors[0], id, other),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const winner = results[0].status === "fulfilled" ? command : other;
  await submitCommand(db, actors[0], id, winner);
  const done = (await getGame(db, actors[1], id)).state;
  expect(done.revision).toBe(1);
  expect(done.players.p1.resources.coins).toBe(
    s.players.p1.resources.coins + 7,
  );
  expect(replayRecord(await getReplay(db, actors[0], id)).state).toEqual(done);
  const input = {
    requestId: randomUUID(),
    expectedRevision: 1,
    targetRevision: 0,
    reason: "撤回整组已提交行动",
  };
  await requestUndo(db, actors[0], id, input);
  for (const actor of actors.slice(0, 4))
    await voteUndo(db, actor, id, {
      requestId: input.requestId,
      decision: "approve",
    });
  const restored = (await getGame(db, actors[0], id)).state;
  expect({ ...restored, revision: 0 }).toEqual(s);
});
it("four unanimous voters restore dependent moves atomically; retries, history, reconnect and replay remain correct", async () => {
  const id = await game();
  const initial = (await getGame(db, actors[0], id)).state;
  const first = await move(id);
  await move(id);
  const input = {
    requestId: randomUUID(),
    expectedRevision: 2,
    targetRevision: 0,
    reason: "误选组合",
  };
  await expect(
    requestUndo(
      db,
      actors.find((a) => a !== first.actor)!,
      id,
      input,
    ),
  ).rejects.toMatchObject({
    code: "INVALID_UNDO_TARGET",
  });
  await expect(requestUndo(db, actors[4], id, input)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  await requestUndo(db, first.actor, id, input);
  await requestUndo(db, first.actor, id, input);
  await expect(
    submitCommand(db, actors[1], id, {
      commandId: randomUUID(),
      expectedRevision: 2,
      action: { kind: "chooseSetup", offer: 2 },
    }),
  ).rejects.toMatchObject({ code: "UNDO_PENDING" });
  expect((await getGame(db, actors[0], id)).state.revision).toBe(2);
  await expect(
    voteUndo(db, actors[4], id, {
      requestId: input.requestId,
      decision: "approve",
    }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await Promise.all(
    actors.slice(0, 4).map((actor) =>
      voteUndo(db, actor, id, {
        requestId: input.requestId,
        decision: "approve",
      }),
    ),
  );
  const restored = (await getGame(db, actors[0], id)).state;
  expect(restored).toEqual({ ...initial, revision: 3 });
  expect((await undoRequests(db, id))[0].status).toBe("applied");
  await voteUndo(
    db,
    actors.find((a) => a !== first.actor)!,
    id,
    {
      requestId: input.requestId,
      decision: "approve",
    },
  );
  await submitCommand(db, first.actor, id, first.command); // late retry cannot replay the old action
  expect((await getGame(db, actors[0], id)).state.revision).toBe(3);
  await migrate(db);
  const record = await getReplay(db, actors[0], id);
  expect(record.commands).toHaveLength(3);
  expect(record.format).toBe("yijian-replay-v2");
  expect(record.undoRequests[0]).toMatchObject({
    reason: "误选组合",
    status: "applied",
    votes: { p1: true, p2: true, p3: true, p4: true },
  });
  expect(replayRecord(record).state).toEqual(restored);
  expect(
    (await db.query("SELECT * FROM game_events WHERE game_id=$1", [id]))
      .rowCount,
  ).toBe(3);
  await expect(
    submitCommand(db, first.actor, id, {
      ...first.command,
      commandId: randomUUID(),
    }),
  ).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
  await submitCommand(db, first.actor, id, {
    ...first.command,
    commandId: randomUUID(),
    expectedRevision: 3,
  });
  expect(replayRecord(await getReplay(db, actors[0], id)).state).toEqual(
    (await getGame(db, actors[0], id)).state,
  );
});
it("a rejection or requester cancellation unfreezes play and never changes the board", async () => {
  const id = await game();
  const first = await move(id);
  for (const decision of ["reject", "cancel"] as const) {
    const input = {
      requestId: randomUUID(),
      expectedRevision: 1,
      targetRevision: 0,
      reason: decision,
    };
    await requestUndo(db, first.actor, id, input);
    await expect(
      voteUndo(
        db,
        actors.find((a) => a !== first.actor)!,
        id,
        {
          requestId: input.requestId,
          decision: "cancel",
        },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await voteUndo(db, decision === "cancel" ? first.actor : actors[0], id, {
      requestId: input.requestId,
      decision,
    });
    expect((await getGame(db, actors[0], id)).state.revision).toBe(1);
  }
  await move(id);
});
it("statistics use all finished games, split tied wins, exclude pending undo and recompute after restore", async () => {
  const id = await game();
  const first = await move(id);
  const state = (await getGame(db, actors[0], id)).state;
  state.status = "finished";
  state.scores = ["p1", "p2", "p3", "p4"].map((seat, i) => ({
    seat,
    total: i < 2 ? 100 : 80,
    items: [],
  }));
  await db.query("UPDATE games SET state=$1 WHERE id=$2", [
    JSON.stringify(state),
    id,
  ]);
  const mine = await playerStats(db, actors[0]);
  expect(mine.count).toBe(1);
  expect(mine.winRate).toBe(50);
  expect((await siteStats(db, 3)).count).toBe(0);
  expect((await siteStats(db, 4)).positions).toHaveLength(4);
  const input = {
    requestId: randomUUID(),
    expectedRevision: 1,
    targetRevision: 0,
    reason: "终局复核",
  };
  await requestUndo(db, first.actor, id, input);
  expect((await playerStats(db, actors[0])).count).toBe(0);
  for (const actor of actors.slice(0, 4))
    await voteUndo(db, actor, id, {
      requestId: input.requestId,
      decision: "approve",
    });
  expect((await playerStats(db, actors[0])).count).toBe(0);
  await db.query("UPDATE games SET state=$1,stats_eligible=false WHERE id=$2", [
    JSON.stringify(state),
    id,
  ]);
  expect((await siteStats(db)).count).toBe(1);
  expect((await playerStats(db, actors[0])).count).toBe(1);
});
