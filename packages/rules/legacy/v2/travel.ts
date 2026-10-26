import { officialLarge, connected } from "./map";
import { ownBuildings } from "./internal";
import type { GameState, Player } from "./types";
export function hexDistance(a: string, b: string) {
  const x = officialLarge.hexes[a],
    y = officialLarge.hexes[b];
  return x && y
    ? Math.max(
        Math.abs(x.q - y.q),
        Math.abs(x.r - y.r),
        Math.abs(x.q + x.r - y.q - y.r),
      )
    : Infinity;
}
export function travelReach(
  s: GameState,
  p: Player,
  target: string,
  kind: "tunnel" | "flight",
  from = ownBuildings(s, p.seat).map(([id]) => id),
) {
  if (kind === "tunnel" ? p.faction !== "moles" : p.palace !== "flight")
    return false;
  if (
    from.some((id) =>
      connected(officialLarge, id, target, s.board.bridges, p.seat),
    )
  )
    return false;
  return from.some(
    (id) => hexDistance(id, target) <= (kind === "tunnel" ? 2 : 3),
  );
}
