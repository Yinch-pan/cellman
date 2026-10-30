import type { Database } from "../db/pool";
import type { PoolClient } from "pg";
import { transaction } from "../db/pool";
import { randomUUID, randomInt, createHash } from "node:crypto";
import { token, digest } from "../auth/password";
import { assertApi } from "../errors";
import { createGame } from "../../../../packages/rules/src/state";
import { developmentSetup } from "../../../../packages/rules/src/preset";
import {
  standardSetup,
  snakeSetup,
} from "../../../../packages/rules/src/setup";
import {
  roomInputSchema,
  gameSettingsSchema,
  effectiveSettings,
  type RoomInput,
} from "../../../../packages/contracts/src/room";
import { createClock } from "../games/clock";
import { lockRoomParticipation, assertRoomCapacity } from "./participation";
import {
  draftCategories,
  emptyDraftBans,
  excessiveDraftBans,
} from "../../../../packages/rules/src/draft-bans";
import type { GameSettings } from "../../../../packages/contracts/src/room";
function validateDraftBans(
  settings: GameSettings,
  mode: string,
  capacity: number,
) {
  const bans = settings.draftBans ?? emptyDraftBans();
  assertApi(
    mode.startsWith("snake-") ||
      draftCategories.every((c) => bans[c].length === 0),
    "DRAFT_BANS_REQUIRE_SNAKE",
  );
  assertApi(
    excessiveDraftBans(bans, capacity).length === 0,
    "DRAFT_POOL_TOO_SMALL",
  );
}
const seatOrder = "position NULLS LAST,joined_at,user_id";
async function lockRoom(
  c: PoolClient,
  id: string,
  actor?: string,
  expectedRevision?: number,
) {
  const r = (await c.query("SELECT * FROM rooms WHERE id=$1 FOR UPDATE", [id]))
    .rows[0];
  assertApi(r, "NOT_FOUND", 404);
  if (actor) assertApi(r.host_id === actor, "HOST_REQUIRED", 403);
  assertApi(r.status === "waiting", "ROOM_STARTED", 409);
  if (expectedRevision !== undefined)
    assertApi(
      r.settings_revision === expectedRevision,
      "ROOM_SETTINGS_CHANGED",
      409,
    );
  return r;
}
async function invalidate(c: PoolClient, id: string) {
  await c.query(
    "UPDATE rooms SET settings_revision=settings_revision+1 WHERE id=$1",
    [id],
  );
  await c.query("UPDATE room_seats SET ready=false WHERE room_id=$1", [id]);
}
export async function roomView(db: Database, actor: string, id: string) {
  // Read settings and ready flags under the same room lock used by writers.
  return transaction(db, async (c) => {
    const room = (
      await c.query(
        'SELECT id,host_id AS "hostId",visibility,capacity,status,setup_mode AS "setupMode",game_id AS "gameId",settings,settings_revision AS "settingsRevision" FROM rooms WHERE id=$1 FOR SHARE',
        [id],
      )
    ).rows[0];
    assertApi(room, "NOT_FOUND", 404);
    const seats = (
      await c.query(
        `SELECT s.user_id AS "userId",a.display_name AS "displayName",s.ready FROM room_seats s JOIN accounts a ON a.id=s.user_id WHERE room_id=$1 ORDER BY ${seatOrder}`,
        [id],
      )
    ).rows;
    assertApi(
      room.visibility === "public" || seats.some((s) => s.userId === actor),
      "FORBIDDEN",
      403,
    );
    return {
      ...room,
      settings: effectiveSettings(
        gameSettingsSchema.parse(room.settings),
        room.setupMode,
      ),
      seats,
    };
  });
}
export async function createRoom(
  db: Database,
  actor: string,
  input: RoomInput,
) {
  const mode = input.setupMode ?? "snake-reverse";
  assertApi(
    mode === "training" ? input.seats === 3 : [3, 4, 5].includes(input.seats),
    mode === "training"
      ? "PREVIEW_SUPPORTS_THREE_PLAYERS"
      : "UNSUPPORTED_PLAYER_COUNT",
  );
  const parsed = roomInputSchema.parse(input);
  const settings = effectiveSettings(parsed.settings, parsed.setupMode);
  validateDraftBans(settings, parsed.setupMode, parsed.seats);
  assertApi(
    !parsed.setupMode.startsWith("snake-") ||
      ["paced", "incremental"].includes(settings.time.mode),
    "ASYNC_TIME_REQUIRED",
  );
  const id = randomUUID(),
    inviteToken = token();
  await transaction(db, async (c) => {
    await lockRoomParticipation(c, actor);
    await assertRoomCapacity(c, actor);
    await c.query(
      "INSERT INTO rooms(id,host_id,visibility,capacity,invite_hash,setup_mode,settings) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [
        id,
        actor,
        parsed.visibility,
        parsed.seats,
        digest(inviteToken),
        parsed.setupMode,
        JSON.stringify(settings),
      ],
    );
    await c.query(
      "INSERT INTO room_seats(room_id,user_id,position) VALUES($1,$2,1)",
      [id, actor],
    );
  });
  return { ...(await roomView(db, actor, id)), inviteToken };
}
export async function updateRoom(
  db: Database,
  actor: string,
  id: string,
  input: RoomInput,
  expectedRevision: number,
) {
  const parsed = roomInputSchema.parse(input),
    settings = effectiveSettings(parsed.settings, parsed.setupMode);
  validateDraftBans(settings, parsed.setupMode, parsed.seats);
  assertApi(
    !parsed.setupMode.startsWith("snake-") ||
      ["paced", "incremental"].includes(settings.time.mode),
    "ASYNC_TIME_REQUIRED",
  );
  await transaction(db, async (c) => {
    await lockRoom(c, id, actor, expectedRevision);
    const n = (
      await c.query(
        "SELECT count(*)::int AS n FROM room_seats WHERE room_id=$1",
        [id],
      )
    ).rows[0].n;
    assertApi(parsed.seats >= n, "ROOM_TOO_SMALL", 409);
    await c.query(
      "UPDATE rooms SET visibility=$1,capacity=$2,setup_mode=$3,settings=$4 WHERE id=$5",
      [
        parsed.visibility,
        parsed.seats,
        parsed.setupMode,
        JSON.stringify(settings),
        id,
      ],
    );
    await invalidate(c, id);
  });
  return roomView(db, actor, id);
}
export type RoomManagement =
  | { kind: "kick" | "transfer"; userId: string }
  | { kind: "reorder"; userIds: string[] }
  | { kind: "invite" };
