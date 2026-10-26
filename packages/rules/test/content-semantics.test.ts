import { describe, expect, it } from "vitest";
import { actionState } from "./fixtures/actions";
import { sampleSetup } from "./fixtures/setup";
import { applyAction, getAvailableChoices } from "../src/engine";
import { createGame, validateState } from "../src/state";
import { snakeSetup } from "../src/setup";
import { giveIncome } from "../src/rounds";
import { officialLarge, terrainCycle } from "../src/map";
import { factions, bonusIds } from "../src/content";
import type { GameAction, GameState, Terrain } from "../src/types";
import { replayRecord } from "../src/replay";
import { applyActionRaw as frozenV5Action } from "../legacy/v5/engine";
import { auditState } from "./fixtures/content-audit";

function step(s: GameState, a: GameAction, seat = "p1") {
  const before = structuredClone(s);
  const r = applyAction(s, seat, a);
  expect(s).toEqual(before);
  if (!r.ok) throw Error(`${JSON.stringify(a)}: ${r.error.code}`);
  expect(validateState(r.state)).toEqual([]);
  return JSON.parse(JSON.stringify(r.state)) as GameState;
}
function respond(
  s: GameState,
  kind: GameState["pending"][number]["kind"],
  option: string,
  extra = {},
) {
  const c = getAvailableChoices(s).find(
    (c) => c.seat === "p1" && c.kind === kind,
  );
  if (!c)
    throw Error(`Missing available ${kind}: ${JSON.stringify(s.pending)}`);
  return step(s, { kind: "respond", choiceId: c.id, option, ...extra });
}
function palace(id: string) {
  const s = auditState();
  s.board.buildings.B4.kind = "guild";
  s.players.p1.draftPalace = id;
  return step(s, { kind: "upgrade", hex: "B4", to: "palace" });
}
const startScience: Record<string, number[]> = {
  blessed: [1, 1, 1, 1],
  felines: [1, 0, 0, 1],
  goblins: [1, 0, 1, 0],
  illusionists: [0, 0, 0, 2],
  inventors: [0, 0, 0, 0],
  lizards: [0, 0, 0, 0],
  moles: [0, 0, 2, 0],
  monks: [0, 1, 0, 0],
  navigators: [0, 3, 0, 0],
  omar: [1, 0, 1, 0],
  philosophers: [2, 0, 0, 0],
  psychics: [1, 0, 0, 1],
};

describe("content acceptance: independent starting values for all 84 faction/homeland pairs", () => {
  for (const faction of Object.keys(startScience))
    for (const native of terrainCycle)
      it(`${faction} / ${native}`, () => {
        const config = sampleSetup();
        const others = terrainCycle.filter((t) => t !== native);
        const otherFactions = Object.keys(startScience).filter(
          (f) => f !== faction,
        );
        config.players.forEach((p: any, i: number) => {
          p.native = i ? others[i - 1] : native;
          p.faction = i ? otherFactions[i - 1] : faction;
        });
        const p = createGame(config).players.p1;
        expect(p.science).toEqual(
          startScience[faction].map((n) => n + (native === "forest" ? 1 : 0)),
        );
        expect(p.resources.coins).toBe(15);
        expect(p.resources.tools).toBe(
          3 +
            (native === "wasteland" ? 1 : 0) +
            (["goblins", "psychics"].includes(faction) ? 1 : 0),
        );
        expect(p.resources.scholars).toBe(native === "swamp" ? 1 : 0);
        expect(p.sailing).toBe(native === "lake" ? 1 : 0);
        const base =
          native === "forest"
            ? [4, 8, 0]
            : native === "swamp"
              ? [3, 9, 0]
              : [5, 7, 0];
        const extra = p.science.filter((n) => n >= 3).length;
        expect(p.resources.power).toEqual([
          base[0] - extra,
          base[1] + extra,
          0,
        ]);
      });
});

