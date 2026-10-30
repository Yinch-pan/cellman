import type { GameState, Player } from "./types";
export interface ScoreAward {
  seat: string;
  source: string;
  points: number;
}
const traces = new WeakMap<GameState, ScoreAward[]>();
export function awardPoints(
  s: GameState,
  p: Player,
  points: number,
  source: string,
) {
  p.vp += points;
  if (!points) return;
  const rows = traces.get(s) ?? [];
  rows.push({ seat: p.seat, source, points });
  traces.set(s, rows);
}
export const scoreAwards = (s: GameState) => traces.get(s) ?? [];
