import { describe, it, expect } from "vitest";
import { applyAction } from "../src/engine";
import { actionState } from "./fixtures/actions";
import { queueChoice } from "../src/responses";
import { giveIncome } from "../src/rounds";
function choose(id: string) {
  const s = actionState();
  queueChoice(s, "p1", "competency", 1, [id], "upgrade");
  return {
    s,
    action: { kind: "respond" as const, choiceId: s.pending[0].id, option: id },
  };
}
describe("competency market and effects (p13,24)", () => {
  it("gives fixed column and row rewards and consumes one of four copies", () => {
    const { s, action } = choose("income-vp-coins");
    const r = applyAction(s, "p1", action);
    if (!r.ok) throw Error(r.error.code);
    expect(r.state.players.p1.science[0]).toBe(4);
    expect(r.state.players.p1.resources.books).toEqual([1, 0, 0, 0]);
    expect(
      r.state.shared.competencies.find((c) => c.id === "income-vp-coins")
        ?.remaining,
    ).toBe(3);
    expect(r.state.pending).toEqual([]);
  });
  it("never grants the same competency twice", () => {
    const { s, action } = choose("income-vp-coins");
    s.players.p1.competencies.push("income-vp-coins");
    expect(applyAction(s, "p1", action)).toMatchObject({
      ok: false,
      error: { code: "DUPLICATE_COMPETENCY" },
    });
  });
  it("immediate resources accompany two books from the bottom row", () => {
    const { s, action } = choose("immediate-resources");
    const r = applyAction(s, "p1", action);
    if (!r.ok) throw Error(r.error.code);
    expect(r.state.players.p1.resources).toMatchObject({
      tools: 4,
      coins: 17,
      books: [2, 0, 0, 0],
    });
    expect(r.state.players.p1.vp).toBe(25);
  });
  it("two-spade competency queues a serializable terraform choice", () => {
    const { s, action } = choose("two-spades");
    const r = applyAction(s, "p1", action);
    if (!r.ok) throw Error(r.error.code);
    expect(
      r.state.pending.some((c) => c.kind === "spades" && c.amount === 2),
    ).toBe(true);
  });
  it("annex stock does not change buildings until its own action", () => {
    const { s, action } = choose("annexes");
    const r = applyAction(s, "p1", action);
    if (!r.ok) throw Error(r.error.code);
    expect(r.state.players.p1.annexes).toBe(2);
    expect(r.state.board.buildings.A1.annex).toBeUndefined();
    const d = applyAction(r.state, "p1", {
      kind: "special",
      source: "annex",
      hex: "A1",
    });
    expect(d.ok).toBe(true);
    if (d.ok) {
      expect(d.state.players.p1.annexes).toBe(1);
      expect(d.state.board.buildings.A1.annex).toBe(true);
    }
  });
  it("tool and science income queues a choice that immediately grants newly unlocked science9 income", () => {
    const s = actionState();
    s.players.p1.competencies = ["income-tool-science"];
    s.players.p1.science[0] = 8;
    giveIncome(s);
    const c = s.pending.find((c) => c.kind === "science")!;
    expect(c).toBeDefined();
    const coins = s.players.p1.resources.coins;
    const d = applyAction(s, "p1", {
      kind: "respond",
      choiceId: c.id,
      option: "0",
    });
    if (!d.ok) throw Error(d.error.code);
    expect(d.state.players.p1.resources.coins).toBe(coins + 3);
  });
  it("power special can be used only once per round", () => {
    const s = actionState();
    s.players.p1.competencies = ["power-special"];
    const a = { kind: "special" as const, source: "competency:power-special" };
    const r = applyAction(s, "p1", a);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    r.state.players.p1.primaryDone = false;
    expect(applyAction(r.state, "p1", a)).toMatchObject({
      ok: false,
      error: { code: "SPECIAL_USED" },
    });
  });
  it("city and lowest-science pass competencies score without triggering new choices", () => {
    const s = actionState();
    s.players.p1.competencies = ["city-pass", "min-science-pass"];
    s.players.p1.keys = 2;
    s.players.p1.science = [5, 3, 2, 4];
    const r = applyAction(s, "p1", { kind: "pass", bonus: "scholar" });
    if (!r.ok) throw Error(r.error.code);
    expect(r.state.players.p1.vp).toBe(26);
  });
});
