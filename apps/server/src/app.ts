import Fastify from "fastify";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import { z } from "zod";
import { EventEmitter } from "node:events";
import { ConnectionBudget, accountLimit } from "./connection-budget";
import type { Database } from "./db/pool";
import { ApiError, assertApi } from "./errors";
import { digest } from "./auth/password";
import { login, authenticate, logout, recover } from "./auth/sessions";
import {
  createRoom,
  joinRoom,
  roomView,
  setReady,
  startRoom,
  leaveRoom,
  updateRoom,
  manageRoom,
} from "./rooms/service";
import { getGame, submitCommand, getReplay } from "./games/commands";
import { requestUndo, voteUndo, undoRequests } from "./games/undo";
import { requestEnd, voteEnd, endRequests } from "./games/end-requests";
import { activeGames, gameHistory } from "./games/lists";
import {
  spectatorView,
  spectatorHistory,
  publicGames,
} from "./games/spectators";
import { playerStats, siteStats } from "./games/stats";
import { adjudicateGame, startGameWorker } from "./games/lifecycle";
import { commandSchema } from "../../../packages/contracts/src/game";
import {
  gameSettingsSchema,
  roomInputSchema,
  effectiveSettings,
  setupModeSchema,
} from "../../../packages/contracts/src/room";
import {
  applyAction,
  getLegalActions,
  getWaitingSeats,
} from "../../../packages/rules/src/engine";
import { officialLarge } from "../../../packages/rules/src/map";
import { disabledMailer, type Mailer } from "./mail/transport";
import {
  emailSchema,
  emailStatus,
  requestEmail,
  forgotPassword,
  consumeEmailToken,
  emailPreferences,
  cancelEmailRequest,
  registerWithEmail,
  resendRegistration,
} from "./mail/accounts";
declare module "fastify" {
  interface FastifyRequest {
    user: { id: string; name: string; csrf: string } | null;
  }
}
export function createApp(
  db: Database,
  origin = "http://127.0.0.1:5173",
  production = false,
  trustedProxies: string[] = [],
  additionalOrigins: string[] = [],
  mailer: Mailer = disabledMailer,
) {
  const allowedOrigins = new Set([origin, ...additionalOrigins]);
  const app = Fastify({
    logger: production,
    disableRequestLogging: true,
    bodyLimit: 32768,
    trustProxy: trustedProxies.length ? trustedProxies : false,
  });
  const events = new EventEmitter();
  const streams = new ConnectionBudget();
  const viewers = new ConnectionBudget({ user: 4, ip: 8, total: 48 });
  events.setMaxListeners(1000);
  let stopGames: (() => Promise<void>) | undefined;
  app.addHook("onReady", async () => {
    if (production)
      stopGames = startGameWorker(
        db,
        (id, revision) => events.emit(id, revision),
        (error) => app.log.error(error, "Game maintenance failed"),
      );
  });
  app.addHook("preClose", async () => {
    await stopGames?.();
    events.emit("server-shutdown");
  });
  app.register(cookie);
  app.register(rateLimit, {
    max: 300,
    timeWindow: "1 minute",
    hook: "preHandler",
    keyGenerator: (req) => (req.user ? "user:" + req.user.id : "ip:" + req.ip),
  });
  // Register routes after plugin initialization so its onRoute hook actually
  // installs the limits. Synchronous root routes bypass that hook.
  app.register(async (app) => {
    app.decorateRequest("user", null);
    app.setErrorHandler((e, _req, reply) => {
      if (e instanceof ApiError)
        return reply.code(e.status).send({ error: e.code });
      if (e instanceof z.ZodError)
        return reply.code(400).send({ error: "INVALID_INPUT" });
      if ((e as { statusCode?: number }).statusCode === 429)
        return reply.code(429).send({ error: "RATE_LIMIT" });
      app.log.error({ message: (e as Error).message }, "Request failed");
      return reply.code(500).send({ error: "SERVER_ERROR" });
    });
    app.addHook("preHandler", async (req) => {
      req.user = await authenticate(db, req.cookies.session);
      if (["POST", "PUT", "DELETE", "PATCH"].includes(req.method)) {
        assertApi(
          !!req.headers.origin && allowedOrigins.has(req.headers.origin),
          "ORIGIN_REJECTED",
          403,
        );
        if (
          req.user &&
          ![
            "/api/auth/login",
            "/api/auth/register",
            "/api/auth/recover",
          ].includes(req.url)
        )
          assertApi(
            req.headers["x-csrf-token"] === req.user.csrf,
            "CSRF_REJECTED",
            403,
          );
      }
      if (
        req.url.startsWith("/api/") &&
        !req.url.startsWith("/api/auth/") &&
        req.url !== "/api/health" &&
        !(
          req.method === "GET" &&
          (req.url.split("?")[0] === "/api/public-games" ||
            /^\/api\/watch\/[a-f0-9-]{36}(?:\/history|\/events)?$/i.test(
              req.url.split("?")[0],
            ))
        )
      )
        assertApi(req.user, "UNAUTHENTICATED", 401);
    });
    const credentials = z.object({
      username: z.string().min(3).max(254),
      password: z.string().min(1).max(512),
      displayName: z.string().min(1).max(30).optional(),
    });
    const authLimit = {
      config: {
        rateLimit: {
          max: 12,
          timeWindow: "1 minute",
          hook: "onRequest" as const,
          keyGenerator: (req: { ip: string }) => "auth:" + req.ip,
        },
      },
    };
    app.get("/api/health", async () => {
      await db.query("SELECT 1");
      return {
        ok: true,
        mode: production ? "production" : "development-preview",
      };
    });
    app.get("/api/auth/me", async (req) =>
      req.user
        ? {
            user: { id: req.user.id, name: req.user.name },
            csrf: req.user.csrf,
          }
        : { user: null },
    );
    const mailLimit = {
      config: {
        rateLimit: {
          max: 8,
          timeWindow: "10 minutes",
          hook: "onRequest" as const,
          keyGenerator: (req: { ip: string; routeOptions: { url?: string } }) =>
            "mail:" + req.routeOptions.url + ":" + req.ip,
        },
      },
    };
    app.get("/api/auth/mail-status", async () => ({
      available: mailer.enabled,
    }));
    app.get("/api/account/email", async (req) =>
      emailStatus(db, req.user!.id, mailer.enabled),
    );
    app.post("/api/account/email", mailLimit, async (req) => {
      const i = z
        .object({ email: emailSchema, password: z.string().min(1).max(512) })
        .strict()
        .parse(req.body);
      return requestEmail(
        db,
        mailer,
        req.user!.id,
        i.email,
        i.password,
        origin,
      );
    });
    app.post("/api/account/email/cancel", async (req) =>
      cancelEmailRequest(db, req.user!.id),
    );
    app.post("/api/account/email/preferences", async (req) => {
      const i = z
        .object({ notifyTurn: z.boolean(), notifyOverdue: z.boolean() })
        .strict()
        .parse(req.body);
      return emailPreferences(db, req.user!.id, i.notifyTurn, i.notifyOverdue);
    });
    app.post("/api/auth/email/forgot", mailLimit, async (req) =>
      forgotPassword(
        db,
        mailer,
        emailSchema.parse(
          z.object({ email: emailSchema }).strict().parse(req.body).email,
        ),
        origin,
      ),
    );
    app.post("/api/auth/email/verify", mailLimit, async (req) => {
      const i = z
        .object({
          token: z.string().min(40).max(100),
          password: z.string().min(1).max(512),
        })
        .strict()
        .parse(req.body);
      await consumeEmailToken(db, i.token, "verify", i.password);
      return { ok: true };
    });
    app.post("/api/auth/email/reset", mailLimit, async (req, reply) => {
      const i = z
        .object({
          token: z.string().min(40).max(100),
          password: z.string().min(1).max(512),
        })
        .strict()
        .parse(req.body);
      const result = await consumeEmailToken(db, i.token, "reset", i.password);
      events.emit("revoke-user:" + result.userId);
      reply.clearCookie("session", { path: "/" });
      return { ok: true, recoveryCode: result.recoveryCode };
    });
    app.post("/api/auth/register", authLimit, async (req) => {
      const input = credentials.extend({ email: emailSchema }).parse(req.body);
      return registerWithEmail(db, mailer, input, origin);
    });
    app.post("/api/auth/register/resend", mailLimit, async (req) => {
      const input = credentials.extend({ email: emailSchema }).parse(req.body);
      return resendRegistration(db, mailer, input, origin);
    });
    app.post("/api/auth/email/signup", mailLimit, async (req) => {
      const input = z
        .object({ token: z.string().min(40).max(100) })
        .strict()
        .parse(req.body);
      await consumeEmailToken(db, input.token, "signup", "");
      return { ok: true };
    });
    app.post("/api/auth/login", authLimit, async (req, reply) => {
      const data = credentials.parse(req.body);
      const result = await login(db, data.username, data.password);
      reply.setCookie("session", result.session, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: production,
        maxAge: 30 * 24 * 60 * 60,
      });
      return { user: result.user, csrf: result.csrf };
    });
    app.post("/api/auth/logout", async (req, reply) => {
      if (req.cookies.session) {
        await logout(db, req.cookies.session);
        events.emit("revoke-session:" + digest(req.cookies.session));
      }
      reply.clearCookie("session", { path: "/" });
      return { ok: true };
    });
    app.post("/api/auth/recover", authLimit, async (req) => {
      const input = credentials
        .extend({ recoveryCode: z.string().max(100) })
        .parse(req.body);
      const result = await recover(
        db,
        input.username,
        input.recoveryCode,
        input.password,
      );
      const users = await db.query(
        "SELECT id FROM accounts WHERE username=$1",
        [input.username.toLowerCase()],
      );
      if (users.rows[0]) events.emit("revoke-user:" + users.rows[0].id);
      return result;
    });
    app.get<{ Querystring: { page?: string } }>(
      "/api/public-games",
      accountLimit("public-games", 20),
      async (req) => {
        const page = z.coerce
          .number()
          .int()
          .min(0)
          .max(10000)
          .parse(req.query.page ?? 0);
        return publicGames(db, page);
      },
    );
    app.get<{ Params: { id: string } }>(
      "/api/watch/:id",
      accountLimit("watch-state", 120),
      async (req) => {
        return spectatorView(db, z.uuid().parse(req.params.id), req.user?.id);
      },
    );
    app.get<{
      Params: { id: string };
      Querystring: { after?: string; before?: string };
    }>(
      "/api/watch/:id/history",
      accountLimit("watch-history", 120),
      async (req) => {
        const cursor = z
          .object({
            after: z.coerce.number().int().nonnegative().optional(),
            before: z.coerce.number().int().positive().optional(),
          })
          .strict()
          .refine((c) => c.after === undefined || c.before === undefined)
          .parse(req.query);
        return spectatorHistory(db, z.uuid().parse(req.params.id), cursor);
      },
    );
    app.get<{ Params: { id: string } }>(
      "/api/watch/:id/events",
      accountLimit("watch-stream", 30),
      async (req, reply) => {
        const id = z.uuid().parse(req.params.id);
        const key = req.user?.id ?? "guest:" + req.ip;
        const viewerRelease = viewers.acquire(key, req.ip);
        const streamRelease = viewerRelease
          ? streams.acquire(key, req.ip)
          : undefined;
        if (!viewerRelease || !streamRelease) {
          viewerRelease?.();
          return reply
            .code(429)
            .header("Retry-After", "30")
            .send({ error: "RATE_LIMIT" });
        }
        const release = () => {
          viewerRelease();
          streamRelease();
        };
        reply.raw.once("close", release);
        let snapshot;
        try {
          snapshot = await spectatorView(db, id);
        } catch (error) {
          release();
          throw error;
        }
        if (reply.raw.destroyed) {
          release();
          return;
        }
        reply.hijack();
        reply.raw.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        });
        const send = (revision: number) => {
          if (
            !reply.raw.writableEnded &&
            !reply.raw.write(`data: ${JSON.stringify({ revision })}\n\n`)
          )
            reply.raw.destroy();
        };
        const close = () => reply.raw.end();
        send(snapshot.state.revision);
        events.on(id, send);
        events.on("server-shutdown", close);
        const timer = setInterval(() => {
          if (!reply.raw.writableEnded && !reply.raw.write(": heartbeat\n\n"))
            reply.raw.destroy();
        }, 15000);
        reply.raw.once("close", () => {
          clearInterval(timer);
          events.off(id, send);
          events.off("server-shutdown", close);
        });
      },
    );
    app.get("/api/rooms", async (req) => {
      const { rows } = await db.query(
        "SELECT r.id,r.visibility,r.capacity,r.status,r.setup_mode AS \"setupMode\",r.settings,a.display_name AS host,COUNT(s.user_id)::int AS count FROM rooms r JOIN accounts a ON a.id=r.host_id LEFT JOIN room_seats s ON s.room_id=r.id WHERE r.status='waiting' AND (r.visibility='public' OR EXISTS(SELECT 1 FROM room_seats own WHERE own.room_id=r.id AND own.user_id=$1)) GROUP BY r.id,a.display_name ORDER BY r.created_at DESC LIMIT 100",
        [req.user!.id],
      );
      return rows.map((room) => ({
        ...room,
        settings: effectiveSettings(
          gameSettingsSchema.parse(room.settings),
          room.setupMode,
        ),
      }));
    });
    app.post(
      "/api/rooms",
      accountLimit("create-room", 12, "10 minutes"),
      async (req) => {
        const input = z
          .object({
            visibility: z.enum(["public", "private"]),
            seats: z.number().int().min(2).max(5),
            setupMode: setupModeSchema.optional(),
            settings: gameSettingsSchema.optional(),
          })
          .parse(req.body);
        return createRoom(db, req.user!.id, input);
      },
    );
    app.get<{ Params: { id: string } }>("/api/rooms/:id", async (req) =>
      roomView(db, req.user!.id, req.params.id),
    );
    app.post<{ Params: { id: string } }>(
      "/api/rooms/:id/join",
      accountLimit("join-room", 30),
      async (req) => {
        const { inviteToken } = z
          .object({ inviteToken: z.string().max(100).optional() })
          .parse(req.body);
        return joinRoom(db, req.user!.id, req.params.id, inviteToken);
      },
    );
    app.post<{ Params: { id: string } }>(
      "/api/rooms/:id/settings",
      async (req) => {
        const { expectedRevision, ...input } = roomInputSchema
          .safeExtend({ expectedRevision: z.number().int().nonnegative() })
          .parse(req.body);
        return updateRoom(
          db,
          req.user!.id,
          req.params.id,
          input,
          expectedRevision,
        );
      },
    );
    app.post<{ Params: { id: string } }>(
      "/api/rooms/:id/manage",
      async (req) => {
        const { expectedRevision, action } = z
          .object({
            expectedRevision: z.number().int().nonnegative(),
            action: z.discriminatedUnion("kind", [
              z.object({ kind: z.literal("invite") }).strict(),
              z.object({ kind: z.literal("kick"), userId: z.uuid() }).strict(),
              z
                .object({ kind: z.literal("transfer"), userId: z.uuid() })
                .strict(),
              z
                .object({
                  kind: z.literal("reorder"),
                  userIds: z.array(z.uuid()).min(1).max(5),
                })
                .strict(),
            ]),
          })
          .strict()
          .parse(req.body);
        return manageRoom(
          db,
          req.user!.id,
          req.params.id,
          action,
          expectedRevision,
        );
      },
    );
    app.post<{ Params: { id: string } }>(
      "/api/rooms/:id/ready",
      async (req) => {
        const input = z
          .object({
            ready: z.boolean(),
            expectedRevision: z.number().int().nonnegative().optional(),
          })
          .parse(req.body);
        return setReady(
          db,
          req.user!.id,
          req.params.id,
          input.ready,
          input.expectedRevision,
        );
      },
    );
    app.post<{ Params: { id: string } }>("/api/rooms/:id/start", async (req) =>
      startRoom(
        db,
        req.user!.id,
        req.params.id,
        z
          .object({
            expectedRevision: z.number().int().nonnegative().optional(),
          })
          .parse(req.body ?? {}).expectedRevision,
      ),
    );
    app.post<{ Params: { id: string } }>(
      "/api/rooms/:id/leave",
      async (req) => {
        await leaveRoom(db, req.user!.id, req.params.id);
        return { ok: true };
      },
    );
    app.get("/api/me/games", async (req) => activeGames(db, req.user!.id));
    app.get<{ Querystring: { page?: string } }>(
      "/api/me/game-history",
      accountLimit("game-history", 30),
      async (req) => {
        const page = z.coerce
          .number()
          .int()
          .min(0)
          .max(10000)
          .parse(req.query.page ?? 0);
        return gameHistory(db, req.user!.id, page);
      },
    );
    app.get("/api/me/stats", accountLimit("personal-stats", 20), async (req) =>
      playerStats(db, req.user!.id),
    );
    app.post<{ Params: { id: string } }>(
      "/api/games/:id/adjudicate",
      async (req) => {
        const input = z
          .object({
            expectedRevision: z.number().int().nonnegative(),
            reason: z.enum(["forfeit", "close"]),
            target: z.string().max(20).optional(),
          })
          .strict()
          .parse(req.body);
        const result = await adjudicateGame(
          db,
          req.user!.id,
          req.params.id,
          input,
        );
        events.emit(req.params.id, result.revision);
        return result;
      },
    );
    app.get<{ Querystring: { count?: string } }>(
      "/api/stats",
      accountLimit("site-stats", 20),
      async (req) =>
        siteStats(
          db,
          req.query.count === undefined
            ? undefined
            : z.coerce.number().int().min(3).max(5).parse(req.query.count),
        ),
    );
    app.post<{ Params: { id: string } }>(
      "/api/games/:id/undo/request",
      accountLimit("undo-request", 10),
      async (req) => {
        const input = z
          .object({
            requestId: z.uuid(),
            expectedRevision: z.number().int().nonnegative(),
            targetRevision: z.number().int().nonnegative(),
            reason: z.string().trim().min(1).max(300),
          })
          .parse(req.body);
        const result = await requestUndo(
          db,
          req.user!.id,
          req.params.id,
          input,
        );
        events.emit(req.params.id, result.revision);
        return result;
      },
    );
    app.post<{ Params: { id: string } }>(
      "/api/games/:id/undo/vote",
      async (req) => {
        const input = z
          .object({
            requestId: z.uuid(),
            decision: z.enum(["approve", "reject", "cancel"]),
          })
          .parse(req.body);
        const result = await voteUndo(db, req.user!.id, req.params.id, input);
        events.emit(req.params.id, result.revision);
        return result;
      },
    );
    app.post<{ Params: { id: string } }>(
      "/api/games/:id/end/request",
      accountLimit("end-request", 6, "1 hour"),
      async (req) => {
        const input = z
          .object({
            requestId: z.uuid(),
            expectedRevision: z.number().int().nonnegative(),
            reason: z.string().trim().max(200).default(""),
          })
          .strict()
          .parse(req.body);
        const result = await requestEnd(db, req.user!.id, req.params.id, input);
        events.emit(req.params.id, result.revision);
        return result;
      },
    );
    app.post<{ Params: { id: string } }>(
      "/api/games/:id/end/vote",
      accountLimit("end-vote", 30),
      async (req) => {
        const input = z
          .object({
            requestId: z.uuid(),
            decision: z.enum(["approve", "reject", "cancel"]),
          })
          .strict()
          .parse(req.body);
        const result = await voteEnd(db, req.user!.id, req.params.id, input);
        events.emit(req.params.id, result.revision);
        return result;
      },
    );
    app.get<{ Params: { id: string } }>("/api/games/:id", async (req) => {
      const { state, seat, settings, clock, inactiveDeadline } = await getGame(
        db,
        req.user!.id,
        req.params.id,
      );
      return {
        state,
        seat,
        settings,
        clock,
        inactiveDeadline,
        undoRequests: await undoRequests(db, req.params.id),
        endRequests: await endRequests(db, req.params.id),
        map: officialLarge,
        waitingSeats: getWaitingSeats(state),
        legalActions: getLegalActions(state, seat),
      };
    });
    app.post<{ Params: { id: string } }>(
      "/api/games/:id/preview",
      accountLimit("preview", 90),
      async (req) => {
        const command = commandSchema.parse(req.body);
        const { state, seat } = await getGame(db, req.user!.id, req.params.id);
        assertApi(
          state.revision === command.expectedRevision,
          "REVISION_CONFLICT",
          409,
        );
        const result = applyAction(state, seat, command.action);
        if (!result.ok && result.error.code === "RULESET_UNAVAILABLE")
          assertApi(false, "RULESET_UNAVAILABLE", 503);
        assertApi(result.ok, result.ok ? "" : result.error.code);
        return {
          baseRevision: state.revision,
          state: result.state,
          events: result.events,
        };
      },
    );
    app.post<{ Params: { id: string } }>(
      "/api/games/:id/commands",
      async (req) => {
        const command = commandSchema.parse(req.body);
        const result = await submitCommand(
          db,
          req.user!.id,
          req.params.id,
          command,
        );
        events.emit(req.params.id, result.revision);
        return result;
      },
    );
    app.get<{
      Params: { id: string };
      Querystring: { after?: string; before?: string };
    }>("/api/games/:id/history", async (req) => {
      await getGame(db, req.user!.id, req.params.id);
      if (req.query.before !== undefined) {
        const before = z.coerce
          .number()
          .int()
          .positive()
          .parse(req.query.before);
        const older = await db.query(
          "SELECT revision,events,created_at FROM game_events WHERE game_id=$1 AND revision<$2 ORDER BY revision DESC LIMIT 100",
          [req.params.id, before],
        );
        return older.rows.reverse();
      }
      if (req.query.after === undefined) {
        const latest = await db.query(
          "SELECT revision,events,created_at FROM game_events WHERE game_id=$1 ORDER BY revision DESC LIMIT 100",
          [req.params.id],
        );
        return latest.rows.reverse();
      }
      const after = z.coerce
        .number()
        .int()
        .nonnegative()
        .parse(req.query.after ?? 0);
      return (
        await db.query(
          "SELECT revision,events,created_at FROM game_events WHERE game_id=$1 AND revision>$2 ORDER BY revision LIMIT 100",
          [req.params.id, after],
        )
      ).rows;
    });
    app.get<{ Params: { id: string } }>(
      "/api/games/:id/replay",
      accountLimit("replay", 20),
      async (req) => getReplay(db, req.user!.id, req.params.id),
    );
    app.get<{ Params: { id: string } }>(
      "/api/games/:id/events",
      accountLimit("stream-open", 60),
      async (req, reply) => {
        const release = streams.acquire(req.user!.id, req.ip);
        if (!release)
          return reply
            .code(429)
            .header("Retry-After", "15")
            .send({ error: "RATE_LIMIT" });
        reply.raw.once("close", release);
        let state;
        try {
          ({ state } = await getGame(db, req.user!.id, req.params.id));
        } catch (error) {
          release();
          throw error;
        }
        if (reply.raw.destroyed) {
          release();
          return;
        }
        reply.hijack();
        reply.raw.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        });
        const send = (revision: number) => {
          if (
            !reply.raw.writableEnded &&
            !reply.raw.write(
              `data: ${JSON.stringify({ gameId: req.params.id, revision })}\n\n`,
            )
          )
            reply.raw.destroy(); // Slow consumers reconnect; never buffer forever.
        };
        send(state.revision);
        events.on(req.params.id, send);
        const revoke = () => reply.raw.end();
        events.on("server-shutdown", revoke);
        const sessionChannel = "revoke-session:" + digest(req.cookies.session!);
        const userChannel = "revoke-user:" + req.user!.id;
        events.on(sessionChannel, revoke);
        events.on(userChannel, revoke);
        let checking = false;
        const timer = setInterval(async () => {
          if (checking || reply.raw.destroyed) return;
          checking = true;
          try {
            if (!(await authenticate(db, req.cookies.session))) {
              reply.raw.end();
              return;
            }
            if (!reply.raw.writableEnded && !reply.raw.write(": heartbeat\n\n"))
              reply.raw.destroy();
          } catch {
            reply.raw.end();
          } finally {
            checking = false;
          }
        }, 15000);
        reply.raw.on("close", () => {
          clearInterval(timer);
          events.off(sessionChannel, revoke);
          events.off(userChannel, revoke);
          events.off("server-shutdown", revoke);
          events.off(req.params.id, send);
        });
      },
    );
  });
  return app;
}
