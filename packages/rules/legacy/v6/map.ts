import type { BoardMap, Bridge, HexId, Terrain } from "./types";
export const terrainCycle: Terrain[] = [
  "desert",
  "plains",
  "swamp",
  "lake",
  "forest",
  "mountain",
  "wasteland",
];
// Manual transcription of the official 3–5 player board, rulebook p2.
// Odd rows are shifted right. River cells remain explicit for sailing paths.
const rows = [
  "FRLSPWMRLSPDR",
  "MRRF LFDRFMLRS".replaceAll(" ", ""),
  "WLSR MPSRRWRRW".replaceAll(" ", ""),
  "DMWRDWR SRRPMF".replaceAll(" ", ""),
  "PFPDRRR FMLWDP".replaceAll(" ", ""),
  "SRRRL M RDP RSLW".replaceAll(" ", ""),
  "LRPSR FPRRRRRR".replaceAll(" ", ""),
  "RDLRWSDWSLFSR",
  "FMWRDMPLFMWDP",
];
const symbols: Record<string, Terrain | "river"> = {
  D: "desert",
  P: "plains",
  S: "swamp",
  L: "lake",
  F: "forest",
  M: "mountain",
  W: "wasteland",
  R: "river",
};
export const officialLarge: BoardMap = {
  id: "official-large",
  hexes: {},
  neighbors: {},
};
for (let r = 0; r < rows.length; r++) {
  if (rows[r].length !== 13)
    throw new Error(`MAP_ROW_LENGTH:${r}:${rows[r].length}`);
  for (let c = 0; c < 13; c++) {
    const id = String.fromCharCode(65 + r) + (c + 1);
    const q = c - Math.floor(r / 2);
    officialLarge.hexes[id] = {
      id,
      terrain: symbols[rows[r][c]],
      q,
      r,
      x: 40 + c * 60 + (r % 2) * 30,
      y: 40 + r * 52,
    };
  }
}
for (const h of Object.values(officialLarge.hexes))
  officialLarge.neighbors[h.id] = Object.values(officialLarge.hexes)
    .filter(
      (n) =>
        Math.max(
          Math.abs(n.q - h.q),
          Math.abs(n.r - h.r),
          Math.abs(n.q + n.r - h.q - h.r),
        ) === 1,
    )
    .map((n) => n.id);
export const adjacent = (map: BoardMap, a: HexId, b: HexId): boolean =>
  map.neighbors[a]?.includes(b) ?? false;
export const connected = (
  map: BoardMap,
  a: HexId,
  b: HexId,
  bridges: Bridge[],
  seat?: string,
): boolean =>
  adjacent(map, a, b) ||
  bridges.some((x) => (x.a === a && x.b === b) || (x.b === a && x.a === b));
export function reachable(
  map: BoardMap,
  from: HexId[],
  target: HexId,
  sailing: number,
  bridges: Bridge[],
  seat?: string,
): boolean {
  if (!map.hexes[target] || map.hexes[target].terrain === "river") return false;
  if (from.some((a) => connected(map, a, target, bridges, seat))) return true;
  if (sailing < 1) return false;
  const queue: { id: string; distance: number }[] = [];
  const seen = new Set<string>();
  for (const id of from)
    for (const n of map.neighbors[id] ?? [])
      if (map.hexes[n].terrain === "river" && !seen.has(n)) {
        seen.add(n);
        queue.push({ id: n, distance: 1 });
      }
  for (let i = 0; i < queue.length; i++) {
    const h = queue[i];
    if (adjacent(map, h.id, target)) return true;
    if (h.distance < sailing)
      for (const n of map.neighbors[h.id])
        if (map.hexes[n].terrain === "river" && !seen.has(n)) {
          seen.add(n);
          queue.push({ id: n, distance: h.distance + 1 });
        }
  }
  return false;
}
export function terrainDistance(a: Terrain, b: Terrain): number {
  const d = Math.abs(terrainCycle.indexOf(a) - terrainCycle.indexOf(b));
  return Math.min(d, 7 - d);
}
export const bridgeSites: [string, string][] = Object.values(
  officialLarge.hexes,
).flatMap((a) =>
  Object.values(officialLarge.hexes)
    .filter((b) => {
      if (a.id >= b.id || a.terrain === "river" || b.terrain === "river")
        return false;
      const common = officialLarge.neighbors[a.id].filter((id) =>
        officialLarge.neighbors[b.id].includes(id),
      );
      return (
        !adjacent(officialLarge, a.id, b.id) &&
        common.length === 2 &&
        common.every((id) => officialLarge.hexes[id].terrain === "river")
      );
    })
    .map((b) => [a.id, b.id] as [string, string]),
);