describe("faction effects", () => {
  it("blessed receives exactly three virtual science levels at round settlement", () => {
    const s = auditState();
    s.setup.roundTiles[0] = "school-bank";
    s.players.p1.faction = "blessed";
    s.players.p1.bonus = "river";
    s.shared.bonusCoins.bigbuilding = 0;
    s.players.p2.passed = s.players.p3.passed = true;
    s.passOrder = ["p2", "p3"];
    const n = step(s, { kind: "pass", bonus: "bigbuilding" });
    expect(n.round).toBe(2);
    expect(n.players.p1.resources.coins).toBe(33);
    expect(n.players.p1.science).toEqual([0, 0, 0, 0]);
  });
  it.each(["felines", "lizards"])(
    "%s city rewards are selectable and finish without dropping rewards",
    (faction) => {
      const s = auditState();
      s.players.p1.faction = faction;
      s.board.buildings = {
        A4: { seat: "p1", kind: "workshop" },
        A5: { seat: "p1", kind: "guild" },
        A6: { seat: "p1", kind: "school" },
        B5: { seat: "p1", kind: "workshop" },
      };
      s.board.terrain.B4 = "forest";
      let n = step(s, { kind: "upgrade", hex: "A4", to: "guild" });
      n = respond(n, "city", "coins");
      if (faction === "felines") {
        for (const track of ["0", "1", "2"]) n = respond(n, "science", track);
        n = respond(n, "book", "3");
        expect(n.players.p1.science).toEqual([1, 1, 1, 0]);
        expect(n.players.p1.resources.books).toEqual([0, 0, 0, 1]);
      } else {
        expect(
          getAvailableChoices(n).some((c) => c.kind === "freeWorkshop"),
        ).toBe(false);
        n = respond(n, "spades", "terraform", {
          terraform: { hex: "C5", terrain: "forest", build: false },
        });
        const before = structuredClone(n.players.p1.resources);
        n = respond(n, "freeWorkshop", "C5");
        expect(n.players.p1.resources).toEqual(before);
        expect(n.board.buildings.C5.kind).toBe("workshop");
      }
      expect(n.pending).toEqual([]);
      expect(step(n, { kind: "endTurn" }).activeSeat).toBe("p2");
    },
  );
  it("goblins gain coins for every used spade, including free spades on two tiles", () => {
    const s = auditState();
    s.players.p1.faction = "goblins";
    s.players.p1.palace = "spades-special";
    let n = step(s, { kind: "special", source: "palace:spades-special" });
    n = respond(n, "spades", "terraform", {
      terraform: {
        hex: "C5",
        terrain: "forest",
        build: true,
        additional: [{ hex: "B5", terrain: "forest" }],
      },
    });
    expect(n.players.p1.resources.coins).toBe(32); // 30 + 2*2 - workshop 2
    expect(n.players.p1.resources.tools).toBe(19);
  });
  it.each([3, 4, 5])("illusionists %i players discount and points", (count) => {
    const s = auditState();
    s.players.p1.faction = "illusionists";
    s.players.p1.resources.power = [0, 0, 12];
    for (let i = 4; i <= count; i++) {
      s.players[`p${i}`] = { ...structuredClone(s.players.p3), seat: `p${i}` };
      s.turnOrder.push(`p${i}`);
    }
    const n = step(s, { kind: "powerAction", id: "coins" });
    expect(n.players.p1.resources.power).toEqual([3, 0, 9]);
    expect(n.players.p1.resources.coins).toBe(37);
    expect(n.players.p1.vp).toBe(count === 3 ? 21 : 22);
  });
  it("navigators and river bonus stack only on riverbank workshops", () => {
    for (const [hex, river] of [
      ["C5", true],
      ["I6", false],
    ] as const) {
      const s = auditState();
      s.players.p1.faction = "navigators";
      s.players.p1.bonus = "river";
      s.board.buildings = {
        [river ? "B4" : "I5"]: { seat: "p1", kind: "workshop" },
      };
      s.board.terrain[hex] = "forest";
      const n = step(s, {
        kind: "terraform",
        hex,
        terrain: "forest",
        build: true,
      });
      expect(n.players.p1.vp).toBe(river ? 24 : 20);
      expect(n.players.p1.resources.coins).toBe(river ? 29 : 28);
    }
  });
  it("omar recurring income is exactly two coins and two power", () => {
    const s = auditState();
    s.board.buildings = {};
    const p = s.players.p1;
    p.faction = "omar";
    p.bonus = "river";
    giveIncome(s);
    expect(p.resources.coins).toBe(32);
    expect(p.resources.power).toEqual([0, 10, 2]);
  });
  it("philosophers obtain the chosen competency's color plus a freely selected book", () => {
    const s = auditState();
    s.players.p1.faction = "philosophers";
    s.board.buildings.B4.kind = "guild";
    let n = step(s, { kind: "upgrade", hex: "B4", to: "school" });
    const cell = n.shared.competencies.find(
      (c) => c.id === "immediate-resources",
    )!;
    n = respond(n, "competency", cell.id);
    expect(n.players.p1.resources.books[cell.color]).toBe(cell.row + 1);
    n.players.p1.primaryDone = false;
    n = step(n, { kind: "special", source: "faction:philosophers" });
    const before = [...n.players.p1.resources.books];
    n = respond(n, "book", "3");
    expect(n.players.p1.resources.books[3]).toBe(before[3] + 1);
  });
  it("psychics gain 5 power, retain exactly one main action and cannot repeat", () => {
    let s = auditState();
    s.players.p1.faction = "psychics";
    s = step(s, { kind: "special", source: "faction:psychics" });
    expect(s.players.p1.resources.power).toEqual([0, 7, 5]);
    expect(s.players.p1.primaryDone).toBe(false);
    expect(
      applyAction(s, "p1", { kind: "special", source: "faction:psychics" }),
    ).toMatchObject({ ok: false, error: { code: "SPECIAL_USED" } });
    s = step(s, { kind: "powerAction", id: "coins" });
    expect(s.players.p1.primaryDone).toBe(true);
  });
  it("moles can build two bridges in different turns of one round", () => {
    let s = auditState();
    s.players.p1.faction = "moles";
    s.board.buildings = {
      B1: { seat: "p1", kind: "workshop" },
      B4: { seat: "p1", kind: "workshop" },
    };
    for (const option of ["A3:B1", "A3:B4"]) {
      s.players.p1.primaryDone = false;
      s = step(s, { kind: "special", source: "faction:moles" });
      s = respond(s, "bridge", option);
    }
    expect(s.board.bridges).toHaveLength(2);
    expect(s.players.p1.resources.tools).toBe(18);
  });
});

