import type { PoolClient } from "pg";
import { assertApi } from "../errors";

export const MAX_ACTIVE_ROOMS_PER_PLAYER = 100;

export async function lockRoomParticipation(c: PoolClient, actor: string) {
  // Transaction-scoped and shared by all server processes. Lock before reading
  // the count so parallel creates/joins cannot spend the same final slot.
  await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
    `room-participation:${actor}`,
  ]);
}

export async function assertRoomCapacity(
  c: PoolClient,
  actor: string,
  code = "ROOM_PARTICIPATION_LIMIT",
) {
  const { rows } = await c.query(
    `SELECT count(*)::int AS count
     FROM room_seats s
     JOIN rooms r ON r.id=s.room_id
     LEFT JOIN games g ON g.id=r.game_id
     WHERE s.user_id=$1 AND (
       r.status='waiting' OR
       (r.status='started' AND g.state->>'status' IS DISTINCT FROM 'finished')
     )`,
    [actor],
  );
  assertApi(rows[0].count < MAX_ACTIVE_ROOMS_PER_PLAYER, code, 409);
}
