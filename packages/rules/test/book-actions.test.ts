import { describe, it, expect } from "vitest";
import { applyAction } from "../src/engine";
import { actionState } from "./fixtures/actions";
describe("book actions p23", () => {
  it.each([
    ["power", 1],
    ["science", 1],
    ["coins", 2],
    ["upgrade", 2],
    ["guild-score", 2],
    ["spades", 3],
  ] as const)("supports %s with exact book payment", (id, n) => {
    const s = actionState();
    s.shared.bookActions = [id];
    s.players.p1.resources.books = [n, 0, 0, 0];
    const r = applyAction(s, "p1", {
      kind: "bookAction",
      id,
      books: [n, 0, 0, 0],
      track: 0,
      hex: "A1",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.players.p1.resources.books).toEqual([0, 0, 0, 0]);
    expect(r.state.shared.usedActions).toContain("book:" + id);
    if (id === "power")
      expect(r.state.players.p1.resources.power).toEqual([0, 11, 1]);
    if (id === "science") expect(r.state.players.p1.science[0]).toBe(4);
    if (id === "coins") expect(r.state.players.p1.resources.coins).toBe(21);
    if (id === "upgrade") {
      expect(r.state.board.buildings.A1.kind).toBe("guild");
      expect(r.state.players.p1.resources.tools).toBe(3);
    }
    if (id === "spades")
      expect(
        r.state.pending.some((c) => c.kind === "spades" && c.amount === 3),
      ).toBe(true);
  });
  it("rejects actions absent from this game and duplicate public use", () => {
    const s = actionState();
    s.players.p1.resources.books = [5, 0, 0, 0];
    s.shared.bookActions = ["coins"];
    expect(
      applyAction(s, "p1", {
        kind: "bookAction",
        id: "power",
        books: [1, 0, 0, 0],
      }),
    ).toMatchObject({ ok: false, error: { code: "BOOK_ACTION_UNAVAILABLE" } });
    s.shared.usedActions = ["book:coins"];
    expect(
      applyAction(s, "p1", {
        kind: "bookAction",
        id: "coins",
        books: [2, 0, 0, 0],
      }),
    ).toMatchObject({ ok: false, error: { code: "ACTION_OCCUPIED" } });
  });
  it("rejects overpayment instead of silently losing books", () => {
    const s = actionState();
    s.shared.bookActions = ["coins"];
    s.players.p1.resources.books = [3, 0, 0, 0];
    expect(
      applyAction(s, "p1", {
        kind: "bookAction",
        id: "coins",
        books: [3, 0, 0, 0],
      }),
    ).toMatchObject({ ok: false, error: { code: "BOOK_PAYMENT" } });
  });
});
