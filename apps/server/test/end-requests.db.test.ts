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
import { getGame, getReplay, submitCommand } from "../src/games/commands";
import { requestEnd, voteEnd, endRequests } from "../src/games/end-requests";
import { requestUndo } from "../src/games/undo";
import { maintainGame, INACTIVE_MS } from "../src/games/lifecycle";
import { playerStats, siteStats } from "../src/games/stats";
import { createApp } from "../src/app";
import { draftOptions } from "../../../packages/rules/src/setup";
import { replayRecord } from "../../../packages/rules/src/replay";

const url = process.env.TEST_DATABASE_URL,
  schema = "consensus_" + randomUUID().replaceAll("-", "");
const admin = new Pool({ connectionString: url }),
  db = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
const actors: string[] = [];
const app = createApp(db);
let created = false;
beforeAll(async () => {
  if (!url || url === process.env.DATABASE_URL)
    throw Error("Separate test database required");
  await admin.query(`CREATE SCHEMA ${schema}`);
  created = true;
  await migrate(db);
  for (let i = 0; i < 6; i++)
    actors.push(
      (
        await register(db, {
          username: `consent${i}`,
          password: "consensus-test-password",
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
async function game(n = 3) {
  const room = await createRoom(db, actors[0], {
    visibility: "private",
    seats: n as 3 | 4 | 5,
    setupMode: "snake-forward",
    settings: { time: { mode: "paced", movesPerDay: 2 }, seatOrder: "seated" },
  });
  for (const actor of actors.slice(1, n))
    await joinRoom(db, actor, room.id, room.inviteToken);
  for (const actor of actors.slice(0, n))
    await setReady(db, actor, room.id, true);
  return (await startRoom(db, actors[0], room.id)).gameId;
}
const input = (revision = 0) => ({
  requestId: randomUUID(),
  expectedRevision: revision,
  reason: "大家同意重开",
});
const vote = (
  id: string,
  actor: number,
  requestId: string,
  decision: "approve" | "reject" | "cancel" = "approve",
) => voteEnd(db, actors[actor], id, { requestId, decision });
async function saved(id: string) {
  return (
    await db.query("SELECT clock,last_activity_at FROM games WHERE id=$1", [id])
  ).rows[0];
}
async function move(id: string) {
  const { state } = await getGame(db, actors[0], id),
    seat = state.activeSeat;
  const category = (["faction", "native", "palace", "bonus"] as const).find(
    (c) => draftOptions(state, seat, c).length,
  )!;
  return {
    actor: actors[Number(seat.slice(1)) - 1],
    command: {
      commandId: randomUUID(),
      expectedRevision: state.revision,
      action: {
        kind: "draftPick" as const,
        category,
        option: draftOptions(state, seat, category)[0],
      },
    },
  };
}
for (const n of [3, 4, 5])
  it(`${n} players: unanimous votes settle exactly once, preserve replay and exclude scores/wins`, async () => {
    const id = await game(n),
      proposal = input(),
      before = await saved(id);
    const statsBefore = await playerStats(db, actors[0]);
    // A guest can propose. Their explicit proposal counts as their own approval.
    await requestEnd(db, actors[1], id, proposal);
    expect((await endRequests(db, id))[0].votes).toEqual({ p2: true });
    expect(await requestEnd(db, actors[1], id, proposal)).toMatchObject({
      status: "pending",
      revision: 0,
    });
    await expect(
      requestEnd(db, actors[1], id, { ...proposal, reason: "changed" }),
    ).rejects.toMatchObject({ code: "COMMAND_REUSE" });
    await vote(id, 0, proposal.requestId);
    expect((await getGame(db, actors[0], id)).state.status).not.toBe(
      "finished",
    );
    expect(await saved(id)).toEqual(before);
    const finalVoters = Array.from({ length: n - 2 }, (_, i) => i + 2);
    await Promise.all(
      [...finalVoters, ...finalVoters].map((i) =>
        vote(id, i, proposal.requestId),
      ),
    );
    const { state, clock } = await getGame(db, actors[0], id);
    expect(state.revision).toBe(1);
    expect(state.status).toBe("finished");
    expect(state.matchResult).toMatchObject({
      reason: "consensus",
      winners: [],
    });
    expect(state.scores).toEqual([]);
    expect(state.pending).toEqual([]);
    expect(clock?.running).toEqual([]);
    const replay = await getReplay(db, actors[0], id);
    expect(replayRecord(replay).state).toEqual(state);
    expect(replay.commands).toHaveLength(1);
    expect(replay.endRequests[0].status).toBe("applied");
    expect((await endRequests(db, id))[0].applied_revision).toBe(1);
    await expect(
      requestUndo(db, actors[0], id, { ...input(1), targetRevision: 0 }),
    ).rejects.toMatchObject({ code: "RESULT_ALREADY_SETTLED" });
    const stats = await playerStats(db, actors[0]);
    expect(stats.games.find((g) => g.id === id)).toMatchObject({
      score: null,
      rank: null,
      winShare: 0,
      reason: "consensus",
    });
    expect(stats.winRate).toBe(statsBefore.winRate);
    expect(stats.wins).toBe(statsBefore.wins);
    expect(stats.consensual).toBe(statsBefore.consensual + 1);
    expect((await siteStats(db)).consensual).toBeGreaterThan(0);
  });
it("outsiders, stale requests, concurrent proposals and unauthorized withdrawal are blocked", async () => {
  const id = await game(),
    p = input();
  await expect(requestEnd(db, actors[5], id, p)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  await expect(requestEnd(db, actors[0], id, input(9))).rejects.toMatchObject({
    code: "REVISION_CONFLICT",
  });
  await requestEnd(db, actors[0], id, p);
  await expect(vote(id, 5, p.requestId)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  await expect(vote(id, 1, p.requestId, "cancel")).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  await expect(requestEnd(db, actors[1], id, input())).rejects.toMatchObject({
    code: "END_REQUEST_PENDING",
  });
  await vote(id, 1, p.requestId);
  await vote(id, 1, p.requestId, "reject");
  await vote(id, 2, p.requestId);
  expect((await endRequests(db, id))[0].status).toBe("rejected");
  expect((await getGame(db, actors[0], id)).state.revision).toBe(0);
  await expect(requestEnd(db, actors[0], id, input())).rejects.toMatchObject({
    code: "END_REQUEST_COOLDOWN",
  });
  const p2 = input(),
    before = await saved(id);
  await requestEnd(db, actors[2], id, p2);
  await vote(id, 2, p2.requestId, "cancel");
  expect((await endRequests(db, id))[0].status).toBe("cancelled");
  expect(await saved(id)).toEqual(before);
});
it("legal moves invalidate old consent; undo and expiry cannot leave a frozen vote", async () => {
  const id = await game(),
    p = input();
  await requestEnd(db, actors[0], id, p);
  const m = await move(id);
  await submitCommand(db, m.actor, id, m.command);
  expect((await vote(id, 1, p.requestId)).status).toBe("changed");
  const p2 = input(1);
  await requestEnd(db, actors[1], id, p2);
  const undo = { ...input(1), targetRevision: 0 };
  await requestUndo(db, m.actor, id, undo);
  expect((await vote(id, 2, p2.requestId)).status).toBe("changed");
  await expect(requestEnd(db, actors[2], id, input(1))).rejects.toMatchObject({
    code: "UNDO_PENDING",
  });
  const other = await game(),
    expiring = input();
  await requestEnd(db, actors[0], other, expiring);
  const before = await saved(other);
  await db.query(
    "UPDATE game_end_requests SET expires_at=now()-interval '1 second' WHERE game_id=$1",
    [other],
  );
  expect((await vote(other, 1, expiring.requestId)).status).toBe("expired");
  expect(await saved(other)).toEqual(before);
  await requestEnd(db, actors[1], other, input());
  await maintainGame(db, other, Date.now() + INACTIVE_MS + 1000);
  expect((await getGame(db, actors[0], other)).state.matchResult?.reason).toBe(
    "inactive",
  );
});
it("a game action racing the last approval yields only one valid outcome", async () => {
  const id = await game(),
    p = input();
  await requestEnd(db, actors[0], id, p);
  await vote(id, 1, p.requestId);
  const m = await move(id);
  await Promise.allSettled([
    submitCommand(db, m.actor, id, m.command),
    vote(id, 2, p.requestId),
  ]);
  const { state } = await getGame(db, actors[0], id),
    requests = await endRequests(db, id);
  expect(state.revision).toBe(1);
  expect(requests[0].status).toBe(
    state.status === "finished" ? "applied" : "changed",
  );
  expect(replayRecord(await getReplay(db, actors[0], id)).state).toEqual(state);
});
it("consensus does not dilute an existing winner's win rate or average score", async () => {
  const normal = await game();
  const { state } = await getGame(db, actors[0], normal);
  state.status = "finished";
  state.phase = "finished";
  state.pending = [];
  state.scores = Object.keys(state.players).map((seat, i) => ({
    seat,
    total: 100 - i * 10,
    items: [],
  }));
  await db.query("UPDATE games SET state=$2 WHERE id=$1", [
    normal,
    JSON.stringify(state),
  ]);
  const before = await playerStats(db, actors[0]);
  expect(before.winRate).toBe(100);
  expect(before.average).toBe(100);
  const id = await game(),
    proposal = input();
  await requestEnd(db, actors[0], id, proposal);
  await vote(id, 1, proposal.requestId);
  await vote(id, 2, proposal.requestId);
  const after = await playerStats(db, actors[0]);
  expect(after.count).toBe(before.count + 1);
  expect(after.winRate).toBe(100);
  expect(after.average).toBe(100);
  expect(after.wins).toBe(before.wins);
});

it("HTTP validates payloads and cannot inject consensus without votes", async () => {
  const id = await game(),
    auth = await login(db, "consent0", "consensus-test-password");
  const headers = {
    origin: "http://127.0.0.1:5173",
    cookie: `session=${auth.session}`,
    "x-csrf-token": auth.csrf,
  };
  for (const [path, payload] of [
    ["end/request", { ...input(), reason: "x".repeat(201) }],
    ["end/vote", { requestId: randomUUID(), decision: "approve", seat: "p2" }],
    ["adjudicate", { expectedRevision: 0, reason: "consensus" }],
    [
      "commands",
      {
        commandId: randomUUID(),
        expectedRevision: 0,
        action: { kind: "adjudicate", reason: "consensus" },
      },
    ],
  ] as const)
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/games/${id}/${path}`,
          headers,
          payload,
        })
      ).statusCode,
    ).toBe(400);
  const p = input();
  expect(
    (
      await app.inject({
        method: "POST",
        url: `/api/games/${id}/end/request`,
        headers,
        payload: p,
      })
    ).statusCode,
  ).toBe(200);
  const result = await app.inject({
    method: "GET",
    url: `/api/games/${id}`,
    headers,
  });
  expect(result.json().endRequests[0].votes).toEqual({ p1: true });
});
