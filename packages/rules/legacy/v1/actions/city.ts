import type { GameState, Player } from "../types";
import { ownBuildings, requireRule, gainScholar } from "../internal";
import { connected, officialLarge } from "../map";
import { buildingPower, queueChoice } from "../responses";
import { gainPower } from "./power";
import { advanceScience } from "./science";
import { awardRound } from "../rounds";
export function findCities(s: GameState, p: Player) {
  const bs = ownBuildings(s, p.seat);
  const seen = new Set<string>();
  for (const [start] of bs) {
    if (seen.has(start)) continue;
    const group = [start];
    seen.add(start);
    for (let i = 0; i < group.length; i++)
      for (const [id] of bs)
        if (
          !seen.has(id) &&
          connected(officialLarge, group[i], id, s.board.bridges, p.seat)
        ) {
          seen.add(id);
          group.push(id);
        }
    const city = group.map((id) => s.board.buildings[id].cityId).find(Boolean);
    if (city) {
      for (const id of group) s.board.buildings[id].cityId ??= city;
      continue;
    }
    const buildings = group.map((id) => s.board.buildings[id]);
    const number = buildings.reduce((n, b) => n + (b.annex ? 2 : 1), 0);
    const required = buildings.some((b) => b.kind === "monument")
      ? 2
      : buildings.some((b) => b.kind === "university")
        ? 3
        : 4;
    if (
      number >= required &&
      buildings.reduce((n, b) => n + buildingPower(b), 0) >=
        (p.palace === "city-discount" ? 6 : 7)
    ) {
      const cityId = `city:${++s.choiceSerial}`;
      for (const id of group) s.board.buildings[id].cityId = cityId;
      queueChoice(
        s,
        p.seat,
        "city",
        1,
        [
          "tools",
          "spades",
          "books",
          "coins",
          "science",
          "power",
          "scholar",
        ].filter((id) => s.shared.cities[id] > 0),
        cityId,
      );
    }
  }
}
export function takeCity(s: GameState, p: Player, id: string) {
  requireRule(s.shared.cities[id] > 0, "CITY_UNAVAILABLE");
  s.shared.cities[id]--;
  p.keys++;
  const points: Record<string, number> = {
    tools: 4,
    spades: 5,
    books: 5,
    coins: 6,
    science: 7,
    power: 8,
    scholar: 8,
  };
  requireRule(id in points, "UNSUPPORTED_CITY");
  p.vp += points[id];
  awardRound(s, p, "city");
  if (id === "spades")
    queueChoice(s, p.seat, "spades", 2, ["terraform", "discard"], "city");
  if (id === "tools") p.resources.tools += 3;
  if (id === "books")
    for (let i = 0; i < 2; i++)
      queueChoice(s, p.seat, "book", 1, ["0", "1", "2", "3"], "city");
  if (id === "coins") p.resources.coins += 6;
  if (id === "science")
    for (const t of [0, 1, 2, 3] as const) advanceScience(s, p, t, 1);
  if (id === "power") p.resources.power = gainPower(p.resources.power, 8);
  if (id === "scholar") gainScholar(s, p, 1);
}