describe("all faction setup workflows through the actual snake draft", () => {
  for (const faction of Object.keys(factions))
    it(`${faction}: draft, placement, starting choices and first turn`, () => {
      const config = snakeSetup(
        `audit-${faction}`,
        [1, 2, 3].map((i) => ({ id: `p${i}`, name: `玩家${i}` })),
        "forward",
        () => 0.41,
      );
      config.draft!.pools.faction = [
        faction,
        ...Object.keys(factions)
          .filter((f) => f !== faction)
          .slice(0, 2),
      ];
      config.draft!.pools.native = ["forest", "lake", "mountain"];
      config.players.sort((a, b) => a.seat.localeCompare(b.seat));
      let s = createGame(config);
      while (s.phase === "draft") {
        const seat = s.activeSeat,
          picks = s.draftPicks![seat];
        const category = (
          ["faction", "native", "palace", "bonus"] as const
        ).find((c) => !picks[c])!;
        const options = config.draft!.pools[category];
        const option = options.find(
          (o) => !Object.values(s.draftPicks!).some((p) => p[category] === o),
        )!;
        s = step(s, { kind: "draftPick", category, option }, seat);
      }
      let guard = 0;
      while ((s.phase !== "actions" || s.pending.length) && guard++ < 80) {
        if (s.pending.length) {
          const c = getAvailableChoices(s)[0];
          const option =
            c.kind === "competency"
              ? "immediate-resources"
              : c.kind === "spades"
                ? "discard"
                : "0";
          s = step(s, { kind: "respond", choiceId: c.id, option }, c.seat);
        } else {
          const seat = s.activeSeat;
          const hex = Object.values(officialLarge.hexes).find(
            (h) =>
              h.terrain === s.players[seat].native && !s.board.buildings[h.id],
          )!.id;
          s = step(s, { kind: "place", hex }, seat);
        }
      }
      expect(s.phase).toBe("actions");
      expect(s.pending).toEqual([]);
      const p = s.players.p1;
      expect(p.faction).toBe(faction);
      const bs = Object.values(s.board.buildings).filter(
        (b) => b.seat === "p1",
      );
      expect(bs.map((b) => b.kind).sort()).toEqual(
        faction === "monks"
          ? ["university"]
          : faction === "omar"
            ? ["tower", "workshop", "workshop"]
            : ["workshop", "workshop"],
      );
      expect(p.competencies).toEqual(
        ["inventors", "monks"].includes(faction) ? ["immediate-resources"] : [],
      );
      if (faction === "lizards")
        expect(p.science).toEqual(
          p.native === "forest" ? [3, 1, 1, 1] : [2, 0, 0, 0],
        );
      expect(
        step(s, {
          kind: "pass",
          bonus: config.draft!.pools.bonus.find(
            (b) => !Object.values(s.players).some((p) => p.bonus === b),
          )!,
        }).players.p1.passed,
      ).toBe(true);
    });
});

