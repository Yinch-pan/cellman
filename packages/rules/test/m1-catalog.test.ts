import { describe, it, expect } from "vitest";
import { applyAction } from "../src/engine";
import { actionState } from "./fixtures/actions";
import { giveIncome } from "../src/rounds";
describe("fixed M1 palace catalogue (p22)", () => {
  it.each([
    ["immediate-score", 10, 2],
    ["school-pass", 0, 4],
    ["power-books", 0, 0],
  ] as const)(
    "%s applies its immediate and income effects",
    (id, points, power) => {
      const s = actionState();
      s.board.buildings.A1.kind = "guild";
      s.shared.palaces = [id];
      s.players.p1.resources.tools = 4;
      const r = applyAction(s, "p1", {
        kind: "upgrade",
        hex: "A1",
        to: "palace",
        palace: id,
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.state.players.p1.vp).toBe(20 + points);
      if (id === "power-books") {
        expect(r.state.pending.filter((c) => c.kind === "book")).toHaveLength(
          2,
        );
        expect(r.state.players.p1.resources.power).toEqual([0, 4, 8]);
        const coins = r.state.players.p1.resources.coins;
        giveIncome(r.state);
        expect(r.state.players.p1.resources.coins).toBe(coins + 12);
      } else {
        r.state.players.p1.resources.power = [0, 12, 0];
        giveIncome(r.state);
        expect(r.state.players.p1.resources.power[2]).toBe(power);
      }
    },
  );
  it("school-pass palace scores every school on pass", () => {
    const s = actionState();
    s.players.p1.palace = "school-pass";
    s.board.buildings.A1.kind = "school";
    const r = applyAction(s, "p1", { kind: "pass", bonus: "scholar" });
    if (!r.ok) throw Error(r.error.code);
    expect(r.state.players.p1.vp).toBe(23);
  });
});
describe("fixed M1 immediate innovations (p21)", () => {
  it("architecture grants ten points and a separate science choice per distinct shape", () => {
    const s = actionState();
    s.setup.innovations = ["architecture"];
    s.shared.innovations = ["architecture"];
    s.players.p1.resources.books = [2, 1, 1, 1];
    s.board.buildings.B4 = { seat: "p1", kind: "guild" };
    const r = applyAction(s, "p1", {
      kind: "innovation",
      id: "architecture",
      books: [2, 1, 1, 1],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.state.players.p1.vp).toBe(30);
      expect(r.state.pending.filter((c) => c.kind === "science")).toHaveLength(
        2,
      );
    }
  });
  it.each([
    [0, 0],
    [1, 8],
    [2, 12],
    [3, 18],
  ])("steel scores %s bridges for %s points", (n, points) => {
    const s = actionState();
    s.setup.innovations = ["steel"];
    s.shared.innovations = ["steel"];
    s.players.p1.resources.books = [2, 1, 1, 1];
    s.board.bridges = Array.from({ length: n }, () => ({
      seat: "p1",
      a: "B1",
      b: "A3",
    }));
    const r = applyAction(s, "p1", {
      kind: "innovation",
      id: "steel",
      books: [2, 1, 1, 1],
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.state.players.p1.vp).toBe(20 + points);
  });
  it("communications counts separated adjacency groups, ignoring sailing", () => {
    const s = actionState();
    s.setup.innovations = ["communications"];
    s.shared.innovations = ["communications"];
    s.players.p1.resources.books = [2, 1, 1, 1];
    s.players.p1.sailing = 3;
    s.board.buildings = {
      A1: { seat: "p1", kind: "workshop" },
      A7: { seat: "p1", kind: "workshop" },
      B10: { seat: "p1", kind: "guild" },
      I13: { seat: "p1", kind: "school" },
    };
    const r = applyAction(s, "p1", {
      kind: "innovation",
      id: "communications",
      books: [2, 1, 1, 1],
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.state.players.p1.vp).toBe(28);
  });
});
