import { it, expect } from "vitest";
import { createGame, validateState } from "../src/state";
import { snakeSetup, draftOptions, placementOptions } from "../src/setup";
import { adjudicate, type LifecycleAction } from "../src/lifecycle";
import {
  applyAction,
  getAvailableChoices,
  getWaitingSeats,
} from "../src/engine";
import { replayRecord, type RecordedCommand } from "../src/replay";
import { officialLarge } from "../src/map";
import type { GameAction, GameState } from "../src/types";
import { sampleSetup } from "./fixtures/setup";
for (const version of ["aoi-1.1+2024-09.engine-2", "aoi-1.1+2024-09.engine-3", "aoi-1.1+2024-09.engine-4"]) {
  it(`${version}: historical games retain their engine after a replayable forfeit`, () => {
    const initial = createGame({...sampleSetup(), rulesVersion: version});
    const action: LifecycleAction = {kind: "adjudicate", reason: "forfeit", target: initial.activeSeat, at: "2026-10-25T00:00:00Z"};
    const next = adjudicate(initial, action);
    if (!next.ok) throw Error("failed");
    next.state.revision = 1;
    expect(next.state.rulesVersion).toBe(version);
    expect(getWaitingSeats(next.state)).not.toContain(initial.activeSeat);
    expect(replayRecord({initial, commands: [{revision: 1, seat: "p2", action}]}).state).toEqual(next.state);
  });
}
function nextMove(s: GameState): { seat: string; action: GameAction } {
  const choice = getAvailableChoices(s)[0],
    seat = choice?.seat ?? s.activeSeat;
  if (choice) {
    const options = [...choice.options].sort(
      (a, b) =>
        Number(!["decline", "discard", "skip"].includes(a)) -
        Number(!["decline", "discard", "skip"].includes(b)),
    );
    for (const option of options) {
      const action: GameAction = {
        kind: "respond",
        choiceId: choice.id,
        option,
      };
      if (applyAction(s, seat, action).ok) return { seat, action };
    }
    throw Error("No response");
  }
  if (s.phase === "draft") {
    const category = (["bonus", "native", "palace", "faction"] as const).find(
      (c) => draftOptions(s, seat, c).length,
    )!;
    return {
      seat,
      action: {
        kind: "draftPick",
        category,
        option: draftOptions(s, seat, category)[0],
      },
    };
  }
  if (s.phase === "placement")
    return {
      seat,
      action: {
        kind: "place",
        hex: Object.values(officialLarge.hexes).find(
          (h) =>
            h.terrain === s.players[seat].native && !s.board.buildings[h.id],
        )!.id,
        building: placementOptions(s, seat)[0] as
          "workshop" | "university" | "tower",
      },
    };
  return {
    seat,
    action: s.players[seat].primaryDone
      ? { kind: "endTurn" }
      : {
          kind: "pass",
          bonus: s.setup.bonusPool.find(
            (b) => !Object.values(s.players).some((p) => p.bonus === b),
          ),
        },
  };
}
for (const n of [3, 5])
  for (const direction of ["forward", "reverse"] as const)
    it(`${n} ${direction}: removed player never blocks setup, responses or all six rounds; replay locks result`, () => {
      const initial = createGame(
        snakeSetup(
          "lifecycle",
          Array.from({ length: n }, (_, i) => ({ id: `u${i}`, name: `P${i}` })),
          direction,
          () => 0.37,
        ),
      );
      const target = initial.activeSeat,
        action: LifecycleAction = {
          kind: "adjudicate",
          reason: "forfeit",
          target,
          at: "2026-10-25T00:00:00.000Z",
        };
      const result = adjudicate(initial, action);
      if (!result.ok) throw Error("adjudication");
      let s = result.state;
      s.revision = 1;
      const frozen = structuredClone(s.matchResult),
        commands: RecordedCommand[] = [
          {
            revision: 1,
            seat: initial.turnOrder.find((p) => p !== target)!,
            action,
          },
        ];
      for (let i = 0; i < 300 && s.status !== "finished"; i++) {
        expect(getWaitingSeats(s)).not.toContain(target);
        const move = nextMove(s);
        const step = applyAction(s, move.seat, move.action);
        if (!step.ok) throw Error(step.error.code);
        step.state.revision = s.revision + 1;
        s = step.state;
        commands.push({ revision: s.revision, ...move });
      }
      expect(s.status).toBe("finished");
      expect(s.round).toBe(6);
      expect(s.matchResult).toEqual(frozen);
      expect(validateState(s)).toEqual([]);
      expect(replayRecord({ initial, commands }).state).toEqual(s);
      expect(result.events.some((e) => e.kind === "auto-skip")).toBe(true);
    });
it("simultaneous leech for the expelled seat is declined without consuming another player's response", () => {
  const s = createGame(sampleSetup());
  s.phase = "actions";
  s.pending = ["p1", "p2"].map((seat, i) => ({
    id: `c${i}`,
    seat,
    kind: "leech",
    amount: 2,
    options: ["accept", "decline"],
    continuation: { kind: "resume-turn" },
    source: "test",
  }));
  const result = adjudicate(s, {
    kind: "adjudicate",
    reason: "forfeit",
    target: "p1",
    at: "2026-10-25T00:00:00Z",
  });
  if (!result.ok) throw Error("failed");
  expect(result.state.pending.map((c) => c.seat)).toEqual(["p2"]);
  expect(result.state.players.p1.resources.power).toEqual(
    s.players.p1.resources.power,
  );
  expect(s.matchResult).toBeUndefined();
});
it("inactivity preserves an unfinished setup as a replayable draw without inventing final scores", () => {
  const s = createGame(sampleSetup()),
    action: LifecycleAction = {
      kind: "adjudicate",
      reason: "inactive",
      at: "2026-10-25T00:00:00Z",
    };
  const next = adjudicate(s, action);
  if (!next.ok) throw Error("failed");
  next.state.revision = 1;
  expect(next.state.scores).toEqual(s.scores);
  expect(next.state.matchResult?.winners).toEqual([]);
  expect(
    replayRecord({
      initial: s,
      commands: [{ revision: 1, seat: "p1", action }],
    }).state,
  ).toEqual(next.state);
});
