import { it, expect } from "vitest";
import { createGame } from "../src/state";
import { sampleSetup } from "./fixtures/setup";
import { applyAction } from "../src/engine";
import { actionState } from "./fixtures/actions";
it("starting science level3 gives its power during setup (p10)", () => {
  const s = createGame(sampleSetup());
  expect(s.players.p2.resources.power).toEqual([4, 8, 0]);
});
it("bonus scholar tile scores 2 VP when sending a scholar (p23)", () => {
  const s = actionState();
  s.players.p1.bonus = "scholar";
  s.players.p1.resources.scholars = 1;
  const r = applyAction(s, "p1", { kind: "scholar", track: 0, slot: null });
  if (!r.ok) throw Error(r.error.code);
  expect(r.state.players.p1.vp).toBe(22);
});
it("science round scores every level gained (p24)", () => {
  const s = actionState();
  s.setup.roundTiles[0] = "science-medicine";
  s.players.p1.resources.scholars = 1;
  const r = applyAction(s, "p1", { kind: "scholar", track: 0, slot: 0 });
  if (!r.ok) throw Error(r.error.code);
  expect(r.state.players.p1.vp).toBe(23);
});
it("technology round awards points for an advancement (p24)", () => {
  const s = actionState();
  s.setup.roundTiles[0] = "advance-engineering";
  s.players.p1.resources.scholars = 1;
  const r = applyAction(s, "p1", { kind: "advance", track: "sailing" });
  if (!r.ok) throw Error(r.error.code);
  expect(r.state.players.p1.vp).toBe(25);
});
it("a pass-time choice in round6 finishes only after the response", () => {
  const s = actionState();
  s.round = 6;
  s.players.p1.bonus = "school";
  s.players.p2.passed = true;
  s.players.p3.passed = true;
  s.passOrder = ["p2", "p3"];
  s.board.buildings.A1.kind = "school";
  const r = applyAction(s, "p1", { kind: "pass" });
  if (!r.ok) throw Error(r.error.code);
  expect(r.state.status).toBe("active");
  expect(r.state.pending).toHaveLength(1);
  const d = applyAction(r.state, "p1", {
    kind: "respond",
    choiceId: r.state.pending[0].id,
    option: "0",
  });
  if (!d.ok) throw Error(d.error.code);
  expect(d.state.status).toBe("finished");
});
