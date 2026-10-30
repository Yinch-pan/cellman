import type { GameState, Player, BuildingKind } from "../types";
import { queueChoice, offerLeech } from "../responses";
import { officialLarge, reachable, terrainDistance } from "../map";
import { pay, requireRule, ownBuildings } from "../internal";
import { awardRound } from "../round-scoring";
import { findCities } from "./city";
import { buildingRewards } from "../effects";
export function neutralSites(s: GameState, p: Player) {
  return Object.values(officialLarge.hexes)
    .filter(
      (h) =>
        h.terrain !== "river" &&
        !s.board.buildings[h.id] &&
        reachable(
          officialLarge,
          ownBuildings(s, p.seat).map(([id]) => id),
          h.id,
          p.sailing + (p.bonus === "river" ? 1 : 0),
          s.board.bridges,
          p.seat,
        ) &&
        terrainDistance(
          s.board.terrain[h.id] ??
            (h.terrain as Exclude<typeof h.terrain, "river">),
          p.native,
        ) *
          (3 - p.terraformLevel) <=
          p.resources.tools,
    )
    .map((h) => h.id);
}
export function queueNeutral(
  s: GameState,
  p: Player,
  kind: BuildingKind,
  source: string,
) {
  const sites = neutralSites(s, p);
  // Keep the reward even when no site is currently affordable: the player may
  // convert resources before placing it, or explicitly decline the building.
  queueChoice(s, p.seat, "neutral", 1, [...sites, "discard"], source);
  s.pending[s.pending.length - 1].buildingKind = kind;
}
export function refreshNeutralChoices(s: GameState) {
  for (const choice of s.pending)
    if (choice.kind === "neutral")
      choice.options = [...neutralSites(s, s.players[choice.seat]), "discard"];
}
export function placeNeutral(
  s: GameState,
  p: Player,
  kind: BuildingKind,
  hex: string,
) {
  requireRule(neutralSites(s, p).includes(hex), "INVALID_NEUTRAL_SITE");
  const h = officialLarge.hexes[hex];
  const spades = terrainDistance(
    s.board.terrain[hex] ?? (h.terrain as Exclude<typeof h.terrain, "river">),
    p.native,
  );
  pay(p, { tools: spades * (3 - p.terraformLevel) });
  if (p.faction === "goblins") p.resources.coins += spades * 2;
  s.board.terrain[hex] = p.native;
  s.board.buildings[hex] = { seat: p.seat, kind, neutral: true };
  offerLeech(s, p.seat, hex);
  buildingRewards(s, p, hex);
  awardRound(s, p, "spade", spades);
  awardRound(s, p, kind === "palace" || kind === "university" ? "big" : kind);
  findCities(s, p);
}
