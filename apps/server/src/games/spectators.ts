import type { Database } from "../db/pool";
import { assertApi } from "../errors";
import { projectClock } from "./clock";
import { getWaitingSeats } from "../../../../packages/rules/src/engine";
import type { GameState } from "../../../../packages/rules/src/types";

// These reads intentionally do not use getGame: that function remains the
// membership boundary for every command, preview and vote.
export async function spectatorView(db: Database, id: string, actor?: string) {
  const { rows } = await db.query(
    "SELECT g.state,g.clock,(SELECT seat FROM game_members WHERE game_id=g.id AND user_id=$2) AS seat FROM games g WHERE g.id=$1",
    [id, actor ?? null],
  );
  assertApi(rows[0], "NOT_FOUND", 404);
  return {
    state: rows[0].state as GameState,
    clock: projectClock(rows[0].clock),
    memberSeat: rows[0].seat ?? null,
  };
}

export async function publicGames(db: Database, page: number) {
  const { rows } = await db.query(
    "SELECT g.id,g.state FROM games g JOIN rooms r ON r.game_id=g.id WHERE r.visibility='public' AND r.status='started' AND g.state->>'status'<>'finished' ORDER BY r.created_at DESC,g.id DESC LIMIT 21 OFFSET $1",
    [page * 20],
  );
  return {
    page,
    hasMore: rows.length > 20,
    games: rows.slice(0, 20).map((row) => {
      const state = row.state as GameState;
      return {
        id: row.id,
        round: state.round,
        phase: state.phase,
        names: Object.values(state.players).map((p) => p.name),
        waiting: getWaitingSeats(state).map((seat) => state.players[seat].name),
      };
    }),
  };
}

export async function spectatorHistory(
  db: Database,
  id: string,
  cursor: { after?: number; before?: number },
) {
  assertApi(
    (await db.query("SELECT 1 FROM games WHERE id=$1", [id])).rowCount,
    "NOT_FOUND",
    404,
  );
  if (cursor.after !== undefined)
    return (
      await db.query(
        "SELECT revision,events,created_at FROM game_events WHERE game_id=$1 AND revision>$2 ORDER BY revision LIMIT 100",
        [id, cursor.after],
      )
    ).rows;
  return (
    await db.query(
      "SELECT revision,events,created_at FROM game_events WHERE game_id=$1 AND ($2::integer IS NULL OR revision<$2) ORDER BY revision DESC LIMIT 100",
      [id, cursor.before ?? null],
    )
  ).rows.reverse();
}
