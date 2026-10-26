import type { SetupConfig } from "./types";
import { RULES_VERSION } from "./state";
export function developmentSetup(
  id: string,
  players: { id: string; name: string }[],
): SetupConfig {
  if (players.length !== 3) throw Error("DEVELOPMENT_PRESET_REQUIRES_THREE");
  return {
    id,
    rulesVersion: RULES_VERSION,
    mapId: "official-large",
    players: players.map((p, i) => ({
      seat: "p" + (i + 1),
      name: p.name,
      native: (["forest", "lake", "mountain"] as const)[i],
      faction: ["blessed", "navigators", "goblins"][i],
      bonus: ["coins", "power", "guild"][i],
    })),
    roundTiles: [
      "workshop-law",
      "guild-law",
      "school-bank",
      "big-medicine",
      "advance-engineering",
      "innovation-law",
    ],
    finalRoundTile: "workshop",
    palaces: [
      "workshop-score",
      "city-discount",
      "school-pass",
      "power-books",
      "immediate-score",
    ],
    innovations: [
      "colleges",
      "sewerage",
      "league-of-cities",
      "libraries",
      "census",
      "communications",
      "steel",
      "architecture",
    ],
    bonusPool: ["coins", "power", "guild", "scholar", "school", "bigbuilding"],
  };
}
