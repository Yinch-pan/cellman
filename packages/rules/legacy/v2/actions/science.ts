import type { Discipline, GameState, Player } from "../types";
import { requireRule } from "../internal";
import { gainPower } from "./power";
import { awardRound } from "../round-scoring";
import { queueChoice } from "../responses";
import { gainScholar } from "../internal";
export function advanceScience(
  s: GameState,
  p: Player,
  track: Discipline,
  amount: number,
  useKey = false,
) {
  requireRule(
    Number.isInteger(track) && track >= 0 && track < 4,
    "INVALID_TRACK",
  );
  const before = p.science[track];
  let next = Math.min(12, before + amount);
  if (before < 8 && next >= 8) {
    if (p.keysUsed >= p.keys) next = 7;
    else if (useKey) p.keysUsed++;
    else {
      queueChoice(
        s,
        p.seat,
        "key",
        next - 7,
        ["use", "decline"],
        "science-key",
      );
      s.pending[s.pending.length - 1].scienceTrack = track;
      next = 7;
    }
  }
  if (
    next === 12 &&
    Object.values(s.players).some(
      (other) => other.seat !== p.seat && other.science[track] === 12,
    )
  )
    next = 11;
  p.science[track] = next;
  for (const [level, power] of [
    [3, 1],
    [5, 2],
    [7, 2],
    [12, 3],
  ])
    if (before < level && next >= level)
      p.resources.power = gainPower(p.resources.power, power);
  if (s.phase === "actions") awardRound(s, p, "science", next - before);
  if (s.phase === "income" && before < 9 && next >= 9) {
    if (track === 0) p.resources.coins += 3;
    if (track === 1) p.resources.power = gainPower(p.resources.power, 6);
    if (track === 2) p.resources.tools++;
    if (track === 3) gainScholar(s, p, 3);
  }
  return next - before;
}
