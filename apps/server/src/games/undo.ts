import type { PoolClient } from "pg";
import type { Database } from "../db/pool";
import { transaction } from "../db/pool";
import { assertApi } from "../errors";
import { gameSettingsSchema } from "../../../../packages/contracts/src/room";
import { pauseClock, transitionClock } from "./clock";
import { transitionMailWaits } from "../mail/waits";
import { getGame } from "./commands";
import { rememberTimeouts } from "./lifecycle";
import {
  lockRoomParticipation,
  assertRoomCapacity,
} from "../rooms/participation";
import {
  replayRecord,
  activeHistory,
} from "../../../../packages/rules/src/replay";

async function lockGame(c: PoolClient, actor: string, id: string) {
  const game = (
    await c.query("SELECT * FROM games WHERE id=$1 FOR UPDATE", [id])
  ).rows[0];
  const members = (
    await c.query(
      "SELECT user_id,seat FROM game_members WHERE game_id=$1 ORDER BY seat",
      [id],
    )
  ).rows;
  const member = members.find((m) => m.user_id === actor);
  assertApi(game && member, "FORBIDDEN", 403);
  return { game, members, member };
}
async function record(c: PoolClient, game: any) {
  const initial = game.initial_state ?? game.state;
  const commands = (
    await c.query(
      "SELECT revision,seat,action FROM game_commands WHERE game_id=$1 AND revision>$2 ORDER BY revision",
      [game.id, initial.revision],
    )
  ).rows;
  return { initial, commands, storage: "postgres-jsonb" as const };
}
export async function undoRequests(db: Database, id: string) {
  return (
    await db.query(
      "SELECT id,requester_seat,base_revision,target_revision,reason,votes,status,applied_revision,created_at FROM game_undo_requests WHERE game_id=$1 ORDER BY created_at DESC LIMIT 50",
      [id],
    )
  ).rows;
}
export async function requestUndo(
  db: Database,
  actor: string,
  id: string,
  input: {
    requestId: string;
    expectedRevision: number;
    targetRevision: number;
    reason: string;
  },
) {
  await getGame(db, actor, id);
  return transaction(db, async (c) => {
    const { game, member } = await lockGame(c, actor, id);
    assertApi(!game.state.matchResult, "RESULT_ALREADY_SETTLED", 409);
    await rememberTimeouts(c, game);
    assertApi(
      gameSettingsSchema.parse(game.settings).undo !== "disabled",
      "UNDO_DISABLED",
      409,
    );
    const prior = (
      await c.query(
        "SELECT * FROM game_undo_requests WHERE game_id=$1 AND id=$2",
        [id, input.requestId],
      )
    ).rows[0];
    if (prior) {
      assertApi(
        prior.requester === actor &&
          prior.base_revision === input.expectedRevision &&
          prior.target_revision === input.targetRevision &&
          prior.reason === input.reason,
        "COMMAND_REUSE",
        409,
      );
      return { revision: game.revision };
    }
    assertApi(
      game.revision === input.expectedRevision,
      "REVISION_CONFLICT",
      409,
    );
    assertApi(
      !(
        await c.query(
          "SELECT 1 FROM game_undo_requests WHERE game_id=$1 AND status='pending'",
          [id],
        )
      ).rowCount,
      "UNDO_PENDING",
      409,
    );
    const replay = await record(c, game);
    const active = activeHistory(replayRecord(replay).history);
    const first = active.find((h) => h.revision > input.targetRevision);
    const command = replay.commands.find((r) => r.revision === first?.revision);
    // Only the author may request undoing their action. Later dependent actions
    // are removed together, after every member consents to this exact revision.
    assertApi(
      input.targetRevision >= replay.initial.revision &&
        command?.revision === input.targetRevision + 1 &&
        command?.seat === member.seat &&
        command.action.kind !== "restore",
      "INVALID_UNDO_TARGET",
      400,
    );
    await c.query(
      "INSERT INTO game_undo_requests(game_id,id,requester,requester_seat,base_revision,target_revision,reason,votes) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        id,
        input.requestId,
        actor,
        member.seat,
        game.revision,
        input.targetRevision,
        input.reason,
        JSON.stringify({ [member.seat]: true }),
      ],
    );
    await c.query("UPDATE games SET clock=$1 WHERE id=$2", [
      JSON.stringify(pauseClock(game.clock)),
      id,
    ]);
    await transitionMailWaits(c, id, game.state, null);
    return { revision: game.revision };
  });
}
export async function voteUndo(
  db: Database,
  actor: string,
  id: string,
  input: { requestId: string; decision: "approve" | "reject" | "cancel" },
) {
  await getGame(db, actor, id);
  return transaction(db, async (c) => {
    const { game, members, member } = await lockGame(c, actor, id);
    const request = (
      await c.query(
        "SELECT * FROM game_undo_requests WHERE game_id=$1 AND id=$2 FOR UPDATE",
        [id, input.requestId],
      )
    ).rows[0];
    assertApi(request, "NOT_FOUND", 404);
    if (request.status !== "pending") return { revision: game.revision };
    assertApi(
      request.base_revision === game.revision,
      "REVISION_CONFLICT",
      409,
    );
    if (input.decision === "cancel")
      assertApi(request.requester === actor, "FORBIDDEN", 403);
    const votes = {
      ...request.votes,
      [member.seat]: input.decision === "approve",
    };
    let status =
      input.decision === "cancel"
        ? "cancelled"
        : input.decision === "reject"
          ? "rejected"
          : "pending";
    let revision = game.revision;
    let currentState = game.state;
    if (status === "pending" && members.every((m) => votes[m.seat] === true)) {
      const replay = await record(c, game);
      revision++;
      const action = {
        kind: "restore" as const,
        targetRevision: request.target_revision,
      };
      replay.commands.push({ revision, seat: request.requester_seat, action });
      const restored = replayRecord(replay);
      currentState = restored.state;
      if (
        game.state.status === "finished" &&
        currentState.status !== "finished"
      ) {
        // A finished room released its slot; restoring it must reserve one for
        // every participant again. Stable ordering avoids concurrent-undo deadlocks.
        for (const userId of members.map((m) => m.user_id as string).sort()) {
          await lockRoomParticipation(c, userId);
          await assertRoomCapacity(c, userId, "ROOM_REOPEN_LIMIT");
        }
      }
      await c.query(
        "UPDATE games SET state=$1,revision=$2,updated_at=now() WHERE id=$3",
        [JSON.stringify(restored.state), revision, id],
      );
      await c.query(
        "INSERT INTO game_events(game_id,revision,actor_id,events) VALUES($1,$2,$3,$4)",
        [id, revision, actor, JSON.stringify(restored.history.at(-1)!.events)],
      );
      await c.query(
        "INSERT INTO game_commands(game_id,actor_id,command_id,payload_hash,result,revision,seat,action) VALUES($1,$2,$3,'restore',$4,$5,$6,$7)",
        [
          id,
          actor,
          `undo:${request.id}`,
          JSON.stringify({ revision }),
          revision,
          request.requester_seat,
          JSON.stringify(action),
        ],
      );
      status = "applied";
    }
    await c.query(
      "UPDATE game_undo_requests SET votes=$1,status=$2,applied_revision=$3 WHERE game_id=$4 AND id=$5",
      [
        JSON.stringify(votes),
        status,
        status === "applied" ? revision : null,
        id,
        request.id,
      ],
    );
    if (status !== "pending")
      await c.query("UPDATE games SET clock=$1 WHERE id=$2", [
        JSON.stringify(
          transitionClock(
            game.clock,
            currentState,
            gameSettingsSchema.parse(game.settings),
          ),
        ),
        id,
      ]);
    return { revision };
  });
}