describe("palace active and passive effects", () => {
  it.each([
    ["tools-special", 2, 0],
    ["guild-special", 0, 3],
  ] as const)(
    "%s special resource gains and repeat prevention",
    (id, tools, coins) => {
      let s = auditState();
      s.players.p1.palace = id;
      s = step(s, { kind: "special", source: `palace:${id}` });
      expect(s.players.p1.resources.tools).toBe(20 + tools);
      expect(s.players.p1.resources.coins).toBe(30 + coins);
      if (id === "guild-special") s = respond(s, "book", "2");
      s.players.p1.primaryDone = false;
      expect(
        applyAction(s, "p1", { kind: "special", source: `palace:${id}` }),
      ).toMatchObject({ ok: false, error: { code: "SPECIAL_USED" } });
    },
  );
  it.each(["upgrade-special", "downgrade-special"])(
    "%s transforms the owned building and checks supply",
    (id) => {
      const s = auditState();
      s.players.p1.palace = id;
      s.board.buildings.B4.kind =
        id === "upgrade-special" ? "workshop" : "school";
      const n = step(s, { kind: "special", source: `palace:${id}`, hex: "B4" });
      expect(n.board.buildings.B4.kind).toBe("guild");
      expect(n.players.p1.resources.coins).toBe(30);
      expect(n.players.p1.resources.tools).toBe(
        id === "upgrade-special" ? 20 : 21,
      );
      expect(n.players.p1.vp).toBe(id === "upgrade-special" ? 20 : 23);
      for (const hex of ["A1", "A3", "A4", "A5"])
        s.board.buildings[hex] = { seat: "p1", kind: "guild" };
      expect(
        applyAction(s, "p1", {
          kind: "special",
          source: `palace:${id}`,
          hex: "B4",
        }),
      ).toMatchObject({ ok: false, error: { code: "NO_BUILDING_SUPPLY" } });
    },
  );
  it("SH5 grants and consumes one competency choice", () => {
    let s = palace("competency-palace");
    s = respond(s, "competency", "immediate-resources");
    expect(s.players.p1.competencies).toEqual(["immediate-resources"]);
    expect(s.pending).toEqual([]);
  });
  it("SH6 advances chosen science by two, respects keys and max level", () => {
    for (const [before, keys, expected] of [
      [0, 0, 2],
      [6, 0, 7],
      [11, 1, 12],
    ] as const) {
      const s = auditState();
      s.players.p1.palace = "science-special";
      s.players.p1.science[2] = before;
      s.players.p1.keys = keys;
      const n = step(s, {
        kind: "special",
        source: "palace:science-special",
        track: 2,
      });
      expect(n.players.p1.science).toEqual([0, 0, expected, 0]);
    }
  });
  it("SH7 scores every school when passing including round six", () => {
    for (const round of [1, 6]) {
      const s = auditState();
      s.round = round;
      s.players.p1.palace = "school-pass";
      s.board.buildings = {
        B4: { seat: "p1", kind: "school" },
        A1: { seat: "p1", kind: "school" },
      };
      expect(step(s, { kind: "pass", bonus: "school" }).players.p1.vp).toBe(26);
    }
  });
  it("SH8 creates a four-building city at six power, ordinary palace does not", () => {
    for (const id of ["city-discount", "tools-special"]) {
      const s = auditState();
      s.players.p1.palace = id;
      s.board.buildings = {
        A4: { seat: "p1", kind: "workshop" },
        A5: { seat: "p1", kind: "school" },
        A6: { seat: "p1", kind: "workshop" },
        B5: { seat: "p1", kind: "workshop" },
      };
      const n = step(s, { kind: "upgrade", hex: "A4", to: "guild" });
      expect(n.pending.filter((c) => c.kind === "city")).toHaveLength(
        id === "city-discount" ? 1 : 0,
      );
    }
  });
  it("SH10 gives 12 power and two independently chosen books on construction", () => {
    let s = palace("power-books");
    expect(s.players.p1.resources.power).toEqual([0, 0, 12]);
    s = respond(s, "book", "0");
    s = respond(s, "book", "3");
    expect(s.players.p1.resources.books).toEqual([1, 0, 0, 1]);
  });
  it("SH11 grants a real city tile and key with no city-sized cluster", () => {
    let s = palace("city-palace");
    s = respond(s, "city", "tools");
    expect(s.players.p1.keys).toBe(1);
    expect(s.players.p1.vp).toBe(24);
    expect(s.players.p1.resources.tools).toBe(19);
  });
  it("SH12 adds exactly two points per workshop", () => {
    const s = auditState();
    s.players.p1.palace = "workshop-score";
    const n = step(s, {
      kind: "terraform",
      hex: "C5",
      terrain: "forest",
      build: true,
    });
    expect(n.players.p1.vp).toBe(22);
  });
  it("SH13 guild reward stacks with BON3 but not an unrelated building", () => {
    const s = auditState();
    s.players.p1.palace = "guild-special";
    s.players.p1.bonus = "guild";
    expect(
      step(s, { kind: "upgrade", hex: "B4", to: "guild" }).players.p1.vp,
    ).toBe(26);
  });
  it("SH14 grants two free sailing advances and their book reward", () => {
    let s = palace("river-city");
    expect(s.players.p1.sailing).toBe(2);
    expect(s.players.p1.vp).toBe(22);
    s = respond(s, "book", "1");
    s = respond(s, "book", "2");
    expect(s.players.p1.resources.books).toEqual([0, 1, 1, 0]);
  });
  it("SH14 river link actually forms a city and rejects empty river use", () => {
    const s = auditState();
    s.players.p1.palace = "river-city";
    s.board.buildings = {
      A1: { seat: "p1", kind: "palace" },
      B1: { seat: "p1", kind: "workshop" },
      A3: { seat: "p1", kind: "guild" },
      A4: { seat: "p1", kind: "workshop" },
    };
    const n = step(s, { kind: "riverCity", hex: "A2" });
    expect(n.pending.filter((c) => c.kind === "city")).toHaveLength(1);
    expect(n.board.cityLinks).toEqual([{ seat: "p1", river: "A2" }]);
    expect(
      applyAction(s, "p1", { kind: "riverCity", hex: "I4" }),
    ).toMatchObject({ ok: false, error: { code: "NO_CITY_CREATED" } });
  });
  it("SH16 places a remote guild without extra payment and triggers guild bonus", () => {
    let s = auditState();
    s.players.p1.bonus = "guild";
    s.players.p1.draftPalace = "remote-guild";
    s.board.buildings.B4.kind = "guild";
    s = step(s, { kind: "upgrade", hex: "B4", to: "palace" });
    s = respond(s, "freeGuild", "I1");
    expect(s.board.buildings.I1.kind).toBe("guild");
    expect(s.players.p1.resources).toMatchObject({ coins: 24, tools: 16 });
    expect(s.players.p1.vp).toBe(23);
  });
  it("SH-X1 legacy extra immediate score is exactly ten", () =>
    expect(palace("immediate-score").players.p1.vp).toBe(30));
});

