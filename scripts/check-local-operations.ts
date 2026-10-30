// Local acceptance only: synthetic accounts in an isolated test schema, plus
// a temporary restore database. Never reads or writes the development database.
import { randomUUID } from "node:crypto";
import { get, type IncomingMessage, type ClientRequest } from "node:http";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { resolve, join } from "node:path";
import assert from "node:assert/strict";
import { Pool, migrate } from "../apps/server/src/db/pool";
import { createApp } from "../apps/server/src/app";
import { register, login } from "../apps/server/src/auth/sessions";
import {
  createRoom,
  joinRoom,
  setReady,
  startRoom,
} from "../apps/server/src/rooms/service";
import {
  getGame,
  getReplay,
  submitCommand,
} from "../apps/server/src/games/commands";
import { chooseMove } from "../packages/rules/test/fixtures/players";
import { replayRecord } from "../packages/rules/src/replay";

if (existsSync(".env")) loadEnvFile(".env");
const url = process.env.TEST_DATABASE_URL;
if (!url || url === process.env.DATABASE_URL)
  throw Error("A separate TEST_DATABASE_URL is required");
const schema = "acceptance_" + randomUUID().replaceAll("-", "");
const restoreName = "acceptance_restore_" + randomUUID().replaceAll("-", "");
const parsed = new URL(url);
if (!["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname))
  throw Error("This acceptance script only operates on local PostgreSQL");
const pgBin = process.env.PG_BIN ?? resolve("work/postgres/pgsql/bin");
const executable = (name: string) =>
  join(pgBin, name + (process.platform === "win32" ? ".exe" : ""));
for (const name of ["pg_dump", "pg_restore"])
  if (!existsSync(executable(name)))
    throw Error("Set PG_BIN to a PostgreSQL client tools directory");
const output = resolve("work/acceptance");
await mkdir(output, { recursive: true });
const dump = join(output, "synthetic-test-backup.dump");
const admin = new Pool({ connectionString: url });
const db = new Pool({
  connectionString: url,
  options: `-c search_path=${schema}`,
});
// Simulate distinct clients through our loopback test proxy. Production proxy
// trust and shared-IP budgets remain covered separately by security tests.
const app = createApp(db, "http://127.0.0.1:5173", false, ["127.0.0.1"]);
let created = false,
  restored = false;
let restoreDb: InstanceType<typeof Pool> | undefined;
const streams: {
  request: ClientRequest;
  response?: IncomingMessage;
  revisions: number[];
}[] = [];
const actors: Awaited<ReturnType<typeof login>>[] = [];
const games: string[] = [];
const samples: Record<string, number[]> = { read: [], preview: [], commit: [] };
let requests = 0;
const pgEnv = {
  ...process.env,
  PGHOST: parsed.hostname,
  PGPORT: parsed.port || "5432",
  PGUSER: decodeURIComponent(parsed.username),
  PGPASSWORD: decodeURIComponent(parsed.password),
  PGDATABASE: decodeURIComponent(parsed.pathname.slice(1)),
};
async function pg(name: string, args: string[], database = pgEnv.PGDATABASE) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable(name), args, {
      env: { ...pgEnv, PGDATABASE: database },
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let error = "";
    child.stderr.on("data", (data) => {
      error += data.toString();
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(Error(`${name} failed: ${error}`)),
    );
  });
}
try {
  await admin.query(`CREATE SCHEMA ${schema}`);
  created = true;
  await migrate(db);
  console.log("Preparing 100 synthetic accounts and 25 four-player rooms...");
  for (let i = 0; i < 100; i++) {
    const username = "loadplayer" + i;
    await register(db, { username, password: "synthetic-acceptance-password" });
    actors.push(await login(db, username, "synthetic-acceptance-password"));
  }
  for (let group = 0; group < 25; group++) {
    const members = actors.slice(group * 4, group * 4 + 4);
    const room = await createRoom(db, members[0].user.id, {
      visibility: "public",
      seats: 4,
      setupMode: "standard",
    });
    for (const actor of members.slice(1))
      await joinRoom(db, actor.user.id, room.id);
    for (const actor of members)
      await setReady(db, actor.user.id, room.id, true);
    games.push((await startRoom(db, members[0].user.id, room.id)).gameId);
  }
  const address = await app.listen({ host: "127.0.0.1", port: 0 });
  const read = async (i: number, suffix = "", body?: unknown) => {
    const start = performance.now();
    const response = await fetch(
      `${address}/api/games/${games[Math.floor(i / 4)]}${suffix}`,
      {
        method: body === undefined ? "GET" : "POST",
        headers: {
          origin: "http://127.0.0.1:5173",
          cookie: "session=" + actors[i].session,
          "x-csrf-token": actors[i].csrf,
          "content-type": "application/json",
          "x-forwarded-for": `198.18.0.${i + 1}`,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      },
    );
    requests++;
    assert.equal(
      response.status,
      200,
      `HTTP ${response.status} for ${suffix || "snapshot"}`,
    );
    const data = await response.json();
    samples[
      suffix === "/commands"
        ? "commit"
        : suffix === "/preview"
          ? "preview"
          : "read"
    ].push(performance.now() - start);
    return data;
  };
  const start = performance.now();
  await Promise.all(
    actors.map(
      (actor, i) =>
        new Promise<void>((resolve, reject) => {
          const stream: (typeof streams)[number] = {
            request: undefined as unknown as ClientRequest,
            revisions: [],
          };
          const timer = setTimeout(
            () => reject(Error("SSE connection timeout")),
            10000,
          );
          stream.request = get(
            `${address}/api/games/${games[Math.floor(i / 4)]}/events`,
            {
              headers: {
                cookie: "session=" + actor.session,
                "x-forwarded-for": `198.18.0.${i + 1}`,
              },
            },
            (response) => {
              stream.response = response;
              if (response.statusCode !== 200) {
                clearTimeout(timer);
                response.resume();
                reject(Error("SSE rejected"));
                return;
              }
              let buffer = "";
              response.setEncoding("utf8");
              response.on("data", (chunk: string) => {
                buffer += chunk;
                let end: number;
                while ((end = buffer.indexOf("\n\n")) >= 0) {
                  const frame = buffer.slice(0, end);
                  buffer = buffer.slice(end + 2);
                  if (frame.startsWith("data: ")) {
                    stream.revisions.push(JSON.parse(frame.slice(6)).revision);
                    clearTimeout(timer);
                    resolve();
                  }
                }
              });
              response.on("error", (error) => {
                clearTimeout(timer);
                reject(error);
              });
            },
          );
          stream.request.on("error", (error) => {
            clearTimeout(timer);
            reject(error);
          });
          streams.push(stream);
        }),
    ),
  );
  const connectMs = performance.now() - start;
  console.log(
    "100 SSE clients connected; exercising concurrent snapshots and commands...",
  );
  for (let burst = 0; burst < 3; burst++)
    await Promise.all(actors.map((_, i) => read(i)));
  await Promise.all(
    games.map(async (gameId, group) => {
      const { state } = await getGame(db, actors[group * 4].user.id, gameId);
      const { seat, action } = chooseMove(state);
      const actor = group * 4 + Number(seat.slice(1)) - 1;
      const command = { commandId: randomUUID(), expectedRevision: 0, action };
      await read(actor, "/preview", command);
      await read(actor, "/commands", command);
    }),
  );
  await Promise.all(
    actors.map(async (_, i) => assert.equal((await read(i)).state.revision, 1)),
  );
  assert.equal(
    streams.filter((stream) => stream.revisions.includes(1)).length,
    100,
  );

  console.log(
    "Backing up the synthetic schema and restoring into a fresh temporary database...",
  );
  const saved = await getGame(db, actors[0].user.id, games[0]);
  await pg("pg_dump", [
    "--format=custom",
    "--no-owner",
    "--schema=" + schema,
    "--file=" + dump,
  ]);
  await admin.query(`CREATE DATABASE ${restoreName}`);
  restored = true;
  await pg(
    "pg_restore",
    [
      "--no-owner",
      "--no-privileges",
      "--exit-on-error",
      "--dbname=" + restoreName,
      dump,
    ],
    restoreName,
  );
  const restoreUrl = new URL(url);
  restoreUrl.pathname = "/" + restoreName;
  restoreDb = new Pool({
    connectionString: restoreUrl.toString(),
    options: `-c search_path=${schema}`,
  });
  assert.equal(
    (await restoreDb.query("SELECT count(*)::int AS n FROM accounts")).rows[0]
      .n,
    100,
  );
  assert.equal(
    (await restoreDb.query("SELECT count(*)::int AS n FROM games")).rows[0].n,
    25,
  );
  const recovered = await getGame(restoreDb, actors[0].user.id, games[0]);
  // getGame projects the running clock at request time, so its remaining time
  // must change during backup/restore. Compare persisted values separately.
  const { clock: savedClock, ...savedStable } = saved;
  const { clock: recoveredClock, ...recoveredStable } = recovered;
  assert.deepEqual(recoveredStable, savedStable);
  assert.deepEqual(
    (await restoreDb.query("SELECT clock FROM games WHERE id=$1", [games[0]]))
      .rows,
    (await db.query("SELECT clock FROM games WHERE id=$1", [games[0]])).rows,
  );
  assert.deepEqual(
    replayRecord(await getReplay(restoreDb, actors[0].user.id, games[0])).state,
    recovered.state,
  );
  const next = chooseMove(recovered.state);
  const actor = actors[Number(next.seat.slice(1)) - 1];
  await submitCommand(restoreDb, actor.user.id, games[0], {
    commandId: randomUUID(),
    expectedRevision: 1,
    action: next.action,
  });
  assert.equal(
    (await getGame(restoreDb, actor.user.id, games[0])).state.revision,
    2,
  );
  assert.equal((await getGame(db, actor.user.id, games[0])).state.revision, 1);
  const latency = Object.fromEntries(
    Object.entries(samples).map(([key, values]) => {
      values.sort((a, b) => a - b);
      return [
        key,
        {
          count: values.length,
          p50Ms: +values[Math.floor(values.length * 0.5)].toFixed(1),
          p95Ms:
            +values[
              Math.min(values.length - 1, Math.floor(values.length * 0.95))
            ].toFixed(1),
          maxMs: +values.at(-1)!.toFixed(1),
        },
      ];
    }),
  );
  const report = {
    measuredAt: new Date().toISOString(),
    scope: "local synthetic burst test; not sustained production capacity",
    clients: 100,
    rooms: 25,
    httpRequests: requests,
    httpErrors: 0,
    sseRecipientsUpdated: 100,
    sseConnectMs: +connectMs.toFixed(1),
    latency,
    backupRestore: {
      accounts: 100,
      games: 25,
      stateMatched: true,
      replayMatched: true,
      resumedAtRevision: 2,
      sourceUnchanged: true,
    },
  };
  await writeFile(
    join(output, "local-operations.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  for (const stream of streams) {
    stream.response?.destroy();
    stream.request.destroy();
  }
  await app.close();
  await restoreDb?.end();
  // Only drop names generated by this invocation, after a successful create.
  if (restored && /^acceptance_restore_[a-f0-9]{32}$/.test(restoreName))
    await admin.query(`DROP DATABASE ${restoreName}`);
  await db.end();
  if (created && /^acceptance_[a-f0-9]{32}$/.test(schema))
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
}
