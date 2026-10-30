import { it, expect } from "vitest";
import { applyAction } from "../src/engine";
import { actionState } from "./fixtures/actions";
import { atomicActionSchema } from "../../contracts/src/game";
import type { GameAction, FreeConversion } from "../src/types";

const actions: FreeConversion[] = [
  { kind: "burn", count: 1 },
  { kind: "convert", from: "power", to: "tool", count: 1 },
  { kind: "convert", from: "tool", to: "coin", count: 1 },
];
it("conversion batch uses preceding gains, preserves main action and matches sequential replay", () => {
  const s = actionState();
  s.players.p1.resources.power = [0, 10, 2];
  const before = structuredClone(s);
  const result = applyAction(s, "p1", { kind: "convertBatch", actions });
  if (!result.ok) throw Error(result.error.code);
  let seq = s;
  const events = [];
  for (const action of actions) {
    const r = applyAction(seq, "p1", action);
    if (!r.ok) throw Error(r.error.code);
    seq = r.state;
    events.push(...r.events);
  }
  expect(result.state).toEqual(seq);
  expect(result.events).toEqual(events);
  expect(s).toEqual(before);
  expect(result.state.players.p1.primaryDone).toBe(false);
  expect(result.state.players.p1.resources.power).toEqual([3, 8, 0]);
  expect(result.state.players.p1.resources.tools).toBe(
    s.players.p1.resources.tools,
  );
  expect(result.state.players.p1.resources.coins).toBe(
    s.players.p1.resources.coins + 1,
  );
});
it("failed later conversion rolls back the entire batch", () => {
  const s = actionState();
  s.players.p1.resources.power = [0, 10, 2];
  const before = structuredClone(s);
  expect(
    applyAction(s, "p1", {
      kind: "convertBatch",
      actions: [
        ...actions,
        { kind: "convert", from: "power", to: "scholar", count: 1 },
      ],
    }).ok,
  ).toBe(false);
  expect(s).toEqual(before);
  expect(applyAction(s, "p2", { kind: "convertBatch", actions }).ok).toBe(
    false,
  );
});
it("batch rejects nested or main actions, unbounded input, and frozen games", () => {
  const s = actionState();
  for (const children of [
    [],
    Array(101).fill(actions[0]),
    [{ kind: "endTurn" }],
    [{ kind: "convertBatch", actions }],
  ]) {
    const action = { kind: "convertBatch", actions: children };
    expect(atomicActionSchema.safeParse(action).success).toBe(false);
    expect(applyAction(s, "p1", action as GameAction).ok).toBe(false);
  }
  s.rulesVersion = "aoi-1.1+2024-09.engine-5";
  expect(applyAction(s, "p1", { kind: "convertBatch", actions }).ok).toBe(
    false,
  );
});
it("batched conversions are valid within a private complete turn", () => {
  const s = actionState();
  s.players.p1.resources.power = [0, 10, 6];
  const result = applyAction(s, "p1", {
    kind: "turn",
    actions: [
      { kind: "convertBatch", actions },
      { kind: "powerAction", id: "coins" },
      { kind: "endTurn" },
    ],
  });
  expect(result.ok && result.state.activeSeat).toBe("p2");
});
