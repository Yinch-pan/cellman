import { describe, expect, it } from "vitest";
import { createGame, RULES_VERSION } from "../src/state";
import { applyAction, getLegalActions } from "../src/engine";
import { sampleSetup } from "./fixtures/setup";
import { actionState } from "./fixtures/actions";
import { officialLarge } from "../src/map";
import { placementOptions } from "../src/setup";
import { giveIncome } from "../src/rounds";
import { finishGame } from "../src/scoring";
import { replayRecord, type RecordedCommand } from "../src/replay";
import type { GameState, GameAction } from "../src/types";

function step(s: GameState, action: GameAction, seat = s.activeSeat) {
  const result = applyAction(s, seat, action);
  if (!result.ok) throw Error(result.error.code);
  return result.state;
}
export function omarSetup(version = RULES_VERSION) {
  return {
    ...sampleSetup(),
    rulesVersion: version,
    offers: [
      { native: "forest", faction: "omar", bonus: "coins" },
      { native: "lake", faction: "blessed", bonus: "power" },
      { native: "mountain", faction: "monks", bonus: "guild" },
    ],
  };
}
function drafted(version = RULES_VERSION) {
  let s = createGame(omarSetup(version));
  for (const offer of [2, 1, 0]) s = step(s, { kind: "chooseSetup", offer });
  return s;
}
function emptyHome(s: GameState) {
  return Object.values(officialLarge.hexes).find(
    (h) =>
      h.terrain === s.players[s.activeSeat].native && !s.board.buildings[h.id],
  )!.id;
}

