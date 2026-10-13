import { describe, it, expect } from "vitest";
import { applyAction } from "../src/engine";
import { actionState } from "./fixtures/actions";
describe("public actions and innovations p13,21,23", () => {
  it("spends public power once per round", () => {
    const s = actionState();
    s.players.p1.resources.power = [0, 0, 12];
    const r = applyAction(s, "p1", { kind: "powerAction", id: "coins" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.players.p1.resources.coins).toBe(22);
    expect(r.state.players.p1.resources.power).toEqual([4, 0, 8]);
    r.state.players.p1.primaryDone = false;
    expect(
      applyAction(r.state, "p1", { kind: "powerAction", id: "coins" }),
    ).toMatchObject({ ok: false, error: { code: "ACTION_OCCUPIED" } });
  });
  it("innovation requires the specified market color and fees", () => {
    const s = actionState();
    s.players.p1.resources.books = [2, 1, 1, 1];
    s.board.buildings.B4 = { seat: "p1", kind: "school" };
    const r = applyAction(s, "p1", {
      kind: "innovation",
      id: "colleges",
      books: [2, 1, 1, 1],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.state.players.p1.vp).toBe(25);
      expect(r.state.players.p1.resources.coins).toBe(10);
      expect(r.state.players.p1.resources.books).toEqual([0, 0, 0, 0]);
    }
  });
  it("refuses a wrong-color innovation payment without charging", () => {
    const s = actionState();
    s.players.p1.resources.books = [1, 2, 1, 1];
    expect(
      applyAction(s, "p1", {
        kind: "innovation",
        id: "colleges",
        books: [1, 2, 1, 1],
      }),
    ).toMatchObject({ ok: false, error: { code: "BOOK_PAYMENT" } });
    expect(s.players.p1.resources.coins).toBe(15);
  });
});
