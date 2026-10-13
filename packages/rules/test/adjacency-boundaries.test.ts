import { it, expect } from "vitest";
import { connected, officialLarge } from "../src/map";
import { applyAction } from "../src/engine";
import { actionState } from "./fixtures/actions";
import { queueChoice } from "../src/responses";
it("a bridge creates adjacency for both factions regardless of who built it (p8)", () => {
  expect(
    connected(
      officialLarge,
      "B1",
      "A3",
      [{ seat: "p1", a: "B1", b: "A3" }],
      "p2",
    ),
  ).toBe(true);
});
it("taking the tower competency is legal when the neutral building cannot be placed (p9)", () => {
  const s = actionState();
  s.players.p1.resources.tools = 0;
  s.board.buildings = {};
  queueChoice(s, "p1", "competency", 1, ["tower"], "upgrade");
  const r = applyAction(s, "p1", {
    kind: "respond",
    choiceId: s.pending[0].id,
    option: "tower",
  });
  expect(r.ok).toBe(true);
  if (r.ok) {
    expect(r.state.players.p1.competencies).toContain("tower");
    expect(r.state.pending).toEqual([]);
    expect(r.state.board.buildings).toEqual({});
  }
});
it("a key decision is resolved before another science reward for that player", () => {
  const s = actionState();
  s.players.p1.science[0] = 7;
  s.players.p1.keys = 1;
  queueChoice(s, "p1", "science", 1, ["0"], "architecture");
  queueChoice(s, "p1", "science", 1, ["0"], "architecture");
  const r = applyAction(s, "p1", {
    kind: "respond",
    choiceId: s.pending[0].id,
    option: "0",
  });
  if (!r.ok) throw Error(r.error.code);
  const second = applyAction(r.state, "p1", {
    kind: "respond",
    choiceId: r.state.pending[0].id,
    option: "0",
  });
  expect(second).toMatchObject({
    ok: false,
    error: { code: "RESOLVE_KEY_FIRST" },
  });
});
