import type { Database } from "../db/pool";
import { isDeepStrictEqual } from "node:util";
import { transaction } from "../db/pool";
import { assertApi } from "../errors";
import { digest } from "../auth/password";
import {
  applyAction,
  getWaitingSeats,
} from "../../../../packages/rules/src/engine";
import { SUPPORTED_RULES } from "../../../../packages/rules/src/state";
import type { GameState } from "../../../../packages/rules/src/types";
import type { CommandEnvelope } from "../../../../packages/contracts/src/game";
import { gameSettingsSchema } from "../../../../packages/contracts/src/room";
import { projectClock, transitionClock } from "./clock";
import { transitionMailWaits } from "../mail/waits";
import { maintainGame, rememberTimeouts, INACTIVE_MS } from "./lifecycle";
export async function getGame(db: Database, actor: string, id: string) {
  const member = await db.query(
    "SELECT 1 FROM game_members WHERE game_id=$1 AND user_id=$2",
    [id, actor],
  );
  assertApi(member.rowCount, "FORBIDDEN", 403);
  await maintainGame(db, id);
  const { rows } = await db.query(
    "SELECT g.state,g.settings,g.clock,g.stats_eligible,g.last_activity_at,m.seat FROM games g JOIN game_members m ON m.game_id=g.id WHERE g.id=$1 AND m.user_id=$2",
    [id, actor],
  );
  assertApi(rows[0], "FORBIDDEN", 403);
  const r = rows[0];
  return {
    state: r.state as GameState,
    seat: r.seat as string,
    settings: gameSettingsSchema.parse(r.settings),
    clock: projectClock(r.clock),
    inactiveDeadline: new Date(
      new Date(r.last_activity_at).getTime() + INACTIVE_MS,
    ).toISOString(),
  };
}
export async function submitCommand(
  db: Database,
  actor: string,
  id: string,
  command: CommandEnvelope,
  injectFailure?: () => void,
) {
  await getGame(db, actor, id);
  return transaction(db, async (c) => {
    const { rows } = await c.query(
      "SELECT g.* FROM games g WHERE id=$1 FOR UPDATE",
      [id],
    );
    const member = await c.query(
      "SELECT seat FROM game_members WHERE game_id=$1 AND user_id=$2",
      [id, actor],
    );
    assertApi(rows[0] && member.rows[0], "FORBIDDEN", 403);
    const hash = digest(JSON.stringify(command));
    const prior = await c.query(
      "SELECT payload_hash,result FROM game_commands WHERE game_id=$1 AND actor_id=$2 AND command_id=$3",
      [id, actor, command.commandId],
    );
    if (prior.rows[0]) {
      assertApi(prior.rows[0].payload_hash === hash, "COMMAND_REUSE", 409);
      return prior.rows[0].result;
    }
    assertApi(rows[0].state.status !== "finished", "GAME_FINISHED", 409);
    assertApi(
      rows[0].state.matchResult?.loser !== member.rows[0].seat,
      "PLAYER_REMOVED",
      403,
    );
    assertApi(
      Date.now() - new Date(rows[0].last_activity_at).getTime() < INACTIVE_MS,
      "GAME_INACTIVE",
      409,
    );
    const undo = await c.query(
      "SELECT 1 FROM game_undo_requests WHERE game_id=$1 AND status='pending'",
      [id],
    );
    assertApi(!undo.rowCount, "UNDO_PENDING", 409);
    assertApi(
      rows[0].revision === command.expectedRevision,
      "REVISION_CONFLICT",
      409,
    );
    assertApi(
      SUPPORTED_RULES.includes(rows[0].rules_version),
      "RULESET_UNAVAILABLE",
      503,
    );
    const result = applyAction(
      rows[0].state,
      member.rows[0].seat,
      command.action,
    );
    assertApi(result.ok, result.ok ? "" : result.error.code, 400);
    await rememberTimeouts(c, rows[0]);
    const activity =
      command.action.kind !== "setLeech" &&
      !isDeepStrictEqual(result.state, rows[0].state);
    const revision = rows[0].revision + 1;
    result.state.revision = revision;
    const response = {
      commandId: command.commandId,
      revision,
      events: result.events,
      waitingSeats: getWaitingSeats(result.state),
    };
    await c.query(
      "UPDATE games SET initial_state=COALESCE(initial_state,state),state=$1,revision=$2,clock=$4,updated_at=now(),last_activity_at=CASE WHEN $5 THEN now() ELSE last_activity_at END WHERE id=$3",
      [
        JSON.stringify(result.state),
        revision,
        id,
        JSON.stringify(
          transitionClock(
            rows[0].clock,
            result.state,
            gameSettingsSchema.parse(rows[0].settings),
            Date.now(),
            ["draftPick", "chooseSetup", "place", "endTurn", "pass"].includes(
              command.action.kind,
            ) ||
              (command.action.kind === "turn" &&
                ["endTurn", "pass"].includes(
                  command.action.actions.at(-1)?.kind ?? "",
                )) ||
              (command.action.kind === "respond" &&
                !result.state.pending.some(
                  (c) => c.seat === member.rows[0].seat,
                ))
              ? member.rows[0].seat
              : undefined,
          ),
        ),
        activity,
      ],
    );
    await transitionMailWaits(c, id, rows[0].state, result.state);
    injectFailure?.();
    await c.query(
      "INSERT INTO game_events(game_id,revision,actor_id,events) VALUES($1,$2,$3,$4)",
      [id, revision, actor, JSON.stringify(result.events)],
    );
    await c.query(
      "INSERT INTO game_commands(game_id,actor_id,command_id,payload_hash,result,revision,seat,action) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        id,
        actor,
        command.commandId,
        hash,
        JSON.stringify(response),
        revision,
        member.rows[0].seat,
        JSON.stringify(command.action),
      ],
    );
    return response;
  });
}
export async function getReplay(db: Database, actor: string, id: string) {
  return transaction(db, async (c) => {
    // One snapshot for checkpoint, latest revision and ordered commands.
    const { rows } = await c.query(
      "SELECT g.initial_state,g.state,g.revision,g.settings,g.stats_eligible FROM games g JOIN game_members m ON m.game_id=g.id WHERE g.id=$1 AND m.user_id=$2 FOR SHARE OF g",
      [id, actor],
    );
    assertApi(rows[0], "FORBIDDEN", 403);
    const initial = rows[0].initial_state ?? rows[0].state;
    const commands = await c.query(
      "SELECT revision,seat,action FROM game_commands WHERE game_id=$1 AND revision>$2 ORDER BY revision",
      [id, initial.revision],
    );
    return {
      format: commands.rows.some((c) => c.action.kind === "adjudicate")
        ? "yijian-replay-v3"
        : commands.rows.some((c) => c.action.kind === "restore")
          ? "yijian-replay-v2"
          : "yijian-replay-v1",
      storage: "postgres-jsonb" as const,
      initial,
      settings: gameSettingsSchema.parse(rows[0].settings),
      commands: commands.rows,
      undoRequests: (
        await c.query(
          "SELECT id,requester_seat,base_revision,target_revision,reason,votes,status,applied_revision,created_at FROM game_undo_requests WHERE game_id=$1 ORDER BY created_at,id",
          [id],
        )
      ).rows,
      revision: rows[0].revision,
    };
  });
}
