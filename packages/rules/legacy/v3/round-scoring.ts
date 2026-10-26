import type { GameState, Player } from "./types";
export function awardRound(s: GameState, p: Player, event: string, count = 1) {
  if (s.phase !== "actions") return;
  const tile = s.setup.roundTiles[s.round - 1];
  const trigger: Record<string, [string, number]> = {
    "workshop-law": ["workshop", 2],
    "workshop-bank": ["workshop", 2],
    "guild-law": ["guild", 3],
    "guild-medicine": ["guild", 3],
    "school-bank": ["school", 4],
    "big-medicine": ["big", 5],
    "big-bank": ["big", 5],
    "spade-engineering": ["spade", 2],
    "science-medicine": ["science", 1],
    "city-engineering": ["city", 5],
    "advance-engineering": ["advance", 3],
    "innovation-law": ["innovation", 5],
  };
  if (trigger[tile]?.[0] === event) p.vp += trigger[tile][1] * count;
  if (s.round === 6) {
    if (s.setup.finalRoundTile === "workshop" && event === "workshop")
      p.vp += 2;
    if (s.setup.finalRoundTile === "guild" && event === "guild") p.vp += 3;
    if (s.setup.finalRoundTile === "school" && event === "school") p.vp += 4;
  }
}
