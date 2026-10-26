import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { get, type ClientRequest, type IncomingMessage } from "node:http";
import { Pool, migrate } from "../src/db/pool";
import { createApp } from "../src/app";
import { register, login } from "../src/auth/sessions";
import { chooseMove } from "../../../packages/rules/test/fixtures/players";
import type { GameAction, GameState } from "../../../packages/rules/src/types";

// Real HTTP/SSE and PostgreSQL, isolated from the user's preview.
// All player counts use the actual room API, including random drafting.
const url = process.env.TEST_DATABASE_URL;
const schema = "multiplayer_" + randomUUID().replaceAll("-", "");
const admin = new Pool({ connectionString: url });
const db = new Pool({
  connectionString: url,
  options: `-c search_path=${schema}`,
});
const origin = "http://127.0.0.1:5173";
type Actor = Awaited<ReturnType<typeof login>>;
const actors: Actor[] = [];
let created = false;

beforeAll(async () => {
  if (!url || url === process.env.DATABASE_URL)
    throw Error("A separate TEST_DATABASE_URL is required");
  await admin.query(`CREATE SCHEMA ${schema}`);
  created = true;
  await migrate(db);
  for (let i = 0; i < 6; i++) {
    await register(db, {
      username: "multiplayer" + i,
      password: "multiplayer-test-password",
    });
    actors.push(
      await login(db, "multiplayer" + i, "multiplayer-test-password"),
    );
  }
});
afterAll(async () => {
  await db.end();
  if (created) await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
});

function stream(address: string, gameId: string, actor: Actor) {
  const revisions: number[] = [];
  let response: IncomingMessage | undefined;
  let request: ClientRequest;
  let failure: Error | undefined;
  const ready = new Promise<void>((resolve, reject) => {
    request = get(
      address + "/api/games/" + gameId + "/events",
      {
        headers: { cookie: "session=" + actor.session },
      },
      (res) => {
        response = res;
        if (res.statusCode !== 200) {
          res.resume();
          reject(Error("SSE status " + res.statusCode));
          return;
        }
        let buffer = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          buffer += chunk;
          let end: number;
          while ((end = buffer.indexOf("\n\n")) >= 0) {
            const event = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            if (event.startsWith("data: ")) {
              const data = JSON.parse(event.slice(6));
              if (data.gameId !== gameId) {
                failure = Error("Cross-game SSE message");
                continue;
              }
              revisions.push(data.revision);
              resolve();
            }
          }
        });
        res.on("error", (error) => {
          failure = error;
        });
      },
    );
    request.on("error", reject);
  });
  return {
    revisions,
    async waitFor(revision: number) {
      await expect
        .poll(
          () => {
            if (failure) throw failure;
            return revisions.includes(revision);
          },
          { timeout: 3000 },
        )
        .toBe(true);
      await ready;
    },
    close() {
      response?.destroy();
      request?.destroy();
    },
  };
}

