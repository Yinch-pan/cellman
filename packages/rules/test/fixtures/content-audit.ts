import { actionState } from "./actions";
import { bonusIds, factions } from "../../src/content";
import { snakeSetup } from "../../src/setup";
import { createGame } from "../../src/state";
import { terrainCycle } from "../../src/map";
import type { Terrain } from "../../src/types";

export function auditState() {
  const s = actionState();
  s.board.buildings = { B4: { seat: "p1", kind: "workshop" } };
  s.players.p1.faction = "inventors";
  s.players.p1.science = [0, 0, 0, 0];
  s.players.p1.resources = {
    coins: 30,
    tools: 20,
    scholars: 3,
    power: [0, 12, 0],
    books: [0, 0, 0, 0],
  };
  s.setup.roundTiles = Array(6).fill("innovation-law");
  s.setup.bonusPool = [...bonusIds];
  s.shared.bonusCoins = Object.fromEntries(bonusIds.map((id) => [id, 0]));
  return s;
}
export function auditDraft(faction: string, native: Terrain = "forest") {
  const config = snakeSetup(
    `audit-${faction}-${native}`,
    [1, 2, 3].map((i) => ({ id: `p${i}`, name: `玩家${i}` })),
    "forward",
    () => 0.41,
  );
  config.players.sort((a, b) => a.seat.localeCompare(b.seat));
  config.draft!.pools.faction = [
    faction,
    ...Object.keys(factions)
      .filter(
        (f) =>
          f !== faction &&
          !["lizards", "monks", "inventors", "omar"].includes(f),
      )
      .slice(0, 2),
  ];
  config.draft!.pools.native = [
    native,
    ...terrainCycle
      .filter((t) => t !== native && !["wasteland", "desert"].includes(t))
      .slice(0, 2),
  ];
  config.draft!.pools.bonus = [
    "coins",
    "power",
    "guild",
    "scholar",
    "school",
    "bigbuilding",
  ];
  config.draft!.pools.palace = [
    "tools-special",
    "spades-special",
    "workshop-score",
    "guild-special",
  ];
  return createGame(config);
}
