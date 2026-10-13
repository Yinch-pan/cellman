import { it, expect } from "vitest";
import { applyAction } from "../src/engine";
import { actionState } from "./fixtures/actions";
import { queueChoice } from "../src/responses";
it("immediate tower placement cannot be postponed behind a city reward that could consume its site (p9,24)", () => {
  const s = actionState();
  s.players.p1.resources.tools = 8;
  s.players.p1.resources.coins = 20;
  s.board.buildings = {
    A4: { seat: "p1", kind: "school" },
    B4: { seat: "p1", kind: "guild" },
    B5: { seat: "p1", kind: "guild" },
    A3: { seat: "p2", kind: "workshop" },
    C5: { seat: "p3", kind: "workshop" },
  };
  s.board.terrain = { A4: "forest", B5: "forest", B6: "lake" };
  const up = applyAction(s, "p1", {
    kind: "upgrade",
    hex: "A4",
    to: "university",
  });
  if (!up.ok) throw Error(up.error.code);
  const competence = up.state.pending.find((c) => c.kind === "competency")!;
  const tower = applyAction(up.state, "p1", {
    kind: "respond",
    choiceId: competence.id,
    option: "tower",
  });
  if (!tower.ok) throw Error(tower.error.code);
  const city = tower.state.pending.find((c) => c.kind === "city")!;
  expect(
    applyAction(tower.state, "p1", {
      kind: "respond",
      choiceId: city.id,
      option: "spades",
    }),
  ).toMatchObject({ ok: false, error: { code: "RESOLVE_NEUTRAL_FIRST" } });
  const choice = tower.state.pending.find((c) => c.kind === "neutral")!;
  expect(choice.options).toEqual(["B6"]);
  const built = applyAction(tower.state, "p1", {
    kind: "respond",
    choiceId: choice.id,
    option: "B6",
  });
  expect(built.ok).toBe(true);
});
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
