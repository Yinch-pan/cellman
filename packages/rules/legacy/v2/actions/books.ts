import type { GameState, Player, GameAction } from "../types";
import { integer, requireRule, ownBuildings } from "../internal";
import { gainPower } from "./power";
import { advanceScience } from "./science";
import { upgrade } from "./build";
import { queueChoice } from "../responses";
import { findCities } from "./city";
import { awardRound } from "../round-scoring";
export function bookAction(
  s: GameState,
  p: Player,
  a: Extract<GameAction, { kind: "bookAction" }>,
) {
  const costs: Record<string, number> = {
    power: 1,
    science: 1,
    coins: 2,
    upgrade: 2,
    "guild-score": 2,
    spades: 3,
  };
  requireRule(
    s.shared.bookActions.includes(a.id) && a.id in costs,
    "BOOK_ACTION_UNAVAILABLE",
  );
  requireRule(
    !s.shared.usedActions.includes("book:" + a.id),
    "ACTION_OCCUPIED",
  );
  requireRule(a.books.length === 4, "BOOK_PAYMENT");
  a.books.forEach((n) => integer(n));
  requireRule(
    a.books.reduce((n, v) => n + v, 0) === costs[a.id],
    "BOOK_PAYMENT",
  );
  for (let i = 0; i < 4; i++) {
    requireRule(p.resources.books[i] >= a.books[i], "INSUFFICIENT_BOOKS");
    p.resources.books[i] -= a.books[i];
  }
  if (a.id === "power") p.resources.power = gainPower(p.resources.power, 5);
  if (a.id === "coins") p.resources.coins += 6;
  if (a.id === "science") {
    requireRule(a.track !== undefined, "INVALID_TRACK");
    advanceScience(s, p, a.track, 2);
  }
  if (a.id === "guild-score")
    p.vp +=
      ownBuildings(s, p.seat).filter(([, b]) => b.kind === "guild").length * 2;
  if (a.id === "upgrade") {
    requireRule(a.hex, "INVALID_HEX");
    upgrade(s, p, { kind: "upgrade", hex: a.hex, to: "guild" }, true);
    awardRound(s, p, "guild");
    findCities(s, p);
  }
  if (a.id === "spades")
    queueChoice(
      s,
      p.seat,
      "spades",
      3,
      ["terraform", "discard"],
      "book-action",
    );
  s.shared.usedActions.push("book:" + a.id);
}
