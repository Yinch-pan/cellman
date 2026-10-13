import { describe, it, expect } from "vitest";
import { applyAction } from "../src/engine";
import { actionState } from "./fixtures/actions";
import { bridgeSites } from "../src/map";
describe("spade allocation and river bridges (p11–12,23)", () => {
  it("allows only the marked opposite banks for a bridge", () => {
    expect(
      bridgeSites.some(
        ([a, b]) => [a, b].includes("B1") && [a, b].includes("A3"),
      ),
    ).toBe(true);
    expect(
      bridgeSites.some(
        ([a, b]) => [a, b].includes("A1") && [a, b].includes("A3"),
      ),
    ).toBe(false);
  });
  it("uses all spades before placing the first workshop", () => {
    const s = actionState();
    s.board.buildings = { B4: { seat: "p1", kind: "workshop" } };
    s.players.p1.resources.power = [0, 0, 12];
    const r = applyAction(s, "p1", {
      kind: "powerAction",
      id: "spades",
      hex: "C5",
      terrain: "forest",
      build: true,
      additional: [{ hex: "B5", terrain: "forest" }],
    } as any);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.state.board.terrain.B5).toBe("forest");
      expect(r.state.board.buildings.C5.kind).toBe("workshop");
      expect(r.state.players.p1.resources.tools).toBe(2);
      expect(r.state.players.p1.resources.power).toEqual([6, 0, 6]);
    }
  });
  it("cannot use newly built workshop reach for a surplus spade", () => {
    const s = actionState();
    s.board.buildings = { B4: { seat: "p1", kind: "workshop" } };
    s.players.p1.resources.power = [0, 0, 12];
    const r = applyAction(s, "p1", {
      kind: "powerAction",
      id: "spades",
      hex: "C5",
      terrain: "forest",
      build: true,
      additional: [{ hex: "D5", terrain: "wasteland" }],
    } as any);
    expect(r).toMatchObject({ ok: false, error: { code: "OUT_OF_REACH" } });
    expect(s.board.buildings.C5).toBeUndefined();
  });
  it("requires an owned endpoint, stock and an empty bridge site", () => {
    const s = actionState();
    s.board.buildings = { B1: { seat: "p1", kind: "workshop" } };
    s.players.p1.resources.power = [0, 0, 12];
    const r = applyAction(s, "p1", {
      kind: "powerAction",
      id: "bridge",
      a: "B1",
      b: "A3",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.state.board.bridges).toEqual([{ seat: "p1", a: "B1", b: "A3" }]);
      expect(r.state.players.p1.resources.power).toEqual([3, 0, 9]);
    }
  });
  it("city spade tile preserves the choice until targets are provided", () => {
    const s = actionState();
    s.players.p1.resources.tools = 10;
    s.board.buildings = {
      A4: { seat: "p1", kind: "workshop" },
      A5: { seat: "p1", kind: "guild" },
      A6: { seat: "p1", kind: "school" },
      B5: { seat: "p1", kind: "workshop" },
    };
    const r = applyAction(s, "p1", { kind: "upgrade", hex: "A4", to: "guild" });
    if (!r.ok) throw Error(r.error.code);
    const c = r.state.pending.find((c) => c.kind === "city")!;
    const d = applyAction(r.state, "p1", {
      kind: "respond",
      choiceId: c.id,
      option: "spades",
    });
    expect(d.ok).toBe(true);
    if (d.ok) {
      expect(d.state.pending.some((c) => c.kind === "spades")).toBe(true);
      expect(d.state.players.p1.vp).toBe(25);
    }
  });
});
