import type { GameState, Player } from "./types";
import { requireRule, pay } from "./internal";
import { queueChoice } from "./responses";
import { awardRound } from "./round-scoring";
export function advanceTechnology(
  s: GameState,
  p: Player,
  track: "sailing" | "terraform",
  free = false,
) {
  const max = track === "sailing" ? (p.native === "lake" ? 4 : 3) : 2;
  const current = track === "sailing" ? p.sailing : p.terraformLevel;
  if (free && current >= max) return;
  requireRule(current < max, "TRACK_MAX");
  if (!free)
    pay(
      p,
      track === "sailing"
        ? { scholars: 1, coins: 4 }
        : { tools: 1, scholars: 1, coins: p.native === "plains" ? 1 : 5 },
    );
  if (track === "sailing") {
    p.sailing++;
    if (p.sailing === 2 || p.sailing === 4)
      queueChoice(s, p.seat, "book", 2, ["0", "1", "2", "3"], "sailing");
    else p.vp += p.sailing === 1 ? 2 : 4;
  } else {
    p.terraformLevel++;
    if (p.terraformLevel === 1)
      queueChoice(s, p.seat, "book", 2, ["0", "1", "2", "3"], "terraform");
    else p.vp += 6;
  }
  awardRound(s, p, "advance");
}
