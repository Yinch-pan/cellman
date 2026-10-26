import type { GameState, Player } from "../types";
import { requireRule } from "../internal";
import { bridgeSites } from "../map";
import { findCities } from "./city";
export function placeBridge(s: GameState, p: Player, a: string, b: string) {
  requireRule(
    bridgeSites.some((pair) => pair.includes(a) && pair.includes(b)),
    "INVALID_BRIDGE_SITE",
  );
  requireRule(
    s.board.buildings[a]?.seat === p.seat ||
      s.board.buildings[b]?.seat === p.seat,
    "BRIDGE_NEEDS_BUILDING",
  );
  requireRule(
    s.board.bridges.filter((bridge) => bridge.seat === p.seat).length < 3,
    "NO_BRIDGE_SUPPLY",
  );
  requireRule(
    !s.board.bridges.some(
      (bridge) =>
        [bridge.a, bridge.b].includes(a) && [bridge.a, bridge.b].includes(b),
    ),
    "BRIDGE_OCCUPIED",
  );
  s.board.bridges.push({ seat: p.seat, a, b });
  findCities(s, p);
}
