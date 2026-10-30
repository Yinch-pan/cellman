import type { Database } from "../db/pool";
import type { GameState } from "../../../../packages/rules/src/types";
import { getWaitingSeats } from "../../../../packages/rules/src/engine";

function summarize(row: {
  id: string;
  state: GameState;
  seat: string;
  updated_at: Date;
}) {
  return {
    id: row.id,
    round: row.state.round,
    status: row.state.status,
    revision: row.state.revision,
    needAction: getWaitingSeats(row.state).includes(row.seat),
    names: Object.values(row.state.players).map((p) => p.name),
    reason: row.state.matchResult?.reason ?? "normal",
    endedAt: row.state.status === "finished" ? row.updated_at : null,
  };
}
export async function activeGames(db: Database, actor: string) {
  // Filter before LIMIT so recent finished games cannot hide active ones.
  const { rows } = await db.query(
    "SELECT g.id,g.state,g.updated_at,m.seat FROM games g JOIN game_members m ON m.game_id=g.id WHERE m.user_id=$1 AND g.state->>'status'<>'finished' ORDER BY g.updated_at DESC,g.id DESC LIMIT 100",
    [actor],
  );
  return rows.map(summarize);
}
export async function gameHistory(db: Database, actor: string, page: number) {
  const { rows } = await db.query(
    "SELECT g.id,g.state,g.updated_at,m.seat FROM games g JOIN game_members m ON m.game_id=g.id WHERE m.user_id=$1 AND g.state->>'status'='finished' ORDER BY g.updated_at DESC,g.id DESC LIMIT 21 OFFSET $2",
    [actor, page * 20],
  );
  return {
    page,
    hasMore: rows.length > 20,
    games: rows.slice(0, 20).map(summarize),
  };
}
