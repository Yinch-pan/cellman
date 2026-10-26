import type { GameState, Player, GameAction } from "../types";
import { requireRule } from "../internal";
import { gainPower } from "./power";
import { findCities } from "./city";
export function special(
  s: GameState,
  p: Player,
  a: Extract<GameAction, { kind: "special" }>,
) {
  if (a.source === "annex") {
    requireRule(p.annexes > 0, "NO_ANNEX");
    const b = s.board.buildings[a.hex ?? ""];
    requireRule(b?.seat === p.seat && !b.annex, "INVALID_ANNEX_BUILDING");
    b.annex = true;
    p.annexes--;
    findCities(s, p);
    return;
  }
  requireRule(
    a.source === "competency:power-special" &&
      p.competencies.includes("power-special"),
    "SPECIAL_UNAVAILABLE",
  );
  requireRule(!p.usedSpecials.includes(a.source), "SPECIAL_USED");
  p.usedSpecials.push(a.source);
  p.resources.power = gainPower(p.resources.power, 4);
}
