import { it, expect } from "vitest";
import { replayRecord, activeHistory, type ReplayRecord } from "../src/replay";
import { actionState } from "./fixtures/actions";
import { gameStatistics } from "../src/statistics";
import { chooseMove, seededRandom } from "./fixtures/players";
import { createGame } from "../src/state";
import { standardSetup } from "../src/setup";
import { applyAction } from "../src/engine";
it("restores the complete state, preserves audit revisions and excludes undone actions from statistics", () => {
  const initial = actionState();
  const record: ReplayRecord = {
    initial,
    commands: [
      {
        revision: 1,
        seat: "p1",
        action: { kind: "convert", from: "tool", to: "coin", count: 1 },
      },
      {
        revision: 2,
        seat: "p1",
        action: { kind: "restore", targetRevision: 0 },
      },
      {
        revision: 3,
        seat: "p1",
        action: { kind: "convert", from: "tool", to: "coin", count: 2 },
      },
    ],
  };
  const restored = replayRecord(record, 2);
  expect(restored.state).toEqual({ ...initial, revision: 2 });
  expect(replayRecord(record, 1).state.players.p1.resources.coins).toBe(
    initial.players.p1.resources.coins + 1,
  );
  const current = replayRecord(record);
  expect(current.history).toHaveLength(3);
  expect(activeHistory(current.history).map((h) => h.revision)).toEqual([3]);
  const stats = gameStatistics(record);
  expect(stats.players[0].actions).toEqual({ convert: 1 });
  expect(stats.players[0].rounds[initial.round].changes.coins).toBe(2);
  record.commands.push({
    revision: 4,
    seat: "p1",
    action: { kind: "restore", targetRevision: 2 },
  });
  expect(replayRecord(record).state).toEqual({ ...initial, revision: 4 });
  expect(gameStatistics(record).activeCount).toBe(0);
});
it("refuses a restore outside the available replay checkpoints", () => {
  expect(() =>
    replayRecord({
      initial: actionState(),
      commands: [
        {
          revision: 1,
          seat: "p1",
          action: { kind: "restore", targetRevision: 8 },
        },
      ],
    }),
  ).toThrow("REPLAY_INVALID_RESTORE");
});
it("undo removes a building upgrade and its opponent's leech response together", () => {
  const initial = actionState();
  const record: ReplayRecord = {
    initial,
    commands: [
      {
        revision: 1,
        seat: "p1",
        action: { kind: "upgrade", hex: "A1", to: "guild" },
      },
    ],
  };
  const next = replayRecord(record).state;
  const leech = next.pending.find((p) => p.kind === "leech")!;
  expect(leech).toBeDefined();
  record.commands.push({
    revision: 2,
    seat: leech.seat,
    action: { kind: "respond", choiceId: leech.id, option: "accept" },
  });
  expect(
    replayRecord(record).state.players[leech.seat].resources.power,
  ).not.toEqual(initial.players[leech.seat].resources.power);
  record.commands.push({
    revision: 3,
    seat: "p1",
    action: { kind: "restore", targetRevision: 0 },
  });
  expect(replayRecord(record).state).toEqual({ ...initial, revision: 3 });
});
it("a four-player full game can roll back a chain midgame and finish with reconciled statistics", () => {
  const initial = createGame(
    standardSetup(
      "undo-full-game",
      [1, 2, 3, 4].map((i) => ({ id: String(i), name: `P${i}` })),
      seededRandom(6),
    ),
  );
  const record: ReplayRecord = { initial, commands: [] };
  let state = initial;
  let rewound = false;
  for (let step = 0; step < 900 && state.status !== "finished"; step++) {
    if (state.revision === 100 && !rewound) {
      record.commands.push({
        revision: 101,
        seat: state.activeSeat,
        action: { kind: "restore", targetRevision: 90 },
      });
      state = replayRecord(record).state;
      rewound = true;
    }
    const { seat, action } = chooseMove(state);
    const next = applyAction(state, seat, action);
    if (!next.ok) throw Error(next.error.code);
    state = next.state;
    state.revision++;
    record.commands.push({ revision: state.revision, seat, action });
  }
  expect(rewound).toBe(true);
  expect(state.status).toBe("finished");
  const stats = gameStatistics(record);
  expect(stats.state).toEqual(state);
  for (const p of stats.players) {
    expect(
      p.initialVp + Object.values(p.rounds).reduce((n, r) => n + r.vp, 0),
    ).toBe(state.players[p.seat].vp);
    expect(
      p.initialVp + Object.values(p.scoreSources).reduce((n, v) => n + v, 0),
    ).toBe(state.players[p.seat].vp);
  }
});
