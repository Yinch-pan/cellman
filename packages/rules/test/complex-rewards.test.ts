import { it, expect } from "vitest";
import { applyAction, getAvailableChoices } from "../src/engine";
import { actionState } from "./fixtures/actions";
import { giveIncome } from "../src/rounds";
import type { GameState, GameAction } from "../src/types";
function step(s: GameState, a: GameAction) {
  const r = applyAction(s, "p1", a);
  if (!r.ok) throw Error(r.error.code);
  return r.state;
}
const orders = [
  ["spades", "bridge", "book"],
  ["spades", "book", "bridge"],
  ["bridge", "spades", "book"],
  ["bridge", "book", "spades"],
  ["book", "spades", "bridge"],
  ["book", "bridge", "spades"],
];
it("engineering spades keep the optional workshop inside their group and permit the opponent's leech", () => {
  let s = actionState();
  s.board.buildings = {
    A1: { seat: "p1", kind: "guild" },
    B4: { seat: "p1", kind: "workshop" },
    C6: { seat: "p2", kind: "guild" },
  };
  s.players.p1.resources.tools = 10;
  s.players.p1.resources.coins = 20;
  s.players.p2.leechPolicy.enabled = false;
  s.shared.palaces = ["engineering-palace"];
  s = step(s, {
    kind: "upgrade",
    hex: "A1",
    to: "palace",
    palace: "engineering-palace",
  });
  const spade = s.pending.find((c) => c.kind === "spades")!;
  s = step(s, {
    kind: "respond",
    choiceId: spade.id,
    option: "terraform",
    terraform: { hex: "C5", terrain: "forest", build: false, deferBuild: true },
  });
  const build = s.pending.find((c) => c.kind === "buildWorkshop")!;
  expect(build.batch).toBe(spade.batch);
  expect(getAvailableChoices(s).map((c) => c.id)).toEqual([build.id]);
  s = step(s, { kind: "respond", choiceId: build.id, option: "build" });
  const leech = getAvailableChoices(s).find(
    (c) => c.kind === "leech" && c.seat === "p2",
  )!;
  expect(leech).toBeDefined();
  const response = applyAction(s, "p2", {
    kind: "respond",
    choiceId: leech.id,
    option: "accept",
  });
  expect(response.ok).toBe(true);
  if (response.ok)
    expect(response.state.players.p2.vp).toBe(s.players.p2.vp - 1);
});
it.each(orders.map((x) => [x]))(
  "engineering palace resolves groups in order %j before city/key rewards",
  (order) => {
    let s = actionState();
    s.board.buildings = {
      A4: { seat: "p1", kind: "guild" },
      A5: { seat: "p1", kind: "school" },
      A6: { seat: "p1", kind: "workshop" },
      B5: { seat: "p1", kind: "workshop" },
    };
    s.players.p1.resources.tools = 20;
    s.players.p1.resources.coins = 20;
    s.players.p1.science = [7, 7, 7, 7];
    s.shared.palaces = ["engineering-palace"];
    s = step(s, {
      kind: "upgrade",
      hex: "A4",
      to: "palace",
      palace: "engineering-palace",
    });
    const city = s.pending.find((c) => c.kind === "city")!;
    expect(city).toBeDefined();
    for (const kind of order) {
      expect(getAvailableChoices(s).some((c) => c.id === city.id)).toBe(false);
      expect(
        applyAction(s, "p1", {
          kind: "respond",
          choiceId: city.id,
          option: "science",
        }).ok,
      ).toBe(false);
      while (
        s.pending.some(
          (c) => c.kind === kind && c.batch?.startsWith("engineering-palace:"),
        )
      ) {
        const c = getAvailableChoices(s).find((c) => c.kind === kind)!;
        expect(c).toBeDefined();
        s = step(s, {
          kind: "respond",
          choiceId: c.id,
          option: kind === "book" ? "0" : "discard",
        });
      }
    }
    expect(getAvailableChoices(s).some((c) => c.id === city.id)).toBe(true);
    s = step(s, { kind: "respond", choiceId: city.id, option: "science" });
    expect(s.players.p1.keys).toBe(1);
    expect(s.pending.filter((c) => c.kind === "key")).toHaveLength(4);
    let used = false;
    while (s.pending.some((c) => c.kind === "key")) {
      const c = getAvailableChoices(s).find((c) => c.kind === "key")!;
      s = step(s, {
        kind: "respond",
        choiceId: c.id,
        option: used ? "decline" : "use",
      });
      used = true;
    }
    expect(s.players.p1.science).toEqual([8, 7, 7, 7]);
    expect(s.players.p1.keysUsed).toBe(1);
  },
);
// Rulebook palace catalogue, independently transcribed expected income.
it.each([
  ["tools-special", 0, 0, 0, 5, 0],
  ["spades-special", 0, 0, 0, 0, 0],
  ["downgrade-special", 0, 0, 0, 2, 0],
  ["upgrade-special", 0, 0, 0, 2, 0],
  ["competency-palace", 0, 0, 0, 4, 0],
  ["science-special", 0, 0, 0, 2, 1],
  ["school-pass", 0, 0, 0, 4, 0],
  ["city-discount", 2, 1, 0, 2, 0],
  ["flight", 0, 0, 1, 0, 0],
  ["power-books", 6, 0, 0, 0, 0],
  ["city-palace", 0, 1, 0, 0, 0],
  ["workshop-score", 0, 0, 0, 8, 0],
  ["guild-special", 0, 0, 0, 0, 0],
  ["river-city", 0, 0, 0, 6, 0],
  ["engineering-palace", 0, 0, 0, 6, 0],
  ["remote-guild", 0, 0, 0, 2, 1],
  ["immediate-score", 0, 0, 0, 2, 0],
] as const)(
  "palace %s pays expected income",
  (palace, coins, tools, scholars, power, books) => {
    const s = actionState(),
      p = s.players.p1;
    s.board.buildings = {};
    p.native = "forest";
    p.faction = "blessed";
    p.bonus = "river";
    p.palace = palace;
    p.science = [0, 0, 0, 0];
    p.innovations = [];
    p.competencies = [];
    p.resources = {
      coins: 0,
      tools: 0,
      scholars: 0,
      books: [0, 0, 0, 0],
      power: [12, 0, 0],
    };
    giveIncome(s);
    expect(p.resources).toEqual({
      coins,
      tools: 1 + tools, // Always-visible base tool plus palace income.
      scholars,
      books: [0, 0, 0, 0],
      power: [12 - power, power, 0],
    });
    expect(
      s.pending.filter((c) => c.seat === "p1" && c.kind === "book"),
    ).toHaveLength(books);
  },
);
it("records simultaneous guild rewards separately without double counting", () => {
  const s = actionState();
  s.players.p1.bonus = "guild";
  s.players.p1.palace = "guild-special";
  s.setup.roundTiles[0] = "guild-law";
  const r = applyAction(s, "p1", { kind: "upgrade", hex: "A1", to: "guild" });
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(r.state.players.p1.vp - s.players.p1.vp).toBe(9);
  const sources = r.events.find((e) => e.kind === "ledger")!.details!
    .scoreSources as { seat: string; source: string; points: number }[];
  expect(sources.filter((e) => e.seat === "p1").map((e) => e.points)).toEqual([
    3, 3, 3,
  ]);
  expect(new Set(sources.map((e) => e.source)).size).toBe(3);
});
