import { transaction, type Database } from "../db/pool";
import { getWaitingSeats } from "../../../../packages/rules/src/engine";
import { projectClock } from "../games/clock";
import { digest } from "../auth/password";
import { queueMail } from "./accounts";
import type { Mailer, Message } from "./transport";
import { randomUUID } from "node:crypto";
export async function collectReminders(
  db: Database,
  mailer: Mailer,
  origin: string,
  now = new Date(),
) {
  if (!mailer.enabled) return;
  // Only verified opt-in recipients. Every pass rechecks the current saved state.
  const rows = (
    await db.query(
      "SELECT g.id,m.user_id,m.seat FROM games g JOIN game_members m ON m.game_id=g.id JOIN accounts a ON a.id=m.user_id WHERE a.email IS NOT NULL AND (a.notify_turn OR a.notify_overdue)",
    )
  ).rows;
  for (const r of rows)
    await transaction(db, async (c) => {
      // Lock in the same order as game commands; never collect from a stale
      // snapshot captured before a concurrent action or undo.
      const game = (
        await c.query("SELECT state,clock FROM games WHERE id=$1 FOR SHARE", [
          r.id,
        ])
      ).rows[0];
      const account = (
        await c.query(
          "SELECT email,notify_turn,notify_overdue FROM accounts WHERE id=$1",
          [r.user_id],
        )
      ).rows[0];
      if (
        !game ||
        !account?.email ||
        !(account.notify_turn || account.notify_overdue)
      )
        return;
      Object.assign(r, game, account);
      await c.query(
        "INSERT INTO email_waits(game_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [r.id, r.user_id],
      );
      const w = (
        await c.query(
          "SELECT * FROM email_waits WHERE game_id=$1 AND user_id=$2 FOR UPDATE",
          [r.id, r.user_id],
        )
      ).rows[0];
      const pending = (
        await c.query(
          "SELECT 1 FROM game_undo_requests WHERE game_id=$1 AND status='pending'",
          [r.id],
        )
      ).rowCount;
      const waiting =
        !pending &&
        !r.clock?.paused &&
        getWaitingSeats(r.state).includes(r.seat);
      if (!waiting) {
        await c.query(
          "UPDATE email_waits SET waiting_since=NULL,wait_id=NULL,turn_queued=false,overdue_queued=false WHERE game_id=$1 AND user_id=$2",
          [r.id, r.user_id],
        );
        return;
      }
      if (!w.waiting_since || !w.wait_id) {
        await c.query(
          "UPDATE email_waits SET waiting_since=$1,wait_id=$4,turn_queued=false,overdue_queued=false WHERE game_id=$2 AND user_id=$3",
          [now, r.id, r.user_id, randomUUID()],
        );
        return;
      }
      const overdue =
        !r.state.matchResult &&
        !r.clock?.paused &&
        projectClock(r.clock, now.getTime())?.overdue.includes(r.seat);
      const kind =
        overdue && r.notify_overdue && !w.overdue_queued
          ? "overdue"
          : r.notify_turn &&
              !w.turn_queued &&
              now.getTime() - new Date(w.waiting_since).getTime() >= 120000
            ? "turn"
            : null;
      if (!kind) return;
      const last = kind === "turn" ? w.last_turn_at : w.last_overdue_at;
      if (last && now.getTime() - new Date(last).getTime() < 15 * 60000) return;
      await queueMail(
        c,
        mailer,
        r.user_id,
        kind,
        {
          to: r.email,
          gameId: r.id,
          seat: r.seat,
          waitId: w.wait_id,
          subject:
            kind === "overdue"
              ? "cellman · 对局已超时"
              : "cellman · 轮到你行动",
          text: `${kind === "overdue" ? "你的对局计时已超时，其他玩家可将你移除并按弃局结算；移除前仍可继续操作。整局连续 10 天无人操作将自动结束。" : "你的对局正在等待你行动或处理响应。"}\n\n${new URL(origin).origin}/#/game/${r.id}\n\n可在账号设置中关闭邮件提醒：\n${new URL(origin).origin}/#/account`,
        },
        new Date(now.getTime() + 60 * 60000),
      );
      await c.query(
        kind === "turn"
          ? "UPDATE email_waits SET turn_queued=true,last_turn_at=$1 WHERE game_id=$2 AND user_id=$3"
          : "UPDATE email_waits SET overdue_queued=true,last_overdue_at=$1,turn_queued=true WHERE game_id=$2 AND user_id=$3",
        [now, r.id, r.user_id],
      );
    });
}
async function stillRelevant(db: Database, row: any, message: Message) {
  const a = (
    await db.query("SELECT * FROM accounts WHERE id=$1", [row.user_id])
  ).rows[0];
  if (!a) return false;
  if (row.kind === "verify" || row.kind === "reset" || row.kind === "signup") {
    const t = (
      await db.query(
        "SELECT * FROM email_tokens WHERE token_hash=$1 AND user_id=$2 AND kind=$3 AND expires_at>now()",
        [message.tokenHash, row.user_id, row.kind],
      )
    ).rows[0];
    return (
      !!t &&
      t.email === message.to &&
      t.password_fingerprint === digest(a.password_hash) &&
      (row.kind !== "signup" || a.registration_pending) &&
      (row.kind !== "reset" || a.email === t.email)
    );
  }
  if (
    a.email !== message.to ||
    !(row.kind === "turn" ? a.notify_turn : a.notify_overdue)
  )
    return false;
  const wait = (
    await db.query(
      "SELECT wait_id,waiting_since FROM email_waits WHERE game_id=$1 AND user_id=$2",
      [message.gameId, row.user_id],
    )
  ).rows[0];
  if (
    !message.waitId ||
    !wait?.waiting_since ||
    wait.wait_id !== message.waitId
  )
    return false;
  const g = (
    await db.query("SELECT state,clock FROM games WHERE id=$1", [
      message.gameId,
    ])
  ).rows[0];
  if (
    !g ||
    !getWaitingSeats(g.state).includes(message.seat!) ||
    g.clock?.paused
  )
    return false;
  if (
    (
      await db.query(
        "SELECT 1 FROM game_undo_requests WHERE game_id=$1 AND status='pending'",
        [message.gameId],
      )
    ).rowCount
  )
    return false;
  return (
    row.kind === "turn" ||
    (!g.state.matchResult &&
      !!projectClock(g.clock)?.overdue.includes(message.seat!))
  );
}
export async function deliverMail(
  db: Database,
  mailer: Mailer,
  limit = 10,
  shouldStop = () => false,
) {
  if (!mailer.enabled) return;
  await db.query(
    "UPDATE email_outbox SET status='pending' WHERE status='sending' AND claimed_at<now()-interval '10 minutes'",
  );
  await db.query(
    "UPDATE email_outbox SET status='expired',payload='' WHERE status IN ('pending','sending') AND expires_at<=now()",
  );
  for (let i = 0; i < limit; i++) {
    if (shouldStop()) break;
    const row = await transaction(db, async (c) => {
      const r = (
        await c.query(
          "SELECT * FROM email_outbox WHERE status='pending' AND next_at<=now() AND expires_at>now() ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1",
        )
      ).rows[0];
      if (!r) return null;
      await c.query(
        "UPDATE email_outbox SET status='sending',claimed_at=now(),attempts=attempts+1 WHERE id=$1",
        [r.id],
      );
      return r;
    });
    if (!row) break;
    try {
      const message = mailer.open(row.payload);
      if (!(await stillRelevant(db, row, message))) {
        await db.query(
          "UPDATE email_outbox SET status='cancelled',payload='' WHERE id=$1",
          [row.id],
        );
        continue;
      }
      await mailer.send(message, row.id);
      await db.query(
        "UPDATE email_outbox SET status='sent',sent_at=now(),payload='' WHERE id=$1",
        [row.id],
      );
    } catch {
      // Never log SMTP error objects: they can contain addresses or authentication details.
      const attempts = row.attempts + 1;
      await db.query(
        "UPDATE email_outbox SET status=$1,next_at=now()+$2*interval '1 second',payload=CASE WHEN $1='failed' THEN '' ELSE payload END WHERE id=$3",
        [
          attempts >= 5 ? "failed" : "pending",
          Math.min(900, 30 * 2 ** attempts),
          row.id,
        ],
      );
    }
  }
  await db.query("DELETE FROM email_tokens WHERE expires_at<now()");
  await db.query(
    "DELETE FROM email_attempts WHERE created_at<now()-interval '1 day'",
  );
  await db.query(
    "DELETE FROM email_outbox WHERE status NOT IN ('pending','sending') AND created_at<now()-interval '7 days'",
  );
}
export function startMailWorker(db: Database, mailer: Mailer, origin: string) {
  let stopping = false,
    running: Promise<void> | null = null;
  const tick = () => {
    if (stopping || running || !mailer.enabled) return;
    running = (async () => {
      try {
        await collectReminders(db, mailer, origin);
      } catch {
        // A reminder collection failure must not block password-reset mail.
        console.error("Mail reminder collection failed; details redacted");
      }
      await deliverMail(db, mailer, 10, () => stopping);
    })()
      .catch(() => {
        console.error(
          "Mail worker cycle failed; will retry (details redacted)",
        );
      })
      .finally(() => {
        running = null;
      });
  };
  const timer = setInterval(tick, 15000);
  timer.unref();
  tick();
  return async () => {
    stopping = true;
    clearInterval(timer);
    await running;
  };
}