describe("bonus incomes and active rewards", () => {
  it.each([
    ["coins", 6, 0, 0, 0, 0],
    ["power", 2, 0, 0, 4, 0],
    ["guild", 0, 0, 0, 3, 0],
    ["scholar", 0, 0, 1, 0, 0],
    ["school", 4, 0, 0, 0, 0],
    ["bigbuilding", 0, 1, 0, 0, 0],
    ["river", 0, 0, 0, 0, 0],
    ["spade-bonus", 0, 0, 0, 0, 1],
    ["bridge-bonus", 0, 0, 0, 0, 1],
    ["science-bonus", 0, 2, 0, 0, 0],
  ] as const)("%s income", (bonus, coins, tools, scholars, power, books) => {
    const s = auditState();
    s.board.buildings = {};
    const p = s.players.p1;
    p.bonus = bonus;
    giveIncome(s);
    expect(p.resources).toEqual({
      coins: 30 + coins,
      tools: 20 + tools,
      scholars: 3 + scholars,
      power: [0, 12 - power, power],
      books: [0, 0, 0, 0],
    });
    expect(
      s.pending.filter((c) => c.seat === "p1" && c.kind === "book"),
    ).toHaveLength(books);
  });
  it.each([0, null])("BON4 awards two points for scholar slot %s", (slot) => {
    const s = auditState();
    s.players.p1.bonus = "scholar";
    const n = step(s, { kind: "scholar", track: 0, slot });
    expect(n.players.p1.vp).toBe(22);
    expect(n.players.p1.science[0]).toBe(slot === null ? 1 : 3);
  });
  it.each([1, 6])(
    "BON5 science rewards resolve after passing in round %i",
    (round) => {
      let s = auditState();
      s.round = round;
      s.players.p1.bonus = "school";
      s.board.buildings = {
        A1: { seat: "p1", kind: "school" },
        B4: { seat: "p1", kind: "school" },
      };
      s = step(s, { kind: "pass", bonus: "scholar" });
      s = respond(s, "science", "1");
      s = respond(s, "science", "3");
      expect(s.players.p1.science).toEqual([0, 1, 0, 1]);
      expect(s.pending).toEqual([]);
      expect(s.activeSeat).toBe("p2");
    },
  );
  it("BON6 awards four per palace/university", () => {
    const s = auditState();
    s.players.p1.bonus = "bigbuilding";
    s.board.buildings = {
      B4: { seat: "p1", kind: "palace" },
      A1: { seat: "p1", kind: "university" },
    };
    expect(step(s, { kind: "pass", bonus: "school" }).players.p1.vp).toBe(28);
  });
  it("BON7 gives temporary reach without changing permanent sailing", () => {
    const s = auditState();
    s.board.buildings = { A1: { seat: "p1", kind: "workshop" } };
    s.board.terrain.A3 = "forest";
    const a: GameAction = {
      kind: "terraform",
      hex: "A3",
      terrain: "forest",
      build: true,
    };
    expect(applyAction(s, "p1", a)).toMatchObject({
      ok: false,
      error: { code: "OUT_OF_REACH" },
    });
    s.players.p1.bonus = "river";
    const n = step(s, a);
    expect(n.players.p1.sailing).toBe(0);
    expect(n.board.buildings.A3.kind).toBe("workshop");
  });
  it("BON8 free spade still pays workshop and can finish building", () => {
    let s = auditState();
    s.players.p1.bonus = "spade-bonus";
    s = step(s, { kind: "special", source: "bonus:spade-bonus" });
    s = respond(s, "spades", "terraform", {
      terraform: { hex: "C5", terrain: "forest", build: true },
    });
    expect(s.players.p1.resources).toMatchObject({ coins: 28, tools: 19 });
    expect(s.board.buildings.C5.kind).toBe("workshop");
  });
  it("BON9 builds a legal bridge without resources", () => {
    let s = auditState();
    s.players.p1.bonus = "bridge-bonus";
    s.board.buildings = { B1: { seat: "p1", kind: "workshop" } };
    s = step(s, { kind: "special", source: "bonus:bridge-bonus" });
    s = respond(s, "bridge", "A3:B1");
    expect(s.board.bridges).toHaveLength(1);
    expect(s.players.p1.resources).toMatchObject({ coins: 30, tools: 20 });
  });
  it("BON10 advances exactly one chosen science", () => {
    const s = auditState();
    s.players.p1.bonus = "science-bonus";
    expect(
      step(s, { kind: "special", source: "bonus:science-bonus", track: 3 })
        .players.p1.science,
    ).toEqual([0, 0, 0, 1]);
  });
});

