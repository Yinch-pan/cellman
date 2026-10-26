import type { GameState, Player, SetupConfig } from "./types";
import { gainPower } from "./actions/power";
import { competencyMarket } from "./catalog";
import { factions } from "./content";
import { createGame as createLegacyGame } from "../v1/state";
export const RULES_VERSION = "aoi-1.1+2024-09.engine-2";
export const SUPPORTED_RULES = [RULES_VERSION, "aoi-1.1+2024-09"];
export function createGame(setup: SetupConfig): GameState {
  if (setup.rulesVersion === "aoi-1.1+2024-09")
    return createLegacyGame(setup) as GameState;
  if (setup.rulesVersion !== RULES_VERSION)
    throw new Error("RULESET_UNAVAILABLE");
  if (setup.mapId !== "official-large") throw new Error("UNSUPPORTED_MAP");
  if (setup.players.length < 3 || setup.players.length > 5)
    throw new Error("UNSUPPORTED_PLAYER_COUNT");
  if (new Set(setup.players.map((p) => p.seat)).size !== setup.players.length)
    throw new Error("DUPLICATE_SEAT");
  if (new Set(setup.players.map((p) => p.native)).size !== setup.players.length)
    throw new Error("DUPLICATE_HOMELAND");
  if (
    new Set(setup.players.map((p) => p.faction)).size !== setup.players.length
  )
    throw new Error("DUPLICATE_FACTION");
  if (setup.roundTiles.length !== 6) throw new Error("INVALID_ROUNDS");
  const players: Record<string, Player> = {};
  for (const p of setup.players) {
    const science: [number, number, number, number] = [0, 0, 0, 0];
    if (p.native === "forest") science.fill(1);
    factions[p.faction]?.science.forEach((n, i) => (science[i] += n));
    players[p.seat] = {
      ...p,
      resources: {
        coins: 15,
        tools:
          3 +
          (factions[p.faction]?.tools ?? 0) +
          (p.native === "wasteland" ? 1 : 0),
        scholars: p.native === "swamp" ? 1 : 0,
        books: [0, 0, 0, 0],
        power:
          p.native === "forest"
            ? [4, 8, 0]
            : p.native === "swamp"
              ? [3, 9, 0]
              : [5, 7, 0],
      },
      vp: 20,
      science,
      keys: 0,
      keysUsed: 0,
      terraformLevel: 0,
      sailing: p.native === "lake" ? 1 : 0,
      innovations: [],
      competencies: [],
      annexes: 0,
      palace: null,
      passed: false,
      primaryDone: false,
      usedSpecials: [],
      leechPolicy: { enabled: false, maxVpCost: 0 },
    };
    const player = players[p.seat];
    for (const level of science)
      for (const [threshold, power] of [
        [3, 1],
        [5, 2],
        [7, 2],
        [12, 3],
      ])
        if (level >= threshold)
          player.resources.power = gainPower(player.resources.power, power);
  }
  const order = setup.players.map((p) => p.seat);
  return {
    schemaVersion: 1,
    rulesVersion: RULES_VERSION,
    revision: 0,
    setup: structuredClone(setup),
    phase: setup.offers ? "draft" : "placement",
    round: 1,
    activeSeat: setup.offers ? order[order.length - 1] : order[0],
    players,
    board: { mapId: setup.mapId, terrain: {}, buildings: {}, bridges: [] },
    shared: {
      usedActions: [],
      bookActions: setup.bookActions ?? ["power", "science", "coins"],
      competencies: competencyMarket(setup.competencyOrder),
      scholarSlots: Array.from({ length: 4 }, () => [null, null, null, null]),
      cities: Object.fromEntries(
        [
          "tools",
          "spades",
          "books",
          "coins",
          "science",
          "power",
          "scholar",
        ].map((id) => [id, 3]),
      ),
      palaces: [...setup.palaces],
      innovations: [...setup.innovations],
      bonusCoins: Object.fromEntries(
        setup.bonusPool.map((id) => [
          id,
          setup.players.some((p) => p.bonus === id) ? 0 : 1,
        ]),
      ),
    },
    pending: [],
    status: "active",
    turnOrder: order,
    passOrder: [],
    placementOrder: [...order, ...[...order].reverse()],
    placementIndex: 0,
    choiceSerial: 0,
    ...(setup.offers ? { draftIndex: 0, chosenOffers: [] } : {}),
    scores: [],
  };
}
export function validateState(s: GameState): string[] {
  const errors = new Set<string>();
  for (const p of Object.values(s.players)) {
    const nums = [
      p.resources.coins,
      p.resources.tools,
      p.resources.scholars,
      ...p.resources.books,
      ...p.resources.power,
      p.vp,
      ...p.science,
    ];
    if (nums.some((n) => n < 0)) errors.add("NEGATIVE_RESOURCE");
    if (nums.some((n) => !Number.isSafeInteger(n)))
      errors.add("NONINTEGER_RESOURCE");
    if (p.science.some((n) => n > 12)) errors.add("SCIENCE_RANGE");
  }
  if (!s.players[s.activeSeat]) errors.add("UNKNOWN_ACTIVE_SEAT");
  for (const b of Object.values(s.board.buildings))
    if (!s.players[b.seat]) errors.add("UNKNOWN_BUILDING_OWNER");
  if (s.pending.some((c) => !s.players[c.seat]))
    errors.add("UNKNOWN_CHOICE_OWNER");
  return [...errors];
}
