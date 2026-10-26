import type { PoolClient } from "pg";
import type { GameState } from "../../../../packages/rules/src/types";
import { getWaitingSeats } from "../../../../packages/rules/src/engine";
import { randomUUID } from "node:crypto";

// Called inside the game transaction. A fast round trip between worker polls
// must still invalidate old reminders and start a fresh waiting period.
export async function transitionMailWaits(
  c: PoolClient,
  gameId: string,
  before: GameState,
  after: GameState | null,
) {
  const previous = getWaitingSeats(before),
    next = after ? getWaitingSeats(after) : [];
  const continuing =
    after && before.round === after.round
      ? next.filter((s) => previous.includes(s))
      : [];
  // Encrypted messages carry this wait ID; delivery cancels obsolete IDs.
  await c.query(
    "UPDATE email_waits w SET waiting_since=CASE WHEN m.seat=ANY($3::text[]) THEN now() ELSE NULL END,wait_id=$4,turn_queued=false,overdue_queued=false FROM game_members m WHERE w.game_id=$1 AND m.game_id=w.game_id AND m.user_id=w.user_id AND m.seat<>ALL($2::text[])",
    [gameId, continuing, next, randomUUID()],
  );
}