export async function manageRoom(
  db: Database,
  actor: string,
  id: string,
  action: RoomManagement,
  expectedRevision: number,
) {
  let inviteToken: string | undefined;
  await transaction(db, async (c) => {
    await lockRoom(c, id, actor, expectedRevision);
    const members = (
      await c.query("SELECT user_id FROM room_seats WHERE room_id=$1", [id])
    ).rows.map((r) => r.user_id as string);
    if (action.kind === "invite") {
      inviteToken = token();
      await c.query(
        "UPDATE rooms SET invite_hash=$1,settings_revision=settings_revision+1 WHERE id=$2",
        [digest(inviteToken), id],
      );
      return;
    }
    if (action.kind === "reorder") {
      assertApi(
        action.userIds.length === members.length &&
          new Set(action.userIds).size === members.length &&
          action.userIds.every((u) => members.includes(u)),
        "INVALID_SEATS",
      );
      for (let i = 0; i < action.userIds.length; i++)
        await c.query(
          "UPDATE room_seats SET position=$1 WHERE room_id=$2 AND user_id=$3",
          [i + 1, id, action.userIds[i]],
        );
    } else {
      assertApi(
        action.userId !== actor && members.includes(action.userId),
        "INVALID_SEATS",
      );
      if (action.kind === "kick")
        await c.query(
          "DELETE FROM room_seats WHERE room_id=$1 AND user_id=$2",
          [id, action.userId],
        );
      else
        await c.query("UPDATE rooms SET host_id=$1 WHERE id=$2", [
          action.userId,
          id,
        ]);
    }
    await invalidate(c, id);
  });
  return {
    ...(await roomView(db, actor, id)),
    ...(inviteToken ? { inviteToken } : {}),
  };
}
export async function joinRoom(
  db: Database,
  actor: string,
  id: string,
  inviteToken?: string,
) {
  await transaction(db, async (c) => {
    await lockRoomParticipation(c, actor);
    const r = await lockRoom(c, id);
    const seats = (
      await c.query(
        "SELECT user_id,position FROM room_seats WHERE room_id=$1",
        [id],
      )
    ).rows;
    if (seats.some((s) => s.user_id === actor)) return;
    assertApi(
      r.visibility === "public" ||
        (inviteToken && digest(inviteToken) === r.invite_hash),
      "INVALID_INVITE",
      403,
    );
    assertApi(seats.length < r.capacity, "ROOM_FULL", 409);
    await assertRoomCapacity(c, actor);
    await c.query(
      "INSERT INTO room_seats(room_id,user_id,position) VALUES($1,$2,$3)",
      [id, actor, Math.max(0, ...seats.map((s) => s.position ?? 0)) + 1],
    );
    await invalidate(c, id);
  });
  return roomView(db, actor, id);
}
export async function setReady(
  db: Database,
  actor: string,
  id: string,
  ready: boolean,
  expectedRevision?: number,
) {
  await transaction(db, async (c) => {
    await lockRoom(c, id, undefined, expectedRevision);
    const r = await c.query(
      "UPDATE room_seats SET ready=$1 WHERE room_id=$2 AND user_id=$3",
      [ready, id, actor],
    );
    assertApi(r.rowCount, "FORBIDDEN", 403);
  });
  return roomView(db, actor, id);
}
function seededRandom(seed: string) {
  let counter = 0;
  return () =>
    createHash("sha256")
      .update(`${seed}:${counter++}`)
      .digest()
      .readUInt32BE(0) / 0x100000000;
}
export async function startRoom(
  db: Database,
  actor: string,
  id: string,
  expectedRevision?: number,
) {
  return transaction(db, async (c) => {
    const room = (
      await c.query("SELECT * FROM rooms WHERE id=$1 FOR UPDATE", [id])
    ).rows[0];
    assertApi(room, "NOT_FOUND", 404);
    assertApi(room.host_id === actor, "HOST_REQUIRED", 403);
    if (room.game_id) return { gameId: room.game_id };
    assertApi(room.status === "waiting", "ROOM_CLOSED");
    if (expectedRevision !== undefined)
      assertApi(
        room.settings_revision === expectedRevision,
        "ROOM_SETTINGS_CHANGED",
        409,
      );
    const seats = (
      await c.query(
        `SELECT s.*,a.display_name FROM room_seats s JOIN accounts a ON a.id=s.user_id WHERE room_id=$1 ORDER BY ${seatOrder}`,
        [id],
      )
    ).rows;
    assertApi(
      seats.length === room.capacity && seats.every((s) => s.ready),
      "NOT_READY",
    );
    const settings = effectiveSettings(
      gameSettingsSchema.parse(room.settings),
      room.setup_mode,
    );
    const gameId = randomUUID(),
      players = seats.map((s) => ({ id: s.user_id, name: s.display_name }));
    validateDraftBans(settings, room.setup_mode, room.capacity);
    const setup =
      room.setup_mode === "snake-forward" || room.setup_mode === "snake-reverse"
        ? snakeSetup(
            gameId,
            players,
            room.setup_mode === "snake-forward" ? "forward" : "reverse",
            settings.seed
              ? seededRandom(settings.seed)
              : () => randomInt(0, 0x100000000) / 0x100000000,
            settings.draftBans,
          )
        : room.setup_mode === "standard"
          ? standardSetup(
              gameId,
              players,
              settings.seed
                ? seededRandom(settings.seed)
                : () => randomInt(0, 0x100000000) / 0x100000000,
            )
          : developmentSetup(gameId, players);
    if (settings.seatOrder === "seated")
      setup.players.sort(
        (a, b) => Number(a.seat.slice(1)) - Number(b.seat.slice(1)),
      );
    const state = createGame(setup),
      clock = createClock(state, settings);
    await c.query(
      "INSERT INTO games(id,state,rules_version,initial_state,stats_eligible,settings,clock) VALUES($1,$2,$3,$2,$4,$5,$6)",
      [
        gameId,
        JSON.stringify(state),
        state.rulesVersion,
        settings.countStats,
        JSON.stringify(settings),
        JSON.stringify(clock),
      ],
    );
    for (let i = 0; i < seats.length; i++)
      await c.query(
        "INSERT INTO game_members(game_id,user_id,seat) VALUES($1,$2,$3)",
        [gameId, seats[i].user_id, "p" + (i + 1)],
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
    const room = await lockRoom(c, id);
    const removed = await c.query(
      "DELETE FROM room_seats WHERE room_id=$1 AND user_id=$2",
      [id, actor],
    );
    if (!removed.rowCount) return;
    const rest = (
      await c.query(
        `SELECT user_id FROM room_seats WHERE room_id=$1 ORDER BY ${seatOrder}`,
        [id],
      )
    ).rows;
    if (!rest.length)
      await c.query(
        "UPDATE rooms SET status='closed',host_id=NULL WHERE id=$1",
        [id],
      );
    else if (room.host_id === actor)
      await c.query("UPDATE rooms SET host_id=$1 WHERE id=$2", [
        rest[0].user_id,
        id,
      ]);
    await invalidate(c, id);
  });
}