describe("travel continues into construction in the default turn planner", () => {
  it.each(["tunnel", "flight"] as const)(
    "%s pays once and can build after deferred terraform",
    (travel) => {
      let s = auditState();
      s.board.buildings = { A1: { seat: "p1", kind: "workshop" } };
      s.board.terrain.A3 = "mountain";
      if (travel === "tunnel") s.players.p1.faction = "moles";
      else s.players.p1.palace = "flight";
      s = step(s, {
        kind: "terraform",
        hex: "A3",
        terrain: "forest",
        build: false,
        deferBuild: true,
        travel,
      });
      expect(s.players.p1.vp).toBe(25);
      s = respond(s, "buildWorkshop", "build");
      expect(s.board.buildings.A3.kind).toBe("workshop");
      expect(s.players.p1.resources).toMatchObject({
        coins: 28,
        tools: travel === "tunnel" ? 15 : 16,
        scholars: travel === "flight" ? 2 : 3,
      });
      expect(s.players.p1.vp).toBe(25);
    },
  );
  it.each(["tunnel", "flight"] as const)(
    "%s enforces distance and cannot reuse or forge the continuation",
    (travel) => {
      let s = auditState();
      s.board.buildings = { A1: { seat: "p1", kind: "workshop" } };
      s.board.terrain.A3 = s.board.terrain.A4 = s.board.terrain.A5 = "mountain";
      if (travel === "tunnel") s.players.p1.faction = "moles";
      else s.players.p1.palace = "flight";
      const target = travel === "tunnel" ? "A3" : "A4",
        tooFar = travel === "tunnel" ? "A4" : "A5";
      const a: GameAction = {
        kind: "terraform",
        hex: target,
        terrain: "forest",
        build: false,
        deferBuild: true,
        travel,
      };
      expect(applyAction(s, "p1", { ...a, hex: tooFar })).toMatchObject({
        ok: false,
        error: { code: "OUT_OF_REACH" },
      });
      s = step(s, a);
      const c = s.pending.find((c) => c.kind === "buildWorkshop")!;
      expect(
        applyAction(s, "p2", {
          kind: "respond",
          choiceId: c.id,
          option: "build",
        }),
      ).toMatchObject({ ok: false, error: { code: "WRONG_RESPONDER" } });
      s = step(s, { kind: "respond", choiceId: c.id, option: "build" });
      expect(
        applyAction(s, "p1", {
          kind: "respond",
          choiceId: c.id,
          option: "build",
        }),
      ).toMatchObject({ ok: false, error: { code: "STALE_CHOICE" } });
    },
  );
  it("v5 remains deterministic, including private turns; v6 alone fixes travel continuation", () => {
    const old = auditState();
    old.rulesVersion = old.setup.rulesVersion = "aoi-1.1+2024-09.engine-5";
    old.board.buildings = { A1: { seat: "p1", kind: "workshop" } };
    old.board.terrain.A3 = "mountain";
    old.players.p1.faction = "moles";
    const a: GameAction = {
      kind: "terraform",
      hex: "A3",
      terrain: "forest",
      travel: "tunnel",
      build: false,
      deferBuild: true,
    };
    expect(applyAction(old, "p1", a)).toEqual(frozenV5Action(old, "p1", a));
    const n = step(old, a),
      c = n.pending[0];
    expect(
      applyAction(n, "p1", {
        kind: "respond",
        choiceId: c.id,
        option: "build",
      }),
    ).toMatchObject({ ok: false, error: { code: "OUT_OF_REACH" } });
    const turn: GameAction = {
      kind: "turn",
      actions: [
        {
          kind: "terraform",
          hex: "A3",
          terrain: "forest",
          travel: "tunnel",
          build: true,
        },
        { kind: "endTurn" },
      ],
    };
    const expected = step(old, turn);
    expected.revision = 1;
    expect(
      replayRecord({
        initial: old,
        commands: [{ revision: 1, seat: "p1", action: turn }],
      }).state,
    ).toEqual(expected);
    expect(applyAction(old, "p1", turn)).toEqual(
      frozenV5Action(old, "p1", turn),
    );
  });
});