describe("independent rulebook examples, English v1.1 + September 2024", () => {
  it("p16: convert and burn while resolving your own action, without consuming its reward or ending the turn", () => {
    const s = actionState();
    s.board.buildings = { B4: { seat: "p1", kind: "workshop" } };
    s.players.p1.bonus = "spade-bonus";
    s.players.p1.resources.tools = 0;
    s.players.p1.resources.power = [0, 6, 0];
    let n = step(s, { kind: "special", source: "bonus:spade-bonus" });
    const choices = structuredClone(n.pending);
    expect(getLegalActions(n, "p1").map((a) => a.kind)).toContain("convert");
    n = step(n, { kind: "burn", count: 3 });
    n = step(n, { kind: "convert", from: "power", to: "tool", count: 1 });
    expect(n.pending).toEqual(choices);
    expect(n.activeSeat).toBe("p1");
    expect(n.players.p1.primaryDone).toBe(true);
    expect(n.players.p1.resources).toMatchObject({
      tools: 1,
      power: [3, 0, 0],
    });
    expect(applyAction(n, "p1", { kind: "endTurn" })).toMatchObject({
      ok: false,
      error: { code: "PENDING_CHOICES" },
    });
    n = step(n, {
      kind: "respond",
      choiceId: choices[0].id,
      option: "terraform",
      terraform: { hex: "C5", terrain: "forest", build: true },
    });
    expect(n.board.buildings.C5).toEqual({ seat: "p1", kind: "workshop" });
    expect(n.players.p1.resources.tools).toBe(0);
  });
  it("p16: pending conversions remain forbidden outside your action turn and in frozen v3 games", () => {
    const s = actionState();
    s.players.p1.bonus = "spade-bonus";
    const n = step(s, { kind: "special", source: "bonus:spade-bonus" });
    const action: GameAction = {
      kind: "convert",
      from: "tool",
      to: "coin",
      count: 1,
    };
    const before = structuredClone(n);
    expect(applyAction(n, "p2", action)).toMatchObject({
      ok: false,
      error: { code: "NOT_YOUR_TURN" },
    });
    expect(n).toEqual(before);
    for (const phase of ["science", "setup", "placement"] as const) {
      const otherPhase = { ...structuredClone(n), phase };
      expect(applyAction(otherPhase, "p1", action).ok).toBe(false);
      expect(
        getLegalActions(otherPhase, "p1").map((a) => a.kind),
      ).not.toContain("convert");
    }
    const legacy = {
      ...structuredClone(n),
      rulesVersion: "aoi-1.1+2024-09.engine-3",
    };
    expect(applyAction(legacy, "p1", action)).toMatchObject({
      ok: false,
      error: { code: "PENDING_CHOICES" },
    });
    const otherPlayerChoice = structuredClone(n);
    otherPlayerChoice.pending[0].seat = "p2";
    expect(applyAction(otherPlayerChoice, "p1", action).ok).toBe(false);
  });
  it.each([0, 1, 2])(
    "p20: Omar may place the tower in starting slot %i",
    (towerSlot) => {
      let s = drafted();
      let omarIndex = 0;
      while (s.phase === "placement") {
        const owner = s.activeSeat;
        const isOmar = s.players[owner].faction === "omar";
        const hex = emptyHome(s);
        const building = isOmar
          ? omarIndex++ === towerSlot
            ? "tower"
            : "workshop"
          : undefined;
        s = step(s, { kind: "place", hex, building });
        if (building)
          expect(s.board.buildings[hex]).toEqual({
            seat: owner,
            kind: building,
            ...(building === "tower" ? { neutral: true } : {}),
          });
      }
      const buildings = Object.values(s.board.buildings).filter(
        (b) => b.seat === "p1",
      );
      expect(buildings.map((b) => b.kind).sort()).toEqual([
        "tower",
        "workshop",
        "workshop",
      ]);
      expect(
        s.board.buildings[Object.keys(s.board.buildings).at(-1)!].kind,
      ).toBe("university");
    },
  );
  it("p20: a second Omar tower is rejected atomically", () => {
    let s = drafted();
    s = step(s, { kind: "place", hex: emptyHome(s), building: "tower" });
    while (s.activeSeat !== "p1")
      s = step(s, { kind: "place", hex: emptyHome(s) });
    const before = structuredClone(s);
    expect(placementOptions(s, "p1")).toEqual(["workshop"]);
    expect(
      applyAction(s, "p1", {
        kind: "place",
        hex: emptyHome(s),
        building: "tower",
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "INVALID_STARTING_BUILDING" },
    });
    expect(s).toEqual(before);
  });
  it("v3 remains frozen and v4 records exactly one ledger event per command", () => {
    const old = drafted("aoi-1.1+2024-09.engine-3");
    expect(placementOptions(old, "p1")).toEqual(["workshop"]);
    expect(
      step(old, { kind: "place", hex: emptyHome(old) }).board.buildings[
        emptyHome(old)
      ].kind,
    ).toBe("workshop");
    for (const initial of [old, drafted()]) {
      const action: GameAction = { kind: "place", hex: emptyHome(initial) };
      const result = applyAction(initial, initial.activeSeat, action);
      if (!result.ok) throw Error(result.error.code);
      expect(result.events.filter((e) => e.kind === "ledger")).toHaveLength(1);
      const commands: RecordedCommand[] = [
        { revision: 1, seat: initial.activeSeat, action },
      ];
      expect(
        replayRecord({ initial, commands, storage: "postgres-jsonb" }).state,
      ).toEqual({ ...result.state, revision: 1 });
    }
  });
  it("p13: neighboring opponent discounts a guild to 2 tools and 3 coins", () => {
    const s = actionState();
    const n = step(s, { kind: "upgrade", hex: "A1", to: "guild" });
    expect(n.players.p1.resources.tools).toBe(1);
    expect(n.players.p1.resources.coins).toBe(12);
    const isolated = actionState();
    delete isolated.board.buildings.B1;
    expect(
      step(isolated, { kind: "upgrade", hex: "A1", to: "guild" }).players.p1
        .resources.coins,
    ).toBe(9);
  });
  it("p11: forest to desert may stop at wasteland, but never go the long way", () => {
    const s = actionState();
    s.players.p1.native = "desert";
    s.players.p1.resources.tools = 20;
    s.board.buildings = { B1: { seat: "p1", kind: "workshop" } };
    const n = step(s, {
      kind: "terraform",
      hex: "A1",
      terrain: "wasteland",
      build: false,
    });
    expect(n.players.p1.resources.tools).toBe(14); // two spades, three tools each
    expect(n.board.buildings.A1).toBeUndefined();
    expect(
      applyAction(s, "p1", {
        kind: "terraform",
        hex: "A1",
        terrain: "lake",
        build: false,
      }),
    ).toMatchObject({ ok: false, error: { code: "INVALID_TERRAFORM" } });
  });
  it("p8/10: schools and university each yield one scholar; guilds expose 1/1/2/2 power", () => {
    const s = actionState();
    const p = s.players.p1;
    p.native = "desert";
    p.bonus = "none";
    p.science = [0, 0, 0, 0];
    p.resources = {
      coins: 0,
      tools: 0,
      scholars: 0,
      books: [0, 0, 0, 0],
      power: [12, 0, 0],
    };
    s.board.buildings = Object.fromEntries(
      [
        "guild",
        "guild",
        "guild",
        "guild",
        "school",
        "school",
        "school",
        "university",
        "workshop",
      ].map((kind, i) => [`A${i + 1}`, { seat: "p1", kind }]),
    ) as GameState["board"]["buildings"];
    giveIncome(s);
    expect(p.resources).toEqual({
      coins: 8,
      tools: 1,
      scholars: 4,
      books: [0, 0, 0, 0],
      power: [6, 6, 0],
    });
  });
  it("p14/19: plains terraforming costs 1 coin, first advance gives two books rather than six points", () => {
    const s = actionState();
    s.players.p1.native = "plains";
    s.players.p1.resources.scholars = 1;
    const n = step(s, { kind: "advance", track: "terraform" });
    expect(n.players.p1.resources).toMatchObject({
      coins: 14,
      tools: 2,
      scholars: 0,
    });
    expect(n.players.p1.vp).toBe(20);
    expect(
      n.pending.filter((c) => c.kind === "book").map((c) => c.amount),
    ).toEqual([1, 1]);
  });
  it.each([3, 4, 5])(
    "2024 errata: illusionists in a %i-player game pay 3 for 7 coins",
    (count) => {
      const s = actionState();
      s.turnOrder = Array.from({ length: count }, (_, i) => `p${i + 1}`);
      for (let i = 3; i < count; i++)
        s.players[`p${i + 1}`] = {
          ...structuredClone(s.players.p3),
          seat: `p${i + 1}`,
          name: `玩家${i + 1}`,
          native: i === 3 ? "desert" : "plains",
          faction: i === 3 ? "omar" : "moles",
        };
      s.players.p1.faction = "illusionists";
      s.players.p1.resources.power = [0, 0, 12];
      const n = step(s, { kind: "powerAction", id: "coins" });
      expect(n.players.p1.resources.power).toEqual([3, 0, 9]);
      expect(n.players.p1.resources.coins).toBe(22);
      expect(n.players.p1.vp).toBe(count >= 4 ? 22 : 21);
    },
  );
  it("p18: resource score uses groups of five, not the BGA wiki's three", () => {
    const s = actionState();
    s.players.p1.resources = {
      coins: 14,
      tools: 0,
      scholars: 0,
      books: [0, 0, 0, 0],
      power: [12, 0, 0],
    };
    finishGame(s);
    expect(
      s.scores
        .find((x) => x.seat === "p1")!
        .items.find((x) => x.reason === "剩余资源")!.points,
    ).toBe(2);
  });
});
