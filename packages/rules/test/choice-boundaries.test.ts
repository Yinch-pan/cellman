import { it, expect } from "vitest";
import { actionState } from "./fixtures/actions";
import { queueChoice } from "../src/responses";
import { applyAction } from "../src/engine";
it("two free books can be chosen in different colors (p14,p23)", () => {
  const s = actionState();
  queueChoice(s, "p1", "book", 2, ["0", "1", "2", "3"], "city");
  expect(s.pending).toHaveLength(2);
  let r = applyAction(s, "p1", {
    kind: "respond",
    choiceId: s.pending[0].id,
    option: "0",
  });
  if (!r.ok) throw Error(r.error.code);
  r = applyAction(r.state, "p1", {
    kind: "respond",
    choiceId: r.state.pending[0].id,
    option: "2",
  });
  if (!r.ok) throw Error(r.error.code);
  expect(r.state.players.p1.resources.books).toEqual([1, 0, 1, 0]);
});
it("automatic leech recalculates current affordable cost before policy comparison", () => {
  const s = actionState();
  s.players.p2.vp = 0;
  queueChoice(s, "p2", "leech", 2, ["accept", "decline"], "build");
  const r = applyAction(s, "p2", {
    kind: "setLeech",
    enabled: true,
    maxVpCost: 0,
  });
  if (!r.ok) throw Error(r.error.code);
  expect(r.state.pending).toEqual([]);
  expect(r.state.players.p2.vp).toBe(0);
});