describe("ability boundaries and next-round reset", () => {
  it.each([
    "tools-special",
    "spades-special",
    "downgrade-special",
    "upgrade-special",
    "science-special",
    "guild-special",
  ])("%s cannot activate before building the drafted palace", (id) => {
    const s = auditState();
    s.players.p1.draftPalace = id;
    expect(
      applyAction(s, "p1", {
        kind: "special",
        source: `palace:${id}`,
        track: 0,
        hex: "B4",
      }),
    ).toMatchObject({ ok: false, error: { code: "SPECIAL_UNAVAILABLE" } });
  });
  it.each([
    "palace:tools-special",
    "palace:spades-special",
    "palace:downgrade-special",
    "palace:upgrade-special",
    "palace:science-special",
    "palace:guild-special",
    "bonus:spade-bonus",
    "bonus:bridge-bonus",
    "bonus:science-bonus",
    "faction:philosophers",
    "faction:psychics",
  ])("%s is available again next round", (source) => {
    let s = auditState();
    const [category, id] = source.split(":");
    if (category === "palace") s.players.p1.palace = id;
    if (category === "bonus") s.players.p1.bonus = id;
    if (category === "faction") s.players.p1.faction = id;
    if (id === "downgrade-special") s.board.buildings.B4.kind = "school";
    s.players.p1.usedSpecials = [source];
    s.players.p2.passed = s.players.p3.passed = true;
    s.passOrder = ["p2", "p3"];
    s.shared.bonusCoins.scholar = 0;
    s = step(s, { kind: "pass", bonus: "scholar" });
    // Round progression changes the active player and bonus tile; check reset
    // on the real transition, then isolate this player's next action.
    expect(s.round).toBe(2);
    expect(s.players.p1.usedSpecials).toEqual([]);
    while (s.pending.length) {
      const c = getAvailableChoices(s)[0];
      s = step(s, { kind: "respond", choiceId: c.id, option: "0" }, c.seat);
    }
    s.activeSeat = "p1";
    if (category === "bonus") s.players.p1.bonus = id;
    expect(
      step(s, { kind: "special", source, track: 0, hex: "B4" }).players.p1
        .usedSpecials,
    ).toContain(source);
  });
  it("travel with no payment and upgrading another player's school fail atomically", () => {
    const s = auditState();
    s.players.p1.palace = "flight";
    s.players.p1.resources.scholars = 0;
    s.board.buildings = { A1: { seat: "p1", kind: "workshop" } };
    s.board.terrain.A3 = "forest";
    const before = structuredClone(s);
    expect(
      applyAction(s, "p1", {
        kind: "terraform",
        hex: "A3",
        terrain: "forest",
        build: true,
        travel: "flight",
      }),
    ).toMatchObject({ ok: false, error: { code: "INSUFFICIENT_RESOURCES" } });
    expect(s).toEqual(before);
    s.players.p1.palace = "downgrade-special";
    s.board.buildings.B4 = { seat: "p2", kind: "school" };
    expect(
      applyAction(s, "p1", {
        kind: "special",
        source: "palace:downgrade-special",
        hex: "B4",
      }),
    ).toMatchObject({ ok: false, error: { code: "INVALID_DOWNGRADE" } });
  });
});

