import type { GameState, SetupConfig, Terrain, BuildingKind } from "./types";
import {
  createGame,
  RULES_VERSION,
  supportsTurnPlanning,
  resetStartingResources,
} from "./state";
import { advanceScience } from "./actions/science";
import type { Discipline } from "./types";
import { factions, palaces, innovations, bonusIds, roundIds } from "./content";
import { terrainCycle } from "./map";
import { competencyIds } from "./catalog";
import { requireRule } from "./internal";
import { queueChoice } from "./responses";
import { competencyOptions } from "./actions/competency";
import {
  type DraftBans,
  emptyDraftBans,
  invalidDraftBans,
  excessiveDraftBans,
} from "./draft-bans";
// Randomness is supplied by the caller; only the resulting setup is persisted.
export function placementOptions(s: GameState, seat: string): BuildingKind[] {
  if (s.phase !== "placement" || s.activeSeat !== seat) return [];
  if (
    supportsTurnPlanning(s.rulesVersion) &&
    (s.setup.offers || s.setup.draft) &&
    s.players[seat]?.faction === "omar"
  ) {
    const buildings = Object.values(s.board.buildings).filter(
      (b) => b.seat === seat,
    );
    return [
      ...(buildings.filter((b) => b.kind === "workshop").length < 2
        ? ["workshop" as const]
        : []),
      ...(!buildings.some((b) => b.kind === "tower") ? ["tower" as const] : []),
    ];
  }
  return [s.placementKinds?.[s.placementIndex] ?? "workshop"];
}
export function standardSetup(
  id: string,
  players: { id: string; name: string }[],
  random: () => number = Math.random,
): SetupConfig {
  if (players.length < 3 || players.length > 5)
    throw Error("UNSUPPORTED_PLAYER_COUNT");
  const shuffle = <T>(values: readonly T[]) => {
    const a = [...values];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const fs = shuffle(Object.keys(factions)),
    bs = shuffle(bonusIds);
  const offers = terrainCycle.map((native, i) => ({
    native,
    faction: fs[i],
    bonus: bs[i],
  }));
  let rounds: string[] = [];
  // Bounded rejection sampling, with a valid fallback for deterministic test RNGs.
  const discipline = (r: string) => r.split("-").at(-1);
  for (let attempt = 0; attempt < 100; attempt++) {
    rounds = shuffle(roundIds).slice(0, 6);
    if (
      !rounds.slice(4).includes("spade-engineering") &&
      !["law", "bank", "medicine", "engineering"].some(
        (d) =>
          rounds.slice(0, 5).filter((r) => discipline(r) === d).length === 3,
      )
    )
      break;
    rounds = [];
  }
  if (!rounds.length)
    rounds = [
      "spade-engineering",
      "guild-law",
      "school-bank",
      "big-medicine",
      "advance-engineering",
      "innovation-law",
    ];
  const count = players.length === 3 ? 8 : players.length === 4 ? 10 : 12;
  const ins = shuffle(Object.keys(innovations)).slice(0, count);
  const costs = Object.fromEntries(
    ins.map((v, i) => {
      const c: [number, number, number, number] = [0, 0, 0, 0];
      if (count === 10 && i >= 8) {
        c[(i - 8) * 2] = 2;
        c[(i - 8) * 2 + 1] = 2;
      } else c[i % 4] = 2;
      return [v, c];
    }),
  );
  return {
    id,
    rulesVersion: RULES_VERSION,
    mapId: "official-large",
    offers,
    players: shuffle(
      players.map((p, i) => ({
        seat: `p${i + 1}`,
        name: p.name,
        ...offers[i],
      })),
    ),
    roundTiles: rounds,
    finalRoundTile: shuffle(
      ["workshop", "guild", "school", "border"].filter(
        (v) => !rounds[5].startsWith(v),
      ),
    )[0],
    palaces: [
      "immediate-score",
      ...shuffle(
        Object.keys(palaces).filter((v) => v !== "immediate-score"),
      ).slice(0, players.length + 1),
    ],
    innovations: ins,
    innovationCosts: costs,
    bonusPool: bs.slice(7),
    bookActions: shuffle([
      "power",
      "science",
      "coins",
      "upgrade",
      "guild-score",
      "spades",
    ]).slice(0, 3),
    competencyOrder: shuffle(competencyIds),
  };
}
export function chooseSetup(s: GameState, seat: string, offer: number) {
  requireRule(!s.setup.draft, "DRAFT_PICK_REQUIRED");
  requireRule(s.phase === "draft" && s.activeSeat === seat, "NOT_YOUR_TURN");
  requireRule(
    Number.isInteger(offer) &&
      offer >= 0 &&
      offer < 7 &&
      !s.chosenOffers?.includes(offer),
    "SETUP_UNAVAILABLE",
  );
  s.chosenOffers!.push(offer);
  const selected = s.setup.offers![offer];
  Object.assign(
    s.setup.players.find((p) => p.seat === seat)!,
    selected,
  );
  Object.assign(s.players[seat], selected);
  s.draftIndex!++;
  if (s.draftIndex! < s.turnOrder.length) {
    s.activeSeat = s.turnOrder[s.turnOrder.length - 1 - s.draftIndex!];
    return;
  }
  s.setup.bonusPool = [
    ...s.setup.bonusPool,
    ...s.setup.players.map((p) => p.bonus),
  ];
  // Initialize resources only after all selected sets are known and unique.
  const fresh = createGame({ ...s.setup, offers: undefined });
  for (const seat of s.turnOrder)
    fresh.players[seat].leechPolicy = s.players[seat].leechPolicy;
  s.players = fresh.players;
  s.shared = fresh.shared;
  beginPlacement(s);
}
function beginPlacement(s: GameState) {
  const regular = s.turnOrder.filter((id) => s.players[id].faction !== "monks");
  s.placementOrder = [...regular, ...[...regular].reverse()];
  s.placementKinds = s.placementOrder.map(() => "workshop");
  for (const id of s.turnOrder.filter(
    (id) => s.players[id].faction === "omar",
  )) {
    s.placementOrder.push(id);
    s.placementKinds.push("tower");
  }
  for (const id of s.turnOrder.filter(
    (id) => s.players[id].faction === "monks",
  )) {
    s.placementOrder.push(id);
    s.placementKinds.push("university");
  }
  s.phase = "placement";
  s.activeSeat = s.placementOrder[0];
  for (const p of Object.values(s.players)) resetStartingResources(p);
}
export function queueStartingRewards(s: GameState) {
  s.setupStage = "rewards";
  for (const id of s.turnOrder) {
    const p = s.players[id];
    if (p.faction === "lizards")
      for (let i = 0; i < 2; i++)
        queueChoice(
          s,
          p.seat,
          "science",
          1,
          ["0", "1", "2", "3"],
          "setup-lizards",
        );
    if (p.native === "wasteland")
      queueChoice(
        s,
        p.seat,
        "book",
        1,
        ["0", "1", "2", "3"],
        "setup-wasteland",
      );
    if (p.native === "desert")
      queueChoice(s, id, "spades", 1, ["terraform", "discard"], "setup-desert");
  }
  for (const c of s.pending)
    if (c.kind === "spades") {
      c.canBuild = false;
      c.canBuySpades = false;
    }
}
export function finishPlacement(s: GameState) {
  s.phase = "setup";
  s.activeSeat = s.turnOrder[0];
  queueStartingRewards(s);
}
export function queueStartingCompetencies(s: GameState) {
  s.setupStage = "competencies";
  for (const id of s.turnOrder) {
    const p = s.players[id];
    if (p.faction === "inventors" || p.faction === "monks")
      queueChoice(
        s,
        id,
        "competency",
        1,
        competencyOptions(s, p),
        "setup-competency",
      );
  }
  for (const c of s.pending) if (c.kind === "spades") c.canBuild = false;
}
export function grantStartingResources(s: GameState) {
  for (const id of s.turnOrder) {
    const p = s.players[id];
    p.resources.coins += 15;
    p.resources.tools +=
      3 +
      (factions[p.faction]?.tools ?? 0) +
      (p.native === "wasteland" ? 1 : 0);
    p.resources.scholars += p.native === "swamp" ? 1 : 0;
    for (const track of [0, 1, 2, 3] as Discipline[])
      advanceScience(
        s,
        p,
        track,
        (p.native === "forest" ? 1 : 0) +
          (factions[p.faction]?.science[track] ?? 0),
      );
  }
  delete s.setupStage;
}
export function snakeSetup(
  id: string,
  players: { id: string; name: string }[],
  direction: "forward" | "reverse",
  random: () => number = Math.random,
  bans: DraftBans = emptyDraftBans(),
): SetupConfig {
  requireRule(!invalidDraftBans(bans), "INVALID_DRAFT_BANS");
  requireRule(
    excessiveDraftBans(bans, players.length).length === 0,
    "DRAFT_POOL_TOO_SMALL",
  );
  const setup = standardSetup(id, players, random);
  const shuffled = <T>(values: readonly T[]) => {
    const items = [...values];
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  };
  const pools = {
    native: shuffled(
      terrainCycle.filter((id) => !bans.native.includes(id)),
    ).slice(0, 6),
    faction: shuffled(
      Object.keys(factions).filter((id) => !bans.faction.includes(id)),
    ).slice(0, players.length + 1),
    palace: shuffled(
      Object.keys(palaces).filter(
        (id) => id !== "immediate-score" && !bans.palace.includes(id),
      ),
    ).slice(0, players.length + 1),
    bonus: shuffled(bonusIds.filter((id) => !bans.bonus.includes(id))).slice(
      0,
      players.length + 3,
    ),
  };
  setup.players = setup.players.map((p, i) => ({
    ...p,
    native: pools.native[i],
    faction: pools.faction[i],
    bonus: pools.bonus[i],
  }));
  delete setup.offers;
  setup.draft = { direction, pools };
  setup.palaces = [];
  setup.bonusPool = pools.bonus;
  return setup;
}
export function draftOptions(
  s: GameState,
  seat: string,
  category: "faction" | "native" | "palace" | "bonus",
): string[] {
  if (!s.setup.draft || s.phase !== "draft" || s.draftPicks?.[seat]?.[category])
    return [];
  return s.setup.draft.pools[category].filter(
    (option) =>
      !Object.values(s.draftPicks ?? {}).some((p) => p[category] === option),
  );
}
export function draftPick(
  s: GameState,
  seat: string,
  category: "faction" | "native" | "palace" | "bonus",
  option: string,
) {
  requireRule(
    s.phase === "draft" && s.activeSeat === seat && !!s.setup.draft,
    "NOT_YOUR_TURN",
  );
  requireRule(
    ["faction", "native", "palace", "bonus"].includes(category) &&
      draftOptions(s, seat, category).includes(option),
    "SETUP_UNAVAILABLE",
  );
  Object.assign(s.draftPicks![seat], { [category]: option });
  s.draftIndex!++;
  const n = s.turnOrder.length;
  if (s.draftIndex! < n * 4) {
    const round = Math.floor(s.draftIndex! / n),
      position = s.draftIndex! % n;
    const reverse =
      (round % 2 === 0) === (s.setup.draft!.direction === "reverse");
    s.activeSeat = s.turnOrder[reverse ? n - 1 - position : position];
    return;
  }
  s.setup.players = s.setup.players.map((p) => ({
    ...p,
    faction: s.draftPicks![p.seat].faction!,
    native: s.draftPicks![p.seat].native!,
    bonus: s.draftPicks![p.seat].bonus!,
  }));
  const fresh = createGame({ ...s.setup, draft: undefined });
  for (const seat of s.turnOrder)
    fresh.players[seat].leechPolicy = s.players[seat].leechPolicy;
  s.players = fresh.players;
  s.shared = fresh.shared;
  for (const p of Object.values(s.players))
    p.draftPalace = s.draftPicks![p.seat].palace!;
  beginPlacement(s);
}
