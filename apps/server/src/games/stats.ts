import type { Database } from "../db/pool";
import type { GameState } from "../../../../packages/rules/src/types";

export function standings(state: GameState) {
  if (state.matchResult)
    return Object.keys(state.players).map((seat) => ({
      seat,
      items: [],
      total: null,
      rank:
        state.matchResult!.reason !== "forfeit"
          ? null
          : seat === state.matchResult!.loser
            ? Object.keys(state.players).length
            : 1,
      winShare: state.matchResult!.winners.includes(seat)
        ? 1 / state.matchResult!.winners.length
        : 0,
    }));
  return state.scores.map((score) => ({
    ...score,
    rank: 1 + state.scores.filter((s) => s.total > score.total).length,
    winShare:
      score.total === Math.max(...state.scores.map((s) => s.total))
        ? 1 / state.scores.filter((s) => s.total === score.total).length
        : 0,
  }));
}
const eligible =
  "(g.state->>'status'='finished' OR g.state ? 'matchResult') AND NOT EXISTS (SELECT 1 FROM game_undo_requests u WHERE u.game_id=g.id AND u.status='pending')";
export async function playerStats(db: Database, actor: string) {
  const rows = (
    await db.query(
      `SELECT g.id,g.state,m.seat,g.updated_at FROM games g JOIN game_members m ON m.game_id=g.id WHERE m.user_id=$1 AND ${eligible} ORDER BY g.updated_at DESC`,
      [actor],
    )
  ).rows;
  const games = rows.flatMap((r) => {
    const result = standings(r.state).find((s) => s.seat === r.seat);
    return result
      ? [
          {
            id: r.id,
            date: r.state.matchResult?.at ?? r.updated_at,
            faction: r.state.matchResult
              ? "unranked-setup"
              : r.state.players[r.seat].faction,
            players: Object.keys(r.state.players).length,
            score: result.total,
            rank: result.rank,
            winShare: result.winShare,
            reason: r.state.matchResult?.reason ?? "normal",
            forfeited: r.state.matchResult?.loser === r.seat,
          },
        ]
      : [];
  });
  return {
    ...summarize(games),
    timeouts: Number(
      (
        await db.query("SELECT count(*) FROM game_timeouts WHERE user_id=$1", [
          actor,
        ])
      ).rows[0].count,
    ),
    forfeits: games.filter((g) => g.forfeited).length,
    inactive: games.filter((g) => g.reason === "inactive").length,
    consensual: games.filter((g) => g.reason === "consensus").length,
    games: games.slice(0, 100),
    factions: group(
      games.filter((g) => g.reason === "normal"),
      (g) => g.faction,
    ),
  };
}
type Entry = { score: number | null; rank: number | null; winShare: number };
function summarize(entries: Entry[]) {
  const count = entries.length;
  const wins = entries.reduce((n, e) => n + e.winShare, 0);
  const ranked = entries.filter((e) => e.rank !== null),
    scored = entries.filter((e) => e.score !== null);
  return {
    count,
    wins,
    winRate: ranked.length ? (wins / ranked.length) * 100 : 0,
    average: scored.length
      ? scored.reduce((n, e) => n + e.score!, 0) / scored.length
      : 0,
    best: scored.length
      ? scored.reduce((best, e) => Math.max(best, e.score!), -Infinity)
      : 0,
  };
}
function group<T extends Entry>(entries: T[], key: (e: T) => string) {
  const groups = new Map<string, T[]>();
  for (const e of entries) {
    const name = key(e);
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name)!.push(e);
  }
  return [...groups].map(([name, es]) => ({ name, ...summarize(es) }));
}
export async function siteStats(db: Database, count?: number) {
  const rows = (await db.query(`SELECT g.state FROM games g WHERE ${eligible}`))
    .rows;
  const states: GameState[] = rows
    .map((r) => r.state)
    .filter((s) => !count || Object.keys(s.players).length === count);
  const entries = states
    .filter((s) => !s.matchResult)
    .flatMap((s) =>
      standings(s).map((r) => ({
        score: r.total,
        rank: r.rank,
        winShare: r.winShare,
        faction: s.players[r.seat].faction,
        position: String(
          s.setup.players.findIndex((p) => p.seat === r.seat) + 1,
        ),
      })),
    );
  return {
    count: states.length,
    forfeits: states.filter((s) => s.matchResult?.reason === "forfeit").length,
    inactive: states.filter((s) => s.matchResult?.reason === "inactive").length,
    consensual: states.filter((s) => s.matchResult?.reason === "consensus")
      .length,
    factions: group(entries, (e) => e.faction),
    positions: count
      ? group(entries, (e) => e.position).sort(
          (a, b) => Number(a.name) - Number(b.name),
        )
      : [],
  };
}
