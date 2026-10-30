import { expect, it } from "vitest";
import { applyAction } from "../src/engine";
import { actionState } from "./fixtures/actions";
import type { GameAction, GameState } from "../src/types";
import { giveIncome } from "../src/rounds";

function step(s: GameState, a: GameAction) {
  const result = applyAction(s, "p1", a);
  if (!result.ok) throw new Error(result.error.code);
  return result.state;
}

it("BGA 939403443 steps 21–23: Goblins earn coins before declining the workshop", () => {
  let s = actionState();
  s.players.p1.native = "mountain";
  s.players.p1.faction = "goblins";
  s.players.p1.bonus = "spade-bonus";
  s.players.p1.resources.coins = 17;
  s.players.p1.resources.tools = 7;
  s.board.buildings = {
    D2: { seat: "p1", kind: "workshop" },
    C5: { seat: "p1", kind: "workshop" },
  };
  s = step(s, { kind: "special", source: "bonus:spade-bonus" });
  const spades = s.pending.find((c) => c.kind === "spades")!;
  s = step(s, {
    kind: "respond",
    choiceId: spades.id,
    option: "terraform",
    terraform: {
      hex: "D3",
      terrain: "mountain",
      build: false,
      deferBuild: true,
    },
  });
  expect(s.players.p1.resources).toMatchObject({ coins: 19, tools: 7 });
  expect(s.board.terrain.D3).toBe("mountain");
  expect(s.board.buildings.D3).toBeUndefined();
  const building = s.pending.find((c) => c.kind === "buildWorkshop")!;
  expect(building).toBeDefined();
  s = step(s, { kind: "respond", choiceId: building.id, option: "discard" });
  expect(s.players.p1.resources).toMatchObject({ coins: 19, tools: 7 });
  expect(s.board.buildings.D3).toBeUndefined();
  expect(s.pending).toEqual([]);
});

it("BGA 939403443 steps 23–24: Psychics charge 1/11/0 to 0/8/4 and retain their action", () => {
  let s = actionState();
  s.players.p1.faction = "psychics";
  s.players.p1.resources.power = [1, 11, 0];
  s = step(s, { kind: "special", source: "faction:psychics" });
  expect(s.players.p1.resources.power).toEqual([0, 8, 4]);
  expect(s.activeSeat).toBe("p1");
  expect(s.players.p1.primaryDone).toBe(false);
  const before = structuredClone(s);
  expect(
    applyAction(s, "p1", { kind: "special", source: "faction:psychics" }).ok,
  ).toBe(false);
  expect(s).toEqual(before);
  s = step(s, { kind: "powerAction", id: "coins" });
  expect(s.players.p1.primaryDone).toBe(true);
});

it("BGA 939403443 steps 53–57: neutral palace grants tokens before placement and four power income", () => {
  let s = actionState();
  const p = s.players.p1;
  p.native = "lake";
  p.faction = "psychics";
  p.bonus = "school";
  p.resources = {
    ...p.resources,
    coins: 12,
    tools: 10,
    scholars: 0,
    power: [10, 0, 2],
    books: [0, 2, 1, 2],
  };
  s.board.buildings = {
    C2: { seat: "p1", kind: "school" },
    B5: { seat: "p1", kind: "workshop" },
    D2: { seat: "p2", kind: "workshop" },
  };
  s.players.p2.leechPolicy.enabled = true;
  s.setup.innovations = ["neutral-palace"];
  s.setup.innovationCosts = { "neutral-palace": [0, 0, 0, 2] };
  s.shared.innovations = ["neutral-palace"];
  s = step(s, {
    kind: "innovation",
    id: "neutral-palace",
    books: [0, 2, 1, 2],
  });
  expect(s.players.p1.resources).toMatchObject({
    coins: 7,
    tools: 10,
    power: [10, 0, 4],
    books: [0, 0, 0, 0],
  });
  expect(s.pending.map((c) => c.kind)).toEqual(["neutral"]);
  const neutral = s.pending[0];
  expect(neutral.buildingKind).toBe("palace");
  const before = structuredClone(s);
  expect(
    applyAction(s, "p1", {
      kind: "respond",
      choiceId: neutral.id,
      option: "C2",
    }).ok,
  ).toBe(false);
  expect(s).toEqual(before);
  s = step(s, { kind: "respond", choiceId: neutral.id, option: "C3" });
  expect(s.players.p1.resources).toMatchObject({
    tools: 7,
    coins: 7,
    power: [10, 0, 4],
  });
  expect(s.board.terrain.C3).toBe("lake");
  expect(s.board.buildings.C3).toEqual({
    seat: "p1",
    kind: "palace",
    neutral: true,
  });
  expect(s.players.p1.palace).toBeFalsy();
  expect(s.pending.some((c) => c.kind === "competency")).toBe(false);
  s.players.p1.bonus = "power";
  giveIncome(s);
  expect(s.players.p1.resources).toMatchObject({
    tools: 9,
    coins: 9,
    scholars: 1,
    power: [2, 8, 4],
  });
});

