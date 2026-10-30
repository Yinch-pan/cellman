import { expect, it } from "vitest";
import { createGame, RULES_VERSION } from "../src/state";
import { applyAction, getAvailableChoices } from "../src/engine";
import { createGame as createV6Game } from "../legacy/v6/state";
import { applyAction as applyV6Action } from "../legacy/v6/engine";
import { sampleSetup } from "./fixtures/setup";
import { officialLarge } from "../src/map";
import { replayRecord, type RecordedCommand } from "../src/replay";
import type { GameAction, GameState, SetupConfig } from "../src/types";

function config(version = RULES_VERSION): SetupConfig {
  return {
    ...sampleSetup(),
    rulesVersion: version,
    offers: [
      { native: "forest", faction: "felines", bonus: "coins" },
      { native: "mountain", faction: "lizards", bonus: "power" },
      { native: "desert", faction: "illusionists", bonus: "guild" },
    ],
  };
}
function step(s: GameState, a: GameAction, seat = s.activeSeat) {
  const result = applyAction(s, seat, a);
  if (!result.ok) throw Error(result.error.code);
  return result.state;
}
function place(s: GameState): GameAction {
  return {
    kind: "place",
    hex: Object.values(officialLarge.hexes).find(
      (h) =>
        h.terrain === s.players[s.activeSeat].native &&
        !s.board.buildings[h.id],
    )!.id,
  };
}
function drafted(setup = config()) {
  let s = createGame(setup);
  for (const offer of [2, 1, 0]) s = step(s, { kind: "chooseSetup", offer });
  return s;
}
function ready(setup = config()) {
  let s = drafted(setup);
  while (s.phase === "placement") s = step(s, place(s));
  return s;
}

it("BGA 938757204 moves 4–10: all six workshops precede starting rewards and capital", () => {
  let s = drafted();
  for (let i = 0; i < 6; i++) {
    expect(s.phase).toBe("placement");
    expect(s.pending).toEqual([]);
    for (const p of Object.values(s.players)) {
      expect(p.resources).toMatchObject({
        coins: 0,
        tools: 0,
        scholars: 0,
        books: [0, 0, 0, 0],
      });
      expect(p.science).toEqual([0, 0, 0, 0]);
    }
    s = step(s, place(s));
  }
  expect(s.phase).toBe("setup");
  expect(s.setupStage).toBe("rewards");
  expect(s.pending.map((c) => [c.seat, c.kind, c.source])).toEqual([
    ["p2", "science", "setup-lizards"],
    ["p2", "science", "setup-lizards"],
    ["p3", "spades", "setup-desert"],
  ]);
  expect(getAvailableChoices(s).map((c) => c.seat)).toEqual(["p2", "p2"]);
  const desert = s.pending.find((c) => c.kind === "spades")!;
  expect(desert).toMatchObject({ canBuild: false, canBuySpades: false });
  expect(
    applyAction(s, "p3", {
      kind: "respond",
      choiceId: desert.id,
      option: "discard",
    }).ok,
  ).toBe(false);
  for (const option of ["0", "1"]) {
    const c = getAvailableChoices(s)[0];
    s = step(s, { kind: "respond", choiceId: c.id, option }, c.seat);
    expect(s.players.p1.resources.coins).toBe(0);
  }
  s = step(
    s,
    { kind: "respond", choiceId: desert.id, option: "discard" },
    "p3",
  );
  expect(s.phase).toBe("actions");
  expect(s.setupStage).toBeUndefined();
  expect(s.players.p1.science).toEqual([2, 1, 1, 2]);
  expect(s.players.p2.science).toEqual([1, 1, 0, 0]);
  expect(s.players.p1.resources.coins).toBeGreaterThanOrEqual(15);
});

it("BGA 939319293 moves 19–23: homeland rewards precede inventor competency, then capital and income", () => {
  const setup = config();
  setup.offers![0] = {
    native: "wasteland",
    faction: "inventors",
    bonus: "coins",
  };
  let s = ready(setup);
  expect(s.setupStage).toBe("rewards");
  expect(getAvailableChoices(s)[0].source).toBe("setup-wasteland");
  expect(s.pending.some((c) => c.kind === "competency")).toBe(false);
  while (s.setupStage === "rewards") {
    const next = getAvailableChoices(s)[0];
    s = step(
      s,
      {
        kind: "respond",
        choiceId: next.id,
        option: next.kind === "spades" ? "discard" : "0",
      },
      next.seat,
    );
  }
  expect(s.setupStage).toBe("competencies");
  expect(s.players.p1.resources.coins).toBe(0);
  expect(s.players.p1.resources.tools).toBe(0);
  expect(s.players.p1.resources.books[0]).toBe(1);
  const c = getAvailableChoices(s)[0];
  expect(c).toMatchObject({ kind: "competency", source: "setup-competency" });
  s = step(
    s,
    { kind: "respond", choiceId: c.id, option: "immediate-resources" },
    c.seat,
  );
  expect(s.phase).toBe("actions");
  expect(s.setupStage).toBeUndefined();
  expect(s.players.p1.resources.coins).toBeGreaterThanOrEqual(17);
  expect(s.players.p1.resources.tools).toBeGreaterThanOrEqual(5);
  expect(s.players.p1.resources.books[0]).toBeGreaterThanOrEqual(1);
});

it("new setup sequence replays exactly after every persisted command", () => {
  const setup = config();
  let s = createGame(setup);
  const commands: RecordedCommand[] = [];
  while (s.phase !== "actions") {
    const c = getAvailableChoices(s)[0];
    const seat = c?.seat ?? s.activeSeat;
    const action: GameAction =
      s.phase === "draft"
        ? { kind: "chooseSetup", offer: Number(seat.slice(1)) - 1 }
        : c
          ? {
              kind: "respond",
              choiceId: c.id,
              option: c.kind === "spades" ? "discard" : "0",
            }
          : place(s);
    s = step(s, action, seat);
    s.revision++;
    commands.push({ revision: s.revision, seat, action });
    expect(
      replayRecord({ initial: createGame(setup), commands }).state,
    ).toEqual(s);
  }
});

it("v6 dispatch retains early resources and pre-placement rewards exactly", () => {
  const setup = config("aoi-1.1+2024-09.engine-6");
  let current = createGame(setup);
  let frozen = createV6Game(setup);
  expect(current).toEqual(frozen);
  for (const offer of [2, 1, 0]) {
    const action = { kind: "chooseSetup", offer } as const;
    const result = applyV6Action(frozen, frozen.activeSeat, action);
    expect(result.ok).toBe(true);
    if (result.ok) frozen = result.state;
    current = step(current, action);
    expect(current).toEqual(frozen);
  }
  expect(current.phase).toBe("placement");
  expect(current.players.p1.resources.coins).toBe(15);
  expect(
    current.pending.filter((c) => c.source === "setup-lizards"),
  ).toHaveLength(2);
});
