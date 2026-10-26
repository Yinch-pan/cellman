import { awardPoints } from "../score-events";
import type { GameState, Player } from "../types";
import { requireRule } from "../internal";
import { advanceScience } from "./science";
import { queueChoice } from "../responses";
import { queueNeutral } from "./neutral";
export function competencyOptions(s: GameState, p: Player) {
  return s.shared.competencies
    .filter((c) => c.remaining > 0 && !p.competencies.includes(c.id))
    .map((c) => c.id);
}
export function takeCompetency(s: GameState, p: Player, id: string) {
  const cell = s.shared.competencies.find((c) => c.id === id);
  requireRule(cell && cell.remaining > 0, "COMPETENCY_UNAVAILABLE");
  requireRule(!p.competencies.includes(id), "DUPLICATE_COMPETENCY");
  cell.remaining--;
  p.competencies.push(id);
  advanceScience(s, p, cell.color, 3 - cell.row);
  p.resources.books[cell.color] +=
    cell.row + (p.faction === "philosophers" ? 1 : 0);
  if (id === "two-spades")
    queueChoice(s, p.seat, "spades", 2, ["terraform", "discard"], "competency");
  if (id === "immediate-resources") {
    p.resources.tools++;
    p.resources.coins += 2;
    awardPoints(s, p, 5, "能力即时得分");
  }
  if (id === "annexes") p.annexes += 2;
  if (id === "tower") queueNeutral(s, p, "tower", "competency");
}