describe.each([3, 4, 5])("%i-client transport", (count) => {
  it("rotates seats, broadcasts, rejects races, reconnects and survives application restart", async () => {
    let app = createApp(db);
    let address = await app.listen({ port: 0, host: "127.0.0.1" });
    const streams: ReturnType<typeof stream>[] = [];
    async function request(actor: number, path: string, body?: unknown) {
      const result = await fetch(address + "/api" + path, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          origin,
          cookie: "session=" + actors[actor].session,
          "x-csrf-token": actors[actor].csrf,
          "content-type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      });
      return { status: result.status, body: await result.json() };
    }
    let gameId = "";
    const command = (revision: number, action: GameAction) => ({
      commandId: randomUUID(),
      expectedRevision: revision,
      action,
    });
    try {
      const room = await request(0, "/rooms", {
        visibility: "public",
        seats: count,
        setupMode: count === 3 ? "training" : "standard",
      });
      expect(room.status).toBe(200);
      for (let i = 1; i < count; i++)
        expect(
          (await request(i, `/rooms/${room.body.id}/join`, {})).status,
        ).toBe(200);
      for (let i = 0; i < count; i++)
        expect(
          (await request(i, `/rooms/${room.body.id}/ready`, { ready: true }))
            .status,
        ).toBe(200);
      const started = await request(0, `/rooms/${room.body.id}/start`, {});
      expect(started.status).toBe(200);
      gameId = started.body.gameId;
      const path = "/games/" + gameId;
      for (let i = 0; i < count; i++) {
        streams.push(stream(address, gameId, actors[i]));
        await streams[i].waitFor(0);
      }
      const snapshots = await Promise.all(
        Array.from({ length: count }, (_, i) => request(i, path)),
      );
      snapshots.forEach((r, i) => {
        expect(r.status).toBe(200);
        expect(r.body.seat).toBe("p" + (i + 1));
        expect(r.body.state).toEqual(snapshots[0].body.state);
      });
      // Unauthorized writes and reads must not leak even a live event stream.
      for (const suffix of ["", "/history", "/events"])
        expect((await request(5, path + suffix)).status).toBe(403);
      expect(
        (
          await request(
            5,
            path + "/commands",
            command(0, { kind: "place", hex: "A1" }),
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await request(
            snapshots[0].body.state.activeSeat === "p1" ? 1 : 0,
            path + "/commands",
            command(0, { kind: "place", hex: "A3" }),
          )
        ).body.error,
      ).toBe("NOT_YOUR_TURN");
      // Disconnect the final client while others advance the game.
      streams[count - 1].close();
      let revision = 0;
      for (let step = 0; step < 50; step++) {
        const before = (await request(0, path)).body;
        const state = before.state as GameState;
        if (state.phase === "actions" && !state.pending.length) break;
        const { seat, action } = chooseMove(state);
        const actor = Number(seat.slice(1)) - 1;
        const payload = command(revision, action);
        if (step === 0) {
          expect(
            (await request(actor, path + "/preview", payload)).status,
          ).toBe(200);
          expect((await request(actor, path)).body.state.revision).toBe(0);
        }
        const result = await request(actor, path + "/commands", payload);
        expect(result.status).toBe(200);
        expect(result.body.revision).toBe(++revision);
        // Lost-response retry: exact result, no second turn/write.
        expect(await request(actor, path + "/commands", payload)).toEqual(
          result,
        );
        await Promise.all(
          streams.slice(0, count - 1).map((s) => s.waitFor(revision)),
        );
        const views = await Promise.all(
          Array.from({ length: count }, (_, i) => request(i, path)),
        );
        views.forEach((view) => {
          expect(view.status).toBe(200);
          expect(view.body.state.revision).toBe(revision);
          expect(view.body.state).toEqual(views[0].body.state);
        });
      }
      expect((await request(0, path)).body.state.phase).toBe("actions");
      const reconnect = stream(address, gameId, actors[count - 1]);
      streams.push(reconnect);
      await reconnect.waitFor(revision);
      // Advance two actual action rounds in seat order; no fixture writes after setup.
      for (let round = 1; round <= 2; round++) {
        for (let turn = 0; turn < count; turn++) {
          const state = (await request(0, path)).body.state as GameState;
          const actor = Number(state.activeSeat.slice(1)) - 1;
          expect(state.round).toBe(round);
          expect(state.activeSeat).toBe("p" + (actor + 1));
          expect(state.phase).toBe("actions");
          const bonus = state.setup.bonusPool.find(
            (b) => !Object.values(state.players).some((p) => p.bonus === b),
          )!;
          const result = await request(
            actor,
            path + "/commands",
            command(revision, { kind: "pass", bonus }),
          );
          expect(result.status).toBe(200);
          expect(result.body.revision).toBe(++revision);
        }
        // Some round rewards need a reply; exercise the actual response endpoint too.
        for (let attempts = 0; attempts < 30; attempts++) {
          const view = (await request(0, path)).body;
          const state = view.state as GameState;
          if (!state.pending.length) {
            expect(state.round).toBe(round + 1);
            break;
          }
          const { seat, action } = chooseMove(state);
          const actor = Number(seat.slice(1)) - 1;
          const result = await request(
            actor,
            path + "/commands",
            command(revision, action),
          );
          expect(result.status).toBe(200);
          expect(result.body.revision).toBe(++revision);
        }
        const views = await Promise.all(
          Array.from({ length: count }, (_, i) => request(i, path)),
        );
        views.forEach((view) => {
          expect(view.body.state.round).toBe(round + 1);
          expect(view.body.state.pending).toEqual([]);
          expect(view.body.state.revision).toBe(revision);
          expect(view.body.state).toEqual(views[0].body.state);
        });
        await Promise.all(
          [...streams.slice(0, count - 1), reconnect].map((s) =>
            s.waitFor(revision),
          ),
        );
      }
      // All clients race with the same revision: only one may commit.
      const race = await Promise.all(
        Array.from({ length: count }, (_, i) =>
          request(
            i,
            path + "/commands",
            command(revision, {
              kind: "setLeech",
              enabled: true,
              maxVpCost: 0,
            }),
          ),
        ),
      );
      expect(race.filter((r) => r.status === 200)).toHaveLength(1);
      expect(
        race.filter(
          (r) => r.status === 409 && r.body.error === "REVISION_CONFLICT",
        ),
      ).toHaveLength(count - 1);
      revision++;
      await reconnect.waitFor(revision);
      const saved = (await request(0, path)).body.state;
      const history = (await request(0, path + "/history")).body;
      expect(history.map((e: { revision: number }) => e.revision)).toEqual(
        Array.from({ length: revision }, (_, i) => i + 1),
      );
      // Recreate the server with a fresh database pool, then reconnect.
      streams.forEach((s) => s.close());
      await app.close();
      const restartedDb = new Pool({
        connectionString: url,
        options: `-c search_path=${schema}`,
      });
      app = createApp(restartedDb);
      try {
        address = await app.listen({ port: 0, host: "127.0.0.1" });
        expect((await request(0, path)).body.state).toEqual(saved);
        expect((await request(count - 1, path + "/history")).body).toEqual(
          history,
        );
        const resumed = stream(address, gameId, actors[count - 1]);
        streams.push(resumed);
        await resumed.waitFor(revision);
        const resumedCommand = command(revision, {
          kind: "setLeech",
          enabled: false,
          maxVpCost: 0,
        });
        expect(
          (await request(count - 1, path + "/commands", resumedCommand)).body
            .revision,
        ).toBe(revision + 1);
        await resumed.waitFor(revision + 1);
      } finally {
        streams.forEach((s) => s.close());
        await app.close();
        await restartedDb.end();
      }
    } finally {
      streams.forEach((s) => s.close());
      await app.close();
    }
  }, 30000);
});
