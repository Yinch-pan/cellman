import type { PoolClient } from "pg";
import { transaction, type Database } from "../db/pool";
import { assertApi } from "../errors";
import {
  adjudicate,
  type LifecycleAction,
} from "../../../../packages/rules/src/lifecycle";
import { settleClock } from "./clock";
import { transitionMailWaits } from "../mail/waits";

export const INACTIVE_MS = 10 * 86400000;
export async function rememberTimeouts(
  c: PoolClient,
  game: any,
  now = Date.now(),
) {
  const clock = settleClock(game.clock, now);
  if (!game.state.matchResult && game.state.status !== "finished") {
    for (const seat of clock?.timedOut ?? [])
      await c.query(
        "INSERT INTO game_timeouts(game_id,user_id,seat,first_seen_at) SELECT game_id,user_id,seat,$3 FROM game_members WHERE game_id=$1 AND seat=$2 ON CONFLICT DO NOTHING",
        [game.id, seat, new Date(now)],
      );
  }
  return clock;
}
async function record(
  c: PoolClient,
  game: any,
  actor: string,
  seat: string,
  action: LifecycleAction,
) {
  const result = adjudicate(game.state, action);
  if (!result.ok) throw Error("INVALID_ADJUDICATION");
  const revision = game.revision + 1;
  result.state.revision = revision;
  const clock = settleClock(game.clock, Date.parse(action.at));
  if (clock) {
    clock.running = [];
    clock.paused = false;
  }
  await c.query(
    "UPDATE games SET initial_state=COALESCE(initial_state,state),state=$2,revision=$3,clock=$4,updated_at=$5 WHERE id=$1",
    [
      game.id,
      JSON.stringify(result.state),
      revision,
      JSON.stringify(clock),
      action.at,
    ],
  );
  await c.query(
    "UPDATE game_undo_requests SET status='cancelled' WHERE game_id=$1 AND status='pending'",
    [game.id],
  );
  await transitionMailWaits(
    c,
    game.id,
    game.state,
    result.state.status === "finished" ? null : result.state,
  );
  await c.query(
    "INSERT INTO game_events(game_id,revision,actor_id,events) VALUES($1,$2,$3,$4)",
    [game.id, revision, actor, JSON.stringify(result.events)],
  );
  await c.query(
    "INSERT INTO game_commands(game_id,actor_id,command_id,payload_hash,result,revision,seat,action) VALUES($1,$2,$3,'lifecycle',$4,$5,$6,$7)",
    [
      game.id,
      actor,
      `lifecycle:${revision}`,
      JSON.stringify({ revision }),
      revision,
      seat,
      JSON.stringify(action),
    ],
  );
  return { revision };
}
export async function maintainGame(db: Database, id: string, now = Date.now()) {
  return transaction(db, async (c) => {
    const game = (
      await c.query("SELECT * FROM games WHERE id=$1 FOR UPDATE", [id])
    ).rows[0];
    if (!game || game.state.status === "finished") return null;
    await rememberTimeouts(c, game, now);
    if (now - new Date(game.last_activity_at).getTime() < INACTIVE_MS)
      return null;
    // actor_id is an audit foreign key; the event itself explicitly identifies the system.
    const member = (
      await c.query(
        "SELECT user_id,seat FROM game_members WHERE game_id=$1 ORDER BY seat LIMIT 1",
        [id],
      )
    ).rows[0];
    if (!member) return null;
    return record(c, game, member.user_id, member.seat, {
      kind: "adjudicate",
      reason: "inactive",
      at: new Date(now).toISOString(),
    });
  });
}
export async function adjudicateGame(
  db: Database,
  actor: string,
  id: string,
  input: {
    expectedRevision: number;
    target?: string;
    reason: "forfeit" | "close";
  },
) {
  assertApi(
    (
      await db.query(
        "SELECT 1 FROM game_members WHERE game_id=$1 AND user_id=$2",
        [id, actor],
      )
    ).rowCount,
    "FORBIDDEN",
    403,
  );
  // Enforce the hard deadline before accepting a late action or adjudication.
  await maintainGame(db, id);
  return transaction(db, async (c) => {
    const game = (
      await c.query("SELECT * FROM games WHERE id=$1 FOR UPDATE", [id])
    ).rows[0];
    const member = (
      await c.query(
        "SELECT seat FROM game_members WHERE game_id=$1 AND user_id=$2",
        [id, actor],
      )
    ).rows[0];
    assertApi(game && member, "FORBIDDEN", 403);
    assertApi(game.state.status !== "finished", "GAME_FINISHED", 409);
    assertApi(
      game.revision === input.expectedRevision,
      "REVISION_CONFLICT",
      409,
    );
    assertApi(
      game.state.matchResult?.loser !== member.seat,
      "PLAYER_REMOVED",
      403,
    );
    if (input.reason === "forfeit") {
      assertApi(!game.state.matchResult, "RESULT_ALREADY_SETTLED", 409);
      const clock = await rememberTimeouts(c, game);
      assertApi(clock && !clock.paused, "CLOCK_PAUSED", 409);
      assertApi(
        input.target &&
          input.target !== member.seat &&
          game.state.players[input.target],
        "INVALID_TIMEOUT_TARGET",
        400,
      );
      assertApi(clock.remaining[input.target] <= 0, "PLAYER_NOT_OVERDUE", 409);
      // BGA's fairness rule: a player even further over time cannot expel another.
      assertApi(
        clock.remaining[member.seat] >= clock.remaining[input.target],
        "OWN_CLOCK_WORSE",
        409,
      );
    } else
      assertApi(
        game.state.matchResult?.reason === "forfeit",
        "RESULT_NOT_SETTLED",
        409,
      );
    return record(c, game, actor, member.seat, {
      kind: "adjudicate",
      ...input,
      at: new Date().toISOString(),
    });
  });
}
export async function sweepGames(
  db: Database,
  notify: (id: string, revision: number) => void = () => {},
  now = Date.now(),
) {
  const games = (
    await db.query(
      "SELECT id FROM games WHERE state->>'status'='active' ORDER BY last_activity_at,id",
    )
  ).rows;
  const errors: unknown[] = [];
  for (const game of games) {
    try {
      const result = await maintainGame(db, game.id, now);
      if (result) notify(game.id, result.revision);
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length)
    throw new AggregateError(errors, "Game maintenance failed");
}
export function startGameWorker(
  db: Database,
  notify: (id: string, revision: number) => void,
  onError: (error: unknown) => void,
) {
  let stopped = false,
    running: Promise<void> | undefined;
  const tick = () => {
    if (stopped || running) return;
    running = sweepGames(db, notify)
      .catch(onError)
      .finally(() => {
        running = undefined;
      });
  };
  const timer = setInterval(tick, 60000);
  timer.unref();
  tick();
  return async () => {
    stopped = true;
    clearInterval(timer);
    await running;
  };
}
