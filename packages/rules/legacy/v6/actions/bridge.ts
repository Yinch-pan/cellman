import type { GameState, Player } from "../types";
import { requireRule } from "../internal";
import { bridgeSites, officialLarge, adjacent } from "../map";
export function validBridgeGeometry(a: string, b: string, moles = false) {
  if (bridgeSites.some((pair) => pair.includes(a) && pair.includes(b)))
    return true;
  return (
    moles &&
    a !== b &&
    !!officialLarge.hexes[a] &&
    !!officialLarge.hexes[b] &&
    officialLarge.hexes[a].terrain !== "river" &&
    officialLarge.hexes[b].terrain !== "river" &&
    !adjacent(officialLarge, a, b) &&
    officialLarge.neighbors[a].filter((id) =>
      officialLarge.neighbors[b].includes(id),
    ).length === 2
  );
}
import { findCities } from "./city";
export function placeBridge(s: GameState, p: Player, a: string, b: string) {
  requireRule(
    validBridgeGeometry(a, b, p.faction === "moles"),
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
