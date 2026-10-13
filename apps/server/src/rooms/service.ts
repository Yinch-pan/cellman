import type { Database } from "../db/pool";
import { transaction } from "../db/pool";
import { randomUUID } from "node:crypto";
import { token, digest } from "../auth/password";
import { assertApi } from "../errors";
import { createGame } from "../../../../packages/rules/src/state";
import { developmentSetup } from "../../../../packages/rules/src/preset";
export async function roomView(db: Database, actor: string, id: string) {
  const { rows } = await db.query(
    'SELECT id,host_id AS "hostId",visibility,capacity,status,game_id AS "gameId" FROM rooms WHERE id=$1',
    [id],
  );
  const room = rows[0];
  assertApi(room, "NOT_FOUND", 404);
  const seats = await db.query(
    'SELECT s.user_id AS "userId",a.display_name AS "displayName",s.ready FROM room_seats s JOIN accounts a ON a.id=s.user_id WHERE room_id=$1 ORDER BY joined_at,user_id',
    [id],
  );
  assertApi(
    room.visibility === "public" || seats.rows.some((s) => s.userId === actor),
    "FORBIDDEN",
    403,
  );
  return { ...room, seats: seats.rows };
}
export async function createRoom(
  db: Database,
  actor: string,
  input: { visibility: "public" | "private"; seats: number },
) {
  assertApi(input.seats === 3, "PREVIEW_SUPPORTS_THREE_PLAYERS");
  assertApi(
    ["public", "private"].includes(input.visibility),
    "INVALID_VISIBILITY",
  );
  const id = randomUUID(),
    inviteToken = token();
  await transaction(db, async (c) => {
    await c.query(
      "INSERT INTO rooms(id,host_id,visibility,capacity,invite_hash) VALUES($1,$2,$3,$4,$5)",
      [id, actor, input.visibility, input.seats, digest(inviteToken)],
    );
    await c.query("INSERT INTO room_seats(room_id,user_id) VALUES($1,$2)", [
      id,
      actor,
    ]);
  });
  return { ...(await roomView(db, actor, id)), inviteToken };
}
export async function joinRoom(
  db: Database,
  actor: string,
  id: string,
  inviteToken?: string,
) {
  await transaction(db, async (c) => {
    const { rows } = await c.query(
      "SELECT * FROM rooms WHERE id=$1 FOR UPDATE",
      [id],
    );
    const r = rows[0];
    assertApi(r, "NOT_FOUND", 404);
    assertApi(r.status === "waiting", "ROOM_STARTED");
    const seats = await c.query(
      "SELECT user_id FROM room_seats WHERE room_id=$1",
      [id],
    );
    if (seats.rows.some((s) => s.user_id === actor)) return;
    assertApi(
      r.visibility === "public" ||
        (inviteToken && digest(inviteToken) === r.invite_hash),
      "INVALID_INVITE",
      403,
    );
    assertApi(seats.rowCount! < r.capacity, "ROOM_FULL", 409);
    await c.query("INSERT INTO room_seats(room_id,user_id) VALUES($1,$2)", [
      id,
      actor,
    ]);
  });
  return roomView(db, actor, id);
}
export async function setReady(
  db: Database,
  actor: string,
  id: string,
  ready: boolean,
) {
  await transaction(db, async (c) => {
    const { rows } = await c.query(
      "SELECT status FROM rooms WHERE id=$1 FOR UPDATE",
      [id],
    );
    assertApi(rows[0]?.status === "waiting", "ROOM_STARTED");
    const r = await c.query(
      "UPDATE room_seats SET ready=$1 WHERE room_id=$2 AND user_id=$3",
      [ready, id, actor],
    );
    assertApi(r.rowCount, "FORBIDDEN", 403);
  });
  return roomView(db, actor, id);
}
export async function startRoom(db: Database, actor: string, id: string) {
  return transaction(db, async (c) => {
    const { rows } = await c.query(
      "SELECT * FROM rooms WHERE id=$1 FOR UPDATE",
      [id],
    );
    const room = rows[0];
    assertApi(room, "NOT_FOUND", 404);
    assertApi(room.host_id === actor, "HOST_REQUIRED", 403);
    if (room.game_id) return { gameId: room.game_id };
    assertApi(room.status === "waiting", "ROOM_CLOSED");
    const seats = await c.query(
      "SELECT s.*,a.display_name FROM room_seats s JOIN accounts a ON a.id=s.user_id WHERE room_id=$1 ORDER BY joined_at,user_id",
      [id],
    );
    assertApi(
      seats.rowCount === room.capacity && seats.rows.every((s) => s.ready),
      "NOT_READY",
    );
    const gameId = randomUUID();
    const state = createGame(
      developmentSetup(
        gameId,
        seats.rows.map((s) => ({ id: s.user_id, name: s.display_name })),
      ),
    );
    await c.query(
      "INSERT INTO games(id,state,rules_version) VALUES($1,$2,$3)",
      [gameId, JSON.stringify(state), state.rulesVersion],
    );
    for (let i = 0; i < seats.rows.length; i++)
      await c.query(
        "INSERT INTO game_members(game_id,user_id,seat) VALUES($1,$2,$3)",
        [gameId, seats.rows[i].user_id, "p" + (i + 1)],
      );
    await c.query("UPDATE rooms SET status='started',game_id=$1 WHERE id=$2", [
      gameId,
      id,
    ]);
    return { gameId };
  });
}
export async function leaveRoom(db: Database, actor: string, id: string) {
  await transaction(db, async (c) => {
    const { rows } = await c.query(
      "SELECT * FROM rooms WHERE id=$1 FOR UPDATE",
      [id],
    );
    assertApi(rows[0]?.status === "waiting", "ROOM_STARTED");
    await c.query("DELETE FROM room_seats WHERE room_id=$1 AND user_id=$2", [
      id,
      actor,
    ]);
    const rest = await c.query(
      "SELECT user_id FROM room_seats WHERE room_id=$1 ORDER BY joined_at,user_id",
      [id],
    );
    if (!rest.rowCount)
      await c.query(
        "UPDATE rooms SET status='closed',host_id=NULL WHERE id=$1",
        [id],
      );
    else if (rows[0].host_id === actor)
      await c.query("UPDATE rooms SET host_id=$1 WHERE id=$2", [
        rest.rows[0].user_id,
        id,
      ]);
  });
}