it("BGA 939403443 steps 66–68: neutral guild costs terrain tools, scores as a guild and adds five coin income", () => {
  let s = actionState();
  const p = s.players.p1;
  p.faction = "omar";
  p.bonus = "river";
  p.vp = 23;
  p.resources.coins = 31;
  p.resources.tools = 11;
  p.resources.books = [0, 2, 0, 3];
  s.setup.roundTiles[0] = "guild-law";
  s.board.buildings = {
    B4: { seat: "p1", kind: "school" },
    B6: { seat: "p1", kind: "workshop" },
    E2: { seat: "p1", kind: "tower", neutral: true },
  };
  s.setup.innovations = s.shared.innovations = ["neutral-guild"];
  s.setup.innovationCosts = { "neutral-guild": [0, 0, 0, 2] };
  s = step(s, { kind: "innovation", id: "neutral-guild", books: [0, 2, 0, 3] });
  expect(s.pending[0].buildingKind).toBe("guild");
  s = step(s, { kind: "respond", choiceId: s.pending[0].id, option: "A4" });
  expect(s.board.buildings.A4).toEqual({
    seat: "p1",
    kind: "guild",
    neutral: true,
  });
  expect(s.players.p1.resources).toMatchObject({ tools: 5, coins: 26 });
  expect(s.players.p1.vp).toBe(26);
  expect(s.pending).toEqual([]);
  giveIncome(s);
  // Omar 2 coins + innovation 5. Neutral guild does not expose guild income.
  expect(s.players.p1.resources.coins).toBe(33);
});

it("BGA 937134162 replay steps 61–88: neutral university needs no palace surcharge or competency and earns six income points", () => {
  let s = actionState();
  const p = s.players.p1;
  p.native = "lake";
  p.faction = "psychics";
  p.palace = "engineering-palace";
  p.bonus = "river";
  p.resources.books = [2, 1, 1, 1];
  p.resources.scholars = 0;
  p.vp = 20;
  // The original two-player map is unsupported locally. Use an adjacent pair
  // on the supported map with the same already-native target and no leech.
  s.board.buildings = { C2: { seat: "p1", kind: "palace" } };
  s.board.terrain.C3 = "lake";
  s.setup.innovations = s.shared.innovations = ["neutral-university"];
  s.setup.innovationCosts = { "neutral-university": [2, 0, 0, 0] };
  const before = structuredClone(p.resources);
  s = step(s, {
    kind: "innovation",
    id: "neutral-university",
    books: [2, 1, 1, 1],
  });
  expect(s.pending.map((c) => c.kind)).toEqual(["neutral"]);
  expect(s.pending[0].buildingKind).toBe("university");
  s = step(s, { kind: "respond", choiceId: s.pending[0].id, option: "C3" });
  expect(s.board.buildings.C3).toEqual({
    seat: "p1",
    kind: "university",
    neutral: true,
  });
  expect(s.players.p1.resources).toMatchObject({
    coins: before.coins,
    tools: before.tools,
    books: [0, 0, 0, 0],
  });
  expect(s.players.p1.vp).toBe(20);
  expect(s.pending).toEqual([]);
  expect(s.players.p1.competencies).toEqual([]);
  for (const round of [4, 5, 6]) {
    s.round = round;
    giveIncome(s);
    expect(s.players.p1.vp).toBe(20 + 2 * (round - 3));
    expect(s.players.p1.resources.scholars).toBe(0);
  }
});

it("BGA 937134162 replay steps 76–77: palace, neutral university and workshop form a seven-power city", () => {
  let s = actionState();
  s.players.p1.faction = "psychics";
  s.players.p1.vp = 22;
  s.players.p1.resources.scholars = 0;
  s.setup.roundTiles[0] = "guild-law";
  // Translate the old two-player A5/A6/B6 group to connected supported cells.
  s.board.buildings = {
    A4: { seat: "p1", kind: "palace" },
    A5: { seat: "p1", kind: "university", neutral: true },
  };
  s.board.terrain.B5 = "forest";
  s = step(s, { kind: "terraform", hex: "B5", terrain: "forest", build: true });
  const city = s.pending.find((c) => c.kind === "city")!;
  expect(city).toBeDefined();
  expect(
    new Set(Object.values(s.board.buildings).map((b) => b.cityId)).size,
  ).toBe(1);
  s = step(s, { kind: "respond", choiceId: city.id, option: "scholar" });
  expect(s.players.p1).toMatchObject({
    vp: 30,
    keys: 1,
    resources: { scholars: 1 },
  });
});
