import { it, expect } from "vitest";
import { applyAction } from "../src/engine";
import { actionState } from "./fixtures/actions";
import { queueChoice } from "../src/responses";
it("neutral tower transforms terrain with tools, then causes leech as a build (p9,24)", () => {
  let s = actionState();
  s.board.buildings = {
    B4: { seat: "p1", kind: "workshop" },
    D6: { seat: "p2", kind: "guild" },
  };
  queueChoice(s, "p1", "competency", 1, ["tower"], "upgrade");
  const r = applyAction(s, "p1", {
    kind: "respond",
    choiceId: s.pending[0].id,
    option: "tower",
  });
  if (!r.ok) throw Error(r.error.code);
  const c = r.state.pending.find((c) => c.kind === "neutral")!;
  const d = applyAction(r.state, "p1", {
    kind: "respond",
    choiceId: c.id,
    option: "C5",
  });
  expect(d.ok).toBe(true);
  if (d.ok) {
    expect(d.state.board.buildings.C5).toMatchObject({
      kind: "tower",
      neutral: true,
      seat: "p1",
    });
    expect(d.state.players.p1.resources.tools).toBe(0);
    expect(d.state.players.p1.resources.coins).toBe(15);
    expect(d.state.board.terrain.C5).toBe("forest");
  }
});
it("annex founding counts as a fourth building and adds power but never offers leech", () => {
  const s = actionState();
  s.players.p1.annexes = 2;
  s.board.buildings = {
    A4: { seat: "p1", kind: "palace" },
    A5: { seat: "p1", kind: "guild" },
    B5: { seat: "p1", kind: "workshop" },
    B4: { seat: "p2", kind: "guild" },
  };
  const r = applyAction(s, "p1", {
    kind: "special",
    source: "annex",
    hex: "B5",
  });
  if (!r.ok) throw Error(r.error.code);
  expect(r.state.pending.map((c) => c.kind)).toEqual(["city"]);
  r.state.players.p1.primaryDone = false;
  expect(
    applyAction(r.state, "p1", { kind: "special", source: "annex", hex: "B5" }),
  ).toMatchObject({ ok: false, error: { code: "PENDING_CHOICES" } });
});
