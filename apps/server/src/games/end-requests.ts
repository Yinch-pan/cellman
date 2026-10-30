import { transaction, type Database } from "../db/pool";
import type { PoolClient } from "pg";
import { assertApi } from "../errors";
import { getGame } from "./commands";
import { recordLifecycle } from "./lifecycle";

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
  await c.query(
    "UPDATE game_end_requests SET status='expired' WHERE game_id=$1 AND status='pending' AND expires_at<=now()",
    [id],
  );
  return { game, members, member };
}
export async function endRequests(db: Database, id: string) {
  return (
    await db.query(
      "SELECT id,requester_seat,base_revision,reason,votes,status,applied_revision,created_at,expires_at FROM game_end_requests WHERE game_id=$1 ORDER BY created_at DESC,id DESC LIMIT 50",
      [id],
    )
  ).rows;
}
export async function requestEnd(
  db: Database,
  actor: string,
  id: string,
  input: { requestId: string; expectedRevision: number; reason: string },
) {
  await getGame(db, actor, id);
  return transaction(db, async (c) => {
    const { game, member } = await lockGame(c, actor, id);
    const prior = (
      await c.query(
        "SELECT * FROM game_end_requests WHERE game_id=$1 AND id=$2",
        [id, input.requestId],
      )
    ).rows[0];
    if (prior) {
      assertApi(
        prior.requester === actor &&
          prior.base_revision === input.expectedRevision &&
          prior.reason === input.reason,
        "COMMAND_REUSE",
        409,
      );
      return { revision: game.revision, status: prior.status };
    }
    assertApi(game.state.status !== "finished", "GAME_FINISHED", 409);
    assertApi(!game.state.matchResult, "RESULT_ALREADY_SETTLED", 409);
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
    assertApi(
      !(
        await c.query(
          "SELECT 1 FROM game_end_requests WHERE game_id=$1 AND status='pending'",
          [id],
        )
      ).rowCount,
      "END_REQUEST_PENDING",
      409,
    );
    assertApi(
      !(
        await c.query(
          "SELECT 1 FROM game_end_requests WHERE game_id=$1 AND requester=$2 AND created_at>now()-interval '5 minutes' LIMIT 1",
          [id, actor],
        )
      ).rowCount,
      "END_REQUEST_COOLDOWN",
      429,
    );
    await c.query(
      "INSERT INTO game_end_requests(game_id,id,requester,requester_seat,base_revision,reason,votes) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [
        id,
        input.requestId,
        actor,
        member.seat,
        game.revision,
        input.reason,
        JSON.stringify({ [member.seat]: true }),
      ],
    );
    // Consent never pauses the clock or refreshes the inactivity deadline.
    return { revision: game.revision, status: "pending" };
  });
}
export async function voteEnd(
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
        "SELECT * FROM game_end_requests WHERE game_id=$1 AND id=$2 FOR UPDATE",
        [id, input.requestId],
      )
    ).rows[0];
    assertApi(request, "NOT_FOUND", 404);
    if (input.decision === "cancel")
      assertApi(request.requester === actor, "FORBIDDEN", 403);
    if (request.status !== "pending")
      return { revision: game.revision, status: request.status };
    if (
      request.base_revision !== game.revision ||
      game.state.status === "finished" ||
      game.state.matchResult
    ) {
      await c.query(
        "UPDATE game_end_requests SET status='changed' WHERE game_id=$1 AND id=$2",
        [id, input.requestId],
      );
      return { revision: game.revision, status: "changed" };
    }
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
    if (status === "pending" && members.every((m) => votes[m.seat] === true)) {
      const result = await recordLifecycle(c, game, actor, member.seat, {
        kind: "adjudicate",
        reason: "consensus",
        at: new Date().toISOString(),
        consent: {
          requestId: request.id,
          proposer: request.requester_seat,
          approvedSeats: members.map((m) => m.seat),
          reason: request.reason,
        },
      });
      revision = result.revision;
      status = "applied";
    }
    await c.query(
      "UPDATE game_end_requests SET votes=$1,status=$2,applied_revision=$3 WHERE game_id=$4 AND id=$5",
      [
        JSON.stringify(votes),
        status,
        status === "applied" ? revision : null,
        id,
        request.id,
      ],
    );
    return { revision, status };
  });
}
