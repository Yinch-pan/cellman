import type { PoolClient } from "pg";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { transaction, type Database } from "../db/pool";
import { assertApi } from "../errors";
import { token, digest, passwordHash, passwordMatches } from "../auth/password";
import { register, validPassword } from "../auth/sessions";
import type { Mailer, Message } from "./transport";
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email().max(254));
export async function queueMail(
  c: PoolClient,
  mailer: Mailer,
  userId: string,
  kind: string,
  message: Message,
  expires: Date,
) {
  await c.query(
    "INSERT INTO email_outbox(id,user_id,kind,payload,expires_at) VALUES($1,$2,$3,$4,$5)",
    [randomUUID(), userId, kind, mailer.seal(message), expires],
  );
}
async function issue(
  c: PoolClient,
  mailer: Mailer,
  user: any,
  email: string,
  kind: "verify" | "reset" | "signup",
  origin: string,
) {
  // Serialize both recipient and account limits; addresses are not logged here.
  await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
    "email:" + email,
  ]);
  const limits = (
    await c.query(
      "SELECT count(*) FILTER(WHERE created_at>now()-interval '1 minute' AND user_id=$1)::int AS recent,count(*)::int AS hourly FROM email_attempts WHERE created_at>now()-interval '1 hour' AND (user_id=$1 OR destination_hash=$2)",
      [user.id, digest(email)],
    )
  ).rows[0];
  if (limits.recent > 0 || limits.hourly >= 5) return false;
  const raw = token(),
    hash = digest(raw),
    expires = new Date(Date.now() + 20 * 60000);
  await c.query(
    "INSERT INTO email_attempts(user_id,destination_hash) VALUES($1,$2)",
    [user.id, digest(email)],
  );
  await c.query("DELETE FROM email_tokens WHERE user_id=$1 AND kind=$2", [
    user.id,
    kind,
  ]);
  await c.query(
    "UPDATE email_outbox SET status='cancelled',payload='' WHERE user_id=$1 AND kind=$2 AND status='pending'",
    [user.id, kind],
  );
  await c.query(
    "INSERT INTO email_tokens(token_hash,user_id,email,kind,password_fingerprint,expires_at) VALUES($1,$2,$3,$4,$5,$6)",
    [hash, user.id, email, kind, digest(user.password_hash), expires],
  );
  const link = `${new URL(origin).origin}/#/email/${kind}?token=${raw}`;
  await queueMail(
    c,
    mailer,
    user.id,
    kind,
    {
      to: email,
      tokenHash: hash,
      subject:
        kind === "signup"
          ? "cellman · 确认注册"
          : kind === "verify"
            ? "cellman · 验证邮箱"
            : "cellman · 重置密码",
      text: `账号：${user.username}\n\n${kind === "signup" ? "请打开以下链接确认注册。验证邮箱后才能登录游戏。" : kind === "verify" ? "请打开以下链接，并输入该账号的当前密码确认邮箱绑定。" : "请打开以下链接设置新密码。"}\n${link}\n\n链接 20 分钟内有效，只能使用一次。若不是你本人发起，请忽略此邮件，不要转发链接。`,
    },
    expires,
  );
  return true;
}
export async function registerWithEmail(
  db: Database,
  mailer: Mailer,
  input: {
    username: string;
    password: string;
    email: string;
    displayName?: string;
  },
  origin: string,
) {
  assertApi(mailer.enabled, "MAIL_DISABLED", 503);
  const email = emailSchema.parse(input.email);
  return transaction(db, async (c) => {
    assertApi(
      !(await c.query("SELECT 1 FROM accounts WHERE lower(email)=$1", [email]))
        .rowCount,
      "EMAIL_UNAVAILABLE",
      409,
    );
    const account = await register(c, input, true);
    const user = (
      await c.query("SELECT * FROM accounts WHERE id=$1", [account.userId])
    ).rows[0];
    assertApi(
      await issue(c, mailer, user, email, "signup", origin),
      "MAIL_RATE_LIMIT",
      429,
    );
    return { verificationRequired: true, email, emailDelivery: "queued" };
  });
}
export async function resendRegistration(
  db: Database,
  mailer: Mailer,
  input: { username: string; password: string; email: string },
  origin: string,
) {
  assertApi(mailer.enabled, "MAIL_DISABLED", 503);
  const email = emailSchema.parse(input.email);
  return transaction(db, async (c) => {
    const user = (
      await c.query("SELECT * FROM accounts WHERE username=$1 FOR UPDATE", [
        input.username.trim().toLowerCase(),
      ])
    ).rows[0];
    assertApi(
      user && (await passwordMatches(input.password, user.password_hash)),
      "INVALID_CREDENTIALS",
      401,
    );
    assertApi(user.registration_pending, "REGISTRATION_ALREADY_VERIFIED", 409);
    assertApi(
      !(await c.query("SELECT 1 FROM accounts WHERE lower(email)=$1", [email]))
        .rowCount,
      "EMAIL_UNAVAILABLE",
      409,
    );
    assertApi(
      await issue(c, mailer, user, email, "signup", origin),
      "MAIL_RATE_LIMIT",
      429,
    );
    return { verificationRequired: true, email, emailDelivery: "queued" };
  });
}
export async function emailStatus(
  db: Database,
  actor: string,
  enabled: boolean,
) {
  const a = (
    await db.query(
      "SELECT email,notify_turn,notify_overdue FROM accounts WHERE id=$1",
      [actor],
    )
  ).rows[0];
  assertApi(a, "UNAUTHENTICATED", 401);
  const pending = (
    await db.query(
      "SELECT email,expires_at FROM email_tokens WHERE user_id=$1 AND kind='verify' AND expires_at>now()",
      [actor],
    )
  ).rows[0];
  const delivery = (
    await db.query(
      "SELECT status FROM email_outbox WHERE user_id=$1 AND kind='verify' ORDER BY created_at DESC LIMIT 1",
      [actor],
    )
  ).rows[0];
  return {
    available: enabled,
    email: a.email,
    pendingEmail: pending?.email ?? null,
    expiresAt: pending?.expires_at ?? null,
    delivery: pending ? delivery?.status : null,
    notifyTurn: a.notify_turn,
    notifyOverdue: a.notify_overdue,
  };
}
export async function requestEmail(
  db: Database,
  mailer: Mailer,
  actor: string,
  email: string,
  password: string,
  origin: string,
) {
  assertApi(mailer.enabled, "MAIL_DISABLED", 503);
  email = emailSchema.parse(email);
  await transaction(db, async (c) => {
    const user = (
      await c.query("SELECT * FROM accounts WHERE id=$1 FOR UPDATE", [actor])
    ).rows[0];
    assertApi(
      user && (await passwordMatches(password, user.password_hash)),
      "INVALID_CREDENTIALS",
      401,
    );
    assertApi(user.email !== email, "EMAIL_ALREADY_VERIFIED", 409);
    assertApi(
      !(
        await c.query(
          "SELECT 1 FROM accounts WHERE lower(email)=$1 AND id<>$2",
          [email, actor],
        )
      ).rowCount,
      "EMAIL_UNAVAILABLE",
      409,
    );
    assertApi(
      await issue(c, mailer, user, email, "verify", origin),
      "MAIL_RATE_LIMIT",
      429,
    );
  });
  return { ok: true };
}
export async function forgotPassword(
  db: Database,
  mailer: Mailer,
  email: string,
  origin: string,
) {
  assertApi(mailer.enabled, "MAIL_DISABLED", 503);
  email = emailSchema.parse(email);
  await transaction(db, async (c) => {
    const user = (
      await c.query("SELECT * FROM accounts WHERE lower(email)=$1 FOR UPDATE", [
        email,
      ])
    ).rows[0];
    if (user) await issue(c, mailer, user, email, "reset", origin);
  });
  // The response is deliberately identical for missing, throttled and valid mailboxes.
  return { ok: true };
}
export async function consumeEmailToken(
  db: Database,
  raw: string,
  kind: "verify" | "reset" | "signup",
  password: string,
) {
  if (kind === "reset") validPassword(password);
  const nextPassword = kind === "reset" ? await passwordHash(password) : null,
    nextRecovery = kind === "reset" ? token() : null;
  try {
    return await transaction(db, async (c) => {
      const ref = (
        await c.query(
          "SELECT user_id FROM email_tokens WHERE token_hash=$1 AND kind=$2",
          [digest(raw), kind],
        )
      ).rows[0];
      assertApi(ref, "EMAIL_LINK_INVALID", 400);
      const user = (
        await c.query("SELECT * FROM accounts WHERE id=$1 FOR UPDATE", [
          ref.user_id,
        ])
      ).rows[0];
      const t = (
        await c.query(
          "SELECT * FROM email_tokens WHERE token_hash=$1 AND kind=$2 AND expires_at>now() FOR UPDATE",
          [digest(raw), kind],
        )
      ).rows[0];
      assertApi(
        t && user && t.password_fingerprint === digest(user.password_hash),
        "EMAIL_LINK_INVALID",
        400,
      );
      if (kind === "verify" || kind === "signup") {
        if (kind === "signup")
          assertApi(user.registration_pending, "EMAIL_LINK_INVALID", 400);
        else
          assertApi(
            await passwordMatches(password, user.password_hash),
            "INVALID_CREDENTIALS",
            401,
          );
        await c.query(
          "UPDATE accounts SET email=$1,registration_pending=false WHERE id=$2",
          [t.email, user.id],
        );
        await c.query(
          "UPDATE email_waits SET waiting_since=NULL,wait_id=NULL,turn_queued=false,overdue_queued=false WHERE user_id=$1",
          [user.id],
        );
      } else {
        assertApi(user.email === t.email, "EMAIL_LINK_INVALID", 400);
        await c.query(
          "UPDATE accounts SET password_hash=$1,recovery_hash=$2 WHERE id=$3",
          [nextPassword, digest(nextRecovery!), user.id],
        );
        await c.query("DELETE FROM sessions WHERE user_id=$1", [user.id]);
      }
      await c.query("DELETE FROM email_tokens WHERE user_id=$1", [user.id]);
      await c.query(
        "UPDATE email_outbox SET status='cancelled',payload='' WHERE user_id=$1 AND kind IN ('verify','reset','signup') AND status='pending'",
        [user.id],
      );
      return { userId: user.id, recoveryCode: nextRecovery };
    });
  } catch (e) {
    if ((e as { code?: string }).code === "23505")
      assertApi(false, "EMAIL_UNAVAILABLE", 409);
    throw e;
  }
}
export async function emailPreferences(
  db: Database,
  actor: string,
  turn: boolean,
  overdue: boolean,
) {
  await transaction(db, async (c) => {
    const a = await c.query(
      "UPDATE accounts SET notify_turn=$1,notify_overdue=$2 WHERE id=$3 AND (email IS NOT NULL OR ($1=false AND $2=false))",
      [turn, overdue, actor],
    );
    assertApi(a.rowCount, "EMAIL_VERIFY_FIRST", 409);
    await c.query(
      "UPDATE email_outbox SET status='cancelled',payload='' WHERE user_id=$1 AND status='pending' AND ((kind='turn' AND NOT $2) OR (kind='overdue' AND NOT $3))",
      [actor, turn, overdue],
    );
    if (!turn && !overdue)
      await c.query(
        "UPDATE email_waits SET waiting_since=NULL,wait_id=NULL,turn_queued=false,overdue_queued=false WHERE user_id=$1",
        [actor],
      );
  });
  return { ok: true };
}
export async function cancelEmailRequest(db: Database, actor: string) {
  await transaction(db, async (c) => {
    await c.query("SELECT id FROM accounts WHERE id=$1 FOR UPDATE", [actor]);
    await c.query(
      "DELETE FROM email_tokens WHERE user_id=$1 AND kind='verify'",
      [actor],
    );
    await c.query(
      "UPDATE email_outbox SET status='cancelled',payload='' WHERE user_id=$1 AND kind='verify' AND status='pending'",
      [actor],
    );
  });
  return { ok: true };
}
