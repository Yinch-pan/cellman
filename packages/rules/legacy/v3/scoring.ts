import type { GameState } from "./types";
import { ownBuildings } from "./internal";
import { officialLarge, reachable } from "./map";
import { travelReach } from "./travel";
export function rankPoints(
  values: Record<string, number>,
  awards: number[],
  skipZero = false,
): Record<string, number> {
  const result = Object.fromEntries(Object.keys(values).map((id) => [id, 0]));
  const entries = Object.entries(values)
    .filter(([, n]) => !skipZero || n > 0)
    .sort((a, b) => b[1] - a[1]);
  for (let i = 0; i < entries.length;) {
    let j = i + 1;
    while (j < entries.length && entries[j][1] === entries[i][1]) j++;
    const award = Math.floor(
      awards.slice(i, j).reduce((a, b) => a + b, 0) / (j - i),
    );
    for (let k = i; k < j; k++) result[entries[k][0]] = award;
    i = j;
  }
  return result;
}
export function networkSize(s: GameState, seat: string) {
  const ids = ownBuildings(s, seat).map(([id]) => id);
  const seen = new Set<string>();
  let largest = 0;
  for (const start of ids) {
    if (seen.has(start)) continue;
    const component = [start];
    seen.add(start);
    for (let i = 0; i < component.length; i++)
      for (const id of ids)
        if (
          !seen.has(id) &&
          (reachable(
            officialLarge,
            [component[i]],
            id,
            s.players[seat].sailing,
            s.board.bridges,
            seat,
          ) ||
            travelReach(s, s.players[seat], id, "tunnel", [component[i]]) ||
            travelReach(s, s.players[seat], id, "flight", [component[i]]))
        ) {
          seen.add(id);
          component.push(id);
        }
    largest = Math.max(largest, component.length);
  }
  return largest;
}
export function finishGame(s: GameState) {
  const seats = Object.keys(s.players);
  const area = rankPoints(
    Object.fromEntries(seats.map((seat) => [seat, networkSize(s, seat)])),
    [18, 12, 6],
    true,
  );
  const sciences = [0, 1, 2, 3].map((i) =>
    rankPoints(
      Object.fromEntries(
        seats.map((seat) => [seat, s.players[seat].science[i]]),
      ),
      [8, 4, 2],
      true,
    ),
  );
  s.scores = seats.map((seat) => {
    const p = s.players[seat],
      r = p.resources;
    const cash = Math.floor(
      (r.coins +
        r.tools +
        r.scholars +
        r.books.reduce((a, b) => a + b, 0) +
        r.power[2] +
        Math.floor(r.power[1] / 2)) /
        5,
    );
    const items = [
      {
        reason: "对局得分",
        points: p.vp,
        sourceRefs: [{ sourceId: "base", page: 18 }],
      },
      {
        reason: "最大连通区域",
        points: area[seat],
        sourceRefs: [{ sourceId: "base", page: 18 }],
      },
      ...sciences.map((points, i) => ({
        reason: ["银行学", "法学", "工程学", "医学"][i],
        points: points[seat],
        sourceRefs: [{ sourceId: "base", page: 18 }],
      })),
      {
        reason: "剩余资源",
        points: cash,
        sourceRefs: [{ sourceId: "base", page: 18 }],
      },
    ];
    return { seat, items, total: items.reduce((n, x) => n + x.points, 0) };
  });
  s.status = "finished";
  s.phase = "finished";
}
