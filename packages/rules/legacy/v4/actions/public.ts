import type { GameState, Player, GameAction } from "../types";
import {
  requireRule,
  pay,
  ownBuildings,
  gainScholar,
  integer,
} from "../internal";
import { spendPower } from "./power";
import { terraform } from "./build";
import { findCities } from "./city";
import { awardRound } from "../rounds";
import { placeBridge } from "./bridge";
import { queueChoice } from "../responses";
import { connected, officialLarge } from "../map";
import { innovations } from "../content";
import { innovationEffect } from "../effects";
export function publicPower(
  s: GameState,
  p: Player,
  a: Extract<GameAction, { kind: "powerAction" }>,
) {
  const costs: Record<string, number> = {
    scholar: 3,
    bridge: 3,
    tools: 4,
    coins: 4,
    spade: 4,
    spades: 6,
  };
  requireRule(a.id in costs, "UNSUPPORTED_POWER_ACTION");
  requireRule(!s.shared.usedActions.includes(a.id), "ACTION_OCCUPIED");
  spendPower(p, costs[a.id] - (p.faction === "illusionists" ? 1 : 0));
  if (p.faction === "illusionists") p.vp += s.turnOrder.length >= 4 ? 2 : 1;
  if (a.id === "bridge") {
    requireRule(a.a && a.b, "MISSING_BRIDGE");
    placeBridge(s, p, a.a, a.b);
  }
  if (a.id === "scholar") gainScholar(s, p, 1);
  if (a.id === "tools") p.resources.tools += 2;
  if (a.id === "coins") p.resources.coins += 7;
  if (a.id === "spade" || a.id === "spades") {
    requireRule(a.hex && a.terrain, "MISSING_TERRAFORM");
    const r = terraform(
      s,
      p,
      {
        kind: "terraform",
        hex: a.hex,
        terrain: a.terrain,
        build: !!a.build,
        additional: a.additional,
        travel: a.travel,
      },
      a.id === "spade" ? 1 : 2,
    );
    awardRound(s, p, "spade", r.spades);
    if (r.built) awardRound(s, p, "workshop");
    findCities(s, p);
  }
  s.shared.usedActions.push(a.id);
}
export function innovate(
  s: GameState,
  p: Player,
  a: Extract<GameAction, { kind: "innovation" }>,
) {
  requireRule(s.shared.innovations.includes(a.id), "INNOVATION_UNAVAILABLE");
  requireRule(p.innovations.length < 3, "INNOVATION_LIMIT");
  const index = s.setup.innovations.indexOf(a.id);
  const required =
    s.setup.innovationCosts?.[a.id] ??
    [0, 0, 0, 0].map((_, i) => (i === index % 4 ? 2 : 0));
  requireRule(a.books.length === 4, "BOOK_PAYMENT");
  for (const n of a.books) integer(n);
  const extra =
    p.innovations.length === 1 && p.native === "wasteland"
      ? 0
      : p.innovations.length;
  requireRule(
    a.books.reduce((x, y) => x + y, 0) === 5 + extra &&
      required.every((n, i) => a.books[i] >= n),
    "BOOK_PAYMENT",
  );
  for (let i = 0; i < 4; i++)
    requireRule(p.resources.books[i] >= a.books[i], "INSUFFICIENT_BOOKS");
  requireRule(Object.hasOwn(innovations, a.id), "UNSUPPORTED_INNOVATION");
  if (!p.palace) pay(p, { coins: 5 });
  for (let i = 0; i < 4; i++) p.resources.books[i] -= a.books[i];
  const buildings = ownBuildings(s, p.seat);
  if (a.id === "colleges")
    p.vp += 5 * buildings.filter(([, b]) => b.kind === "school").length;
  if (a.id === "sewerage")
    p.vp += 2 * buildings.filter(([, b]) => b.kind === "workshop").length;
  if (a.id === "league-of-cities") p.vp += p.keys * 5;
  if (a.id === "libraries")
    p.vp += [...p.science]
      .sort((a, b) => b - a)
      .slice(0, 2)
      .reduce((a, b) => a + b, 0);
  if (a.id === "census")
    p.vp +=
      buildings.length >= 11
        ? 18
        : buildings.length >= 9
          ? 12
          : buildings.length >= 7
            ? 8
            : 0;
  if (a.id === "architecture") {
    p.vp += 10;
    for (const kind of new Set(buildings.map(([, b]) => b.kind)))
      queueChoice(
        s,
        p.seat,
        "science",
        1,
        ["0", "1", "2", "3"],
        "architecture",
      );
  }
  if (a.id === "steel")
    p.vp +=
      [0, 8, 12, 18][s.board.bridges.filter((b) => b.seat === p.seat).length] ??
      0;
  if (a.id === "communications") {
    const seen = new Set<string>();
    let groups = 0;
    for (const [start] of buildings) {
      if (seen.has(start)) continue;
      groups++;
      seen.add(start);
      const group = [start];
      for (let i = 0; i < group.length; i++)
        for (const [id] of buildings)
          if (
            !seen.has(id) &&
            connected(officialLarge, group[i], id, s.board.bridges, p.seat)
          ) {
            seen.add(id);
            group.push(id);
          }
    }
    p.vp += groups >= 6 ? 18 : groups === 5 ? 12 : groups === 4 ? 8 : 0;
  }
  p.innovations.push(a.id);
  innovationEffect(s, p, a.id);
  s.shared.innovations = s.shared.innovations.filter((id) => id !== a.id);
  awardRound(s, p, "innovation");
}