describe("terrain ongoing effects", () => {
  it.each([0, 1])("mountain income with %i guild", (g) => {
    const s = auditState();
    s.players.p1.native = "mountain";
    s.players.p1.bonus = "river";
    s.board.buildings = g ? { B4: { seat: "p1", kind: "guild" } } : {};
    giveIncome(s);
    expect(s.players.p1.resources.coins).toBe(g ? 35 : 32);
  });
  it("lake can reach sailing four, other terrains stop at three", () => {
    for (const native of ["lake", "forest"] as Terrain[]) {
      const s = auditState();
      s.players.p1.native = native;
      s.players.p1.sailing = 3;
      if (native === "forest")
        expect(
          applyAction(s, "p1", { kind: "advance", track: "sailing" }),
        ).toMatchObject({ ok: false, error: { code: "TRACK_MAX" } });
      else {
        const n = step(s, { kind: "advance", track: "sailing" });
        expect(n.players.p1.sailing).toBe(4);
        expect(n.pending.filter((c) => c.kind === "book")).toHaveLength(2);
      }
    }
  });
  it("plains discounts terraform technology to one coin", () => {
    const s = auditState();
    s.players.p1.native = "plains";
    expect(
      step(s, { kind: "advance", track: "terraform" }).players.p1.resources,
    ).toMatchObject({ coins: 29, tools: 19, scholars: 2 });
  });
  it("wasteland second innovation costs five books, third costs seven", () => {
    for (const count of [1, 2]) {
      const s = auditState();
      s.players.p1.native = "wasteland";
      s.players.p1.palace = "tools-special";
      s.players.p1.innovations =
        count === 1 ? ["sewerage"] : ["sewerage", "colleges"];
      s.players.p1.resources.books = [9, 9, 9, 9];
      s.shared.innovations = ["libraries"];
      const books: [number, number, number, number] =
        count === 1 ? [2, 1, 1, 1] : [4, 1, 1, 1];
      const n = step(s, { kind: "innovation", id: "libraries", books });
      expect(n.players.p1.resources.books.reduce((a, b) => a + b, 0)).toBe(
        36 - (count === 1 ? 5 : 7),
      );
    }
  });
});
