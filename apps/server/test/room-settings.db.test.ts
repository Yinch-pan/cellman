import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool, migrate } from "../src/db/pool";
import { register, login } from "../src/auth/sessions";
import { createApp } from "../src/app";
import {
  createRoom,
  roomView,
  updateRoom,
  manageRoom,
  joinRoom,
  setReady,
  startRoom,
  leaveRoom,
} from "../src/rooms/service";
import { getGame, getReplay, submitCommand } from "../src/games/commands";
import { requestUndo, voteUndo } from "../src/games/undo";
import { playerStats, siteStats } from "../src/games/stats";
import {
  gameSettingsSchema,
  type RoomInput,
} from "../../../packages/contracts/src/room";
import { replayRecord } from "../../../packages/rules/src/replay";
import { draftOptions } from "../../../packages/rules/src/setup";
const url = process.env.TEST_DATABASE_URL,
  schema = "settings_" + randomUUID().replaceAll("-", "");
const admin = new Pool({ connectionString: url }),
  db = new Pool({ connectionString: url, options: `-c search_path=${schema}` }),
  app = createApp(db);
const actors: string[] = [];
let created = false,
  session: any;
beforeAll(async () => {
  if (!url || url === process.env.DATABASE_URL)
    throw Error("Separate test database required");
  await admin.query(`CREATE SCHEMA ${schema}`);
  created = true;
  await migrate(db);
  for (let i = 0; i < 5; i++)
    actors.push(
      (
        await register(db, {
          username: "setting" + i,
          password: "settings-test-password",
        })
      ).userId,
    );
  session = await login(db, "setting0", "settings-test-password");
  await app.ready();
});
afterAll(async () => {
  await app.close();
  await db.end();
  if (created) await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
});
const base: RoomInput = {
  visibility: "public",
  seats: 3,
  setupMode: "standard",
};
async function full(input: RoomInput = base) {
  const r = await createRoom(db, actors[0], input);
  for (const a of actors.slice(1, input.seats))
    await joinRoom(db, a, r.id, r.inviteToken);
  for (const a of actors.slice(0, input.seats))
    await setReady(db, a, r.id, true);
  return roomView(db, actors[0], r.id);
}
async function game(input: RoomInput = base) {
  const r = await full(input);
  return {
    room: r,
    id: (await startRoom(db, actors[0], r.id, r.settingsRevision)).gameId,
  };
}
async function move(id: string) {
  const { state } = await getGame(db, actors[0], id);
  const actor = actors[Number(state.activeSeat.slice(1)) - 1];
  const cmd = {
    commandId: randomUUID(),
    expectedRevision: state.revision,
    action: { kind: "chooseSetup" as const, offer: state.revision },
  };
  await submitCommand(db, actor, id, cmd);
  return { actor, cmd };
}
it("host-only edits persist all options, reset everyone and reject stale readiness or edits", async () => {
  const r = await full();
  const input = {
    ...base,
    seats: 4,
    settings: gameSettingsSchema.parse({
      time: { mode: "bank", minutes: 30 },
      undo: "disabled",
      countStats: false,
    }),
  };
  await expect(
    updateRoom(db, actors[1], r.id, input, r.settingsRevision),
  ).rejects.toMatchObject({ code: "HOST_REQUIRED" });
  const changed = await updateRoom(
    db,
    actors[0],
    r.id,
    input,
    r.settingsRevision,
  );
  expect(changed.capacity).toBe(4);
  expect(changed.settings).toEqual(input.settings);
  expect(changed.seats.every((s: any) => !s.ready)).toBe(true);
  await expect(
    setReady(db, actors[1], r.id, true, r.settingsRevision),
  ).rejects.toMatchObject({ code: "ROOM_SETTINGS_CHANGED" });
  await expect(
    updateRoom(db, actors[0], r.id, base, r.settingsRevision),
  ).rejects.toMatchObject({ code: "ROOM_SETTINGS_CHANGED" });
  await expect(startRoom(db, actors[0], r.id)).rejects.toMatchObject({
    code: "NOT_READY",
  });
});
it("capacity cannot evict joined players and setup constraints are server-enforced", async () => {
  const r = await full({ ...base, seats: 4 });
  await expect(
    updateRoom(db, actors[0], r.id, base, r.settingsRevision),
  ).rejects.toMatchObject({ code: "ROOM_TOO_SMALL" });
  await expect(
    updateRoom(
      db,
      actors[0],
      r.id,
      { ...base, seats: 4, setupMode: "training" },
      r.settingsRevision,
    ),
  ).rejects.toThrow();
  const same = await roomView(db, actors[0], r.id);
  expect(same.settingsRevision).toBe(r.settingsRevision);
  expect(same.seats.every((s: any) => s.ready)).toBe(true);
});
it("seat order is applied and custom seeds reproduce setup while still counting statistics", async () => {
  const input = {
    ...base,
    settings: gameSettingsSchema.parse({
      seatOrder: "seated",
      seed: "repeat-123",
    }),
  };
  const r = await full(input),
    ids = [actors[2], actors[0], actors[1]];
  const reordered = await manageRoom(
    db,
    actors[0],
    r.id,
    { kind: "reorder", userIds: ids },
    r.settingsRevision,
  );
  expect(reordered.seats.map((s: any) => s.userId)).toEqual(ids);
  for (const a of ids) await setReady(db, a, r.id, true);
  const id = (await startRoom(db, actors[0], r.id)).gameId,
    one = await getGame(db, actors[2], id),
    two = await getGame(db, actors[0], (await game(input)).id);
  expect(one.seat).toBe("p1");
  expect(one.state.turnOrder).toEqual(["p1", "p2", "p3"]);
  expect(one.state.setup.offers).toEqual(two.state.setup.offers);
  expect(one.state.setup.roundTiles).toEqual(two.state.setup.roundTiles);
  expect(one.settings.countStats).toBe(true);
  await expect(
    updateRoom(db, actors[0], r.id, base, reordered.settingsRevision),
  ).rejects.toMatchObject({ code: "ROOM_STARTED" });
});
it("all completed modes count, including legacy opt-outs; migration preserves game state", async () => {
  const before = (await playerStats(db, actors[0])).count;
  for (const input of [
    { ...base, setupMode: "training" as const },
    {
      ...base,
      settings: {
        seed: "custom-stats",
        seatOrder: "seated" as const,
        countStats: false,
      },
    },
  ]) {
    const { id } = await game(input);
    const loaded = await getGame(db, actors[0], id);
    expect(loaded.settings.countStats).toBe(true);
    expect(
      (await db.query("SELECT stats_eligible FROM games WHERE id=$1", [id]))
        .rows[0].stats_eligible,
    ).toBe(true);
    const state = {
      ...loaded.state,
      status: "finished",
      scores: Object.keys(loaded.state.players).map((seat, i) => ({
        seat,
        total: 100 - i * 10,
        items: [],
      })),
    };
    await db.query(
      "UPDATE games SET state=$1,stats_eligible=false,settings=jsonb_set(settings,'{countStats}','false') WHERE id=$2",
      [JSON.stringify(state), id],
    );
    expect((await getGame(db, actors[0], id)).settings.countStats).toBe(true);
    expect((await getReplay(db, actors[0], id)).settings.countStats).toBe(true);
    await migrate(db);
    const stored = (
      await db.query(
        "SELECT state,stats_eligible,settings FROM games WHERE id=$1",
        [id],
      )
    ).rows[0];
    expect(stored.state).toEqual(state);
    expect(stored.stats_eligible).toBe(true);
    expect(stored.settings.countStats).toBe(true);
  }
  expect((await playerStats(db, actors[0])).count).toBe(before + 2);
  expect((await siteStats(db, 3)).count).toBe(2);
});
it("private invitation rotation revokes old links without removing members; transfer and removal are host-only", async () => {
  const r = await createRoom(db, actors[0], { ...base, visibility: "private" });
  await joinRoom(db, actors[1], r.id, r.inviteToken);
  const v = await roomView(db, actors[0], r.id),
    rotated = await manageRoom(
      db,
      actors[0],
      r.id,
      { kind: "invite" },
      v.settingsRevision,
    );
  await expect(
    joinRoom(db, actors[2], r.id, r.inviteToken),
  ).rejects.toMatchObject({ code: "INVALID_INVITE" });
  const joined = await joinRoom(db, actors[2], r.id, rotated.inviteToken);
  const transferred = await manageRoom(
    db,
    actors[0],
    r.id,
    { kind: "transfer", userId: actors[1] },
    joined.settingsRevision,
  );
  await expect(
    manageRoom(
      db,
      actors[0],
      r.id,
      { kind: "kick", userId: actors[2] },
      transferred.settingsRevision,
    ),
  ).rejects.toMatchObject({ code: "HOST_REQUIRED" });
  await manageRoom(
    db,
    actors[1],
    r.id,
    { kind: "kick", userId: actors[2] },
    transferred.settingsRevision,
  );
  await expect(roomView(db, actors[2], r.id)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  await leaveRoom(db, actors[1], r.id);
  expect((await roomView(db, actors[0], r.id)).hostId).toBe(actors[0]);
});
it("racing start and settings edit produce either the confirmed old game or an unready edited room", async () => {
  const r = await full();
  const outcomes = await Promise.allSettled([
    startRoom(db, actors[0], r.id, r.settingsRevision),
    updateRoom(db, actors[0], r.id, { ...base, seats: 4 }, r.settingsRevision),
  ]);
  expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const current = await roomView(db, actors[0], r.id);
  if (current.gameId) {
    expect(current.capacity).toBe(3);
    expect(
      Object.keys((await getGame(db, actors[0], current.gameId)).state.players),
    ).toHaveLength(3);
  } else {
    expect(current.capacity).toBe(4);
    expect(current.seats.every((s: any) => !s.ready)).toBe(true);
  }
});
it("disabled undo is enforced by API service while replay stays deterministic", async () => {
  const { id } = await game({
    ...base,
    settings: gameSettingsSchema.parse({ undo: "disabled" }),
  });
  const { actor } = await move(id);
  await expect(
    requestUndo(db, actor, id, {
      requestId: randomUUID(),
      expectedRevision: 1,
      targetRevision: 0,
      reason: "test",
    }),
  ).rejects.toMatchObject({ code: "UNDO_DISABLED" });
  expect(replayRecord(await getReplay(db, actor, id)).state).toEqual(
    (await getGame(db, actor, id)).state,
  );
});
it("persisted clocks survive reads/retries and undo pause, rejection, and unanimous restore", async () => {
  const { id } = await game({
    ...base,
    settings: gameSettingsSchema.parse({ time: { mode: "bank", minutes: 15 } }),
  });
  const before = await getGame(db, actors[0], id),
    seat = before.state.activeSeat;
  await db.query(
    "UPDATE games SET clock=jsonb_set(clock,'{at}',to_jsonb($1::bigint)) WHERE id=$2",
    [Date.now() - 5000, id],
  );
  const { actor, cmd } = await move(id),
    after = await getGame(db, actor, id);
  expect(after.clock!.remaining[seat]).toBeLessThanOrEqual(895000);
  const saved = (await db.query("SELECT clock FROM games WHERE id=$1", [id]))
    .rows[0].clock;
  await submitCommand(db, actor, id, cmd);
  expect(
    (await db.query("SELECT clock FROM games WHERE id=$1", [id])).rows[0].clock,
  ).toEqual(saved);
  const requestId = randomUUID();
  await requestUndo(db, actor, id, {
    requestId,
    expectedRevision: 1,
    targetRevision: 0,
    reason: "test pause",
  });
  const paused = (await getGame(db, actor, id)).clock!;
  expect(paused.paused).toBe(true);
  await db.query(
    "UPDATE games SET clock=jsonb_set(clock,'{at}',to_jsonb($1::bigint)) WHERE id=$2",
    [Date.now() - 999999, id],
  );
  expect((await getGame(db, actor, id)).clock!.remaining).toEqual(
    paused.remaining,
  );
  await voteUndo(
    db,
    actors.find((a) => a !== actor)!,
    id,
    { requestId, decision: "reject" },
  );
  expect((await getGame(db, actor, id)).clock!.paused).toBe(false);
  const again = randomUUID();
  await requestUndo(db, actor, id, {
    requestId: again,
    expectedRevision: 1,
    targetRevision: 0,
    reason: "restore",
  });
  for (const a of actors.slice(0, 3).filter((a) => a !== actor))
    await voteUndo(db, a, id, { requestId: again, decision: "approve" });
  const restored = await getGame(db, actor, id);
  expect(restored.state.revision).toBe(2);
  expect(restored.clock!.running).toEqual([seat]);
  expect(restored.clock!.remaining[seat]).toBeLessThanOrEqual(
    after.clock!.remaining[seat],
  );
  expect(replayRecord(await getReplay(db, actor, id)).state).toEqual(
    restored.state,
  );
});
it("expired clock is visible and valid moves remain possible; invalid commands cannot reset it", async () => {
  const { id } = await game({
    ...base,
    settings: gameSettingsSchema.parse({ time: { mode: "async", hours: 12 } }),
  });
  await db.query(
    "UPDATE games SET clock=jsonb_set(clock,'{at}',to_jsonb($1::bigint)) WHERE id=$2",
    [Date.now() - 50000000, id],
  );
  const s = await getGame(db, actors[0], id);
  expect(s.clock!.overdue).toEqual([s.state.activeSeat]);
  const actor = actors[Number(s.state.activeSeat.slice(1)) - 1];
  await expect(
    submitCommand(db, actor, id, {
      commandId: randomUUID(),
      expectedRevision: 0,
      action: { kind: "chooseSetup", offer: 99 },
    }),
  ).rejects.toThrow();
  expect(
    (await getGame(db, actor, id)).clock!.remaining[s.state.activeSeat],
  ).toBeLessThanOrEqual(s.clock!.remaining[s.state.activeSeat]);
  await move(id);
  expect((await getGame(db, actor, id)).state.revision).toBe(1);
});
it("HTTP settings endpoints validate input, protect CSRF and return game settings/clock", async () => {
  const r = await createRoom(db, actors[0], base),
    headers = {
      origin: "http://127.0.0.1:5173",
      cookie: "session=" + session.session,
      "x-csrf-token": session.csrf,
    };
  const payload = {
    ...base,
    expectedRevision: r.settingsRevision,
    settings: { time: { mode: "bank", minutes: 30 } },
  };
  expect(
    (
      await app.inject({
        method: "POST",
        url: `/api/rooms/${r.id}/settings`,
        headers,
        payload,
      })
    ).statusCode,
  ).toBe(200);
  expect(
    (
      await app.inject({
        method: "POST",
        url: `/api/rooms/${r.id}/settings`,
        headers,
        payload,
      })
    ).statusCode,
  ).toBe(409);
  expect(
    (
      await app.inject({
        method: "POST",
        url: `/api/rooms/${r.id}/settings`,
        headers,
        payload: {
          ...payload,
          settings: { time: { mode: "bank", minutes: 0 } },
        },
      })
    ).statusCode,
  ).toBe(400);
  expect(
    (
      await app.inject({
        method: "POST",
        url: `/api/rooms/${r.id}/manage`,
        headers: { ...headers, "x-csrf-token": "bad" },
        payload: { expectedRevision: 1, action: { kind: "invite" } },
      })
    ).statusCode,
  ).toBe(403);
  const { id } = await game({
    ...base,
    settings: gameSettingsSchema.parse({ time: { mode: "bank", minutes: 30 } }),
  });
  const result = await app.inject({ url: `/api/games/${id}`, headers });
  expect(result.json().settings.time).toEqual({ mode: "bank", minutes: 30 });
  expect(result.json().clock.running).toHaveLength(1);
  const listing = await app.inject({ url: "/api/rooms", headers });
  expect(listing.statusCode).toBe(200);
  expect(
    listing.json().find((entry: { id: string }) => entry.id === r.id),
  ).toMatchObject({
    setupMode: "standard",
    capacity: 3,
    settings: { time: { mode: "bank", minutes: 30 }, countStats: true },
  });
});
it("snake picks persist with one time increment, reject invalid choices and replay after retries", async () => {
  const { id } = await game({
    ...base,
    setupMode: "snake-forward",
    settings: {
      time: { mode: "paced", movesPerDay: 4, activeStartUtc: 2 },
      seatOrder: "seated",
    },
  });
  let s = await getGame(db, actors[0], id);
  expect(s.state.activeSeat).toBe("p1");
  const saved = (await db.query("SELECT clock FROM games WHERE id=$1", [id]))
    .rows[0].clock;
  saved.remaining.p1 = 8 * 3600000;
  saved.at = Date.now() - 3600000;
  await db.query("UPDATE games SET clock=$1 WHERE id=$2", [
    JSON.stringify(saved),
    id,
  ]);
  const cmd = {
    commandId: randomUUID(),
    expectedRevision: 0,
    action: {
      kind: "draftPick" as const,
      category: "palace" as const,
      option: draftOptions(s.state, "p1", "palace")[0],
    },
  };
  await submitCommand(db, actors[0], id, cmd);
  const clock = (await db.query("SELECT clock FROM games WHERE id=$1", [id]))
    .rows[0].clock;
  expect(clock.remaining.p1).toBeGreaterThan(12.99 * 3600000);
  expect(clock.remaining.p1).toBeLessThanOrEqual(13 * 3600000);
  await submitCommand(db, actors[0], id, cmd);
  expect(
    (await db.query("SELECT clock FROM games WHERE id=$1", [id])).rows[0].clock,
  ).toEqual(clock);
  await expect(
    submitCommand(db, actors[1], id, {
      ...cmd,
      commandId: randomUUID(),
      expectedRevision: 1,
    }),
  ).rejects.toMatchObject({ code: "SETUP_UNAVAILABLE" });
  expect(
    (await db.query("SELECT clock FROM games WHERE id=$1", [id])).rows[0].clock,
  ).toEqual(clock);
  for (let i = 1; i < 12; i++) {
    s = await getGame(db, actors[0], id);
    const seat = s.state.activeSeat,
      category = (["faction", "native", "palace", "bonus"] as const).find(
        (c) => draftOptions(s.state, seat, c).length,
      )!;
    await submitCommand(db, actors[Number(seat.slice(1)) - 1], id, {
      commandId: randomUUID(),
      expectedRevision: i,
      action: {
        kind: "draftPick",
        category,
        option: draftOptions(s.state, seat, category)[0],
      },
    });
  }
  s = await getGame(db, actors[0], id);
  expect(s.state.phase).toBe("placement");
  expect(s.settings.countStats).toBe(true);
  expect(replayRecord(await getReplay(db, actors[0], id)).state).toEqual(
    s.state,
  );
});
it("waiting legacy rooms migrate once and reset readiness while running games retain their clocks", async () => {
  const room = await full(base),
    running = await game({
      ...base,
      settings: { time: { mode: "bank", minutes: 30 } },
    });
  const before = (
    await db.query("SELECT state,clock FROM games WHERE id=$1", [running.id])
  ).rows[0];
  await migrate(db);
  const updated = await roomView(db, actors[0], room.id);
  expect(updated.setupMode).toBe("snake-reverse");
  expect(updated.settings.time).toMatchObject({
    mode: "incremental",
    initialHours: 72,
    incrementHours: 24,
    maximumHours: 72,
  });
  expect(updated.seats.every((s: any) => !s.ready)).toBe(true);
  await migrate(db);
  expect((await roomView(db, actors[0], room.id)).settingsRevision).toBe(
    updated.settingsRevision,
  );
  expect(
    (await db.query("SELECT state,clock FROM games WHERE id=$1", [running.id]))
      .rows[0],
  ).toEqual(before);
});
it("new rooms default to 3 days plus 1 capped at 3, persist settings, and do not credit duplicate submissions", async () => {
  const { id } = await game({
    visibility: "private",
    seats: 3,
    setupMode: "snake-forward",
  });
  const before = await getGame(db, actors[0], id),
    day = 86400000;
  expect(before.settings.time).toEqual({
    mode: "incremental",
    initialHours: 72,
    incrementHours: 24,
    maximumHours: 72,
  });
  const seat = before.state.activeSeat,
    actor = actors[Number(seat.slice(1)) - 1];
  const clock = (await db.query("SELECT clock FROM games WHERE id=$1", [id]))
    .rows[0].clock;
  expect(clock.remaining[seat]).toBe(3 * day);
  clock.at = Date.now() - 1.5 * day;
  await db.query("UPDATE games SET clock=$2 WHERE id=$1", [
    id,
    JSON.stringify(clock),
  ]);
  const command = {
    commandId: randomUUID(),
    expectedRevision: 0,
    action: {
      kind: "draftPick" as const,
      category: "faction" as const,
      option: draftOptions(before.state, seat, "faction")[0],
    },
  };
  await submitCommand(db, actor, id, command);
  const after = (await db.query("SELECT clock FROM games WHERE id=$1", [id]))
    .rows[0].clock;
  expect(after.remaining[seat]).toBeGreaterThan(2.49 * day);
  expect(after.remaining[seat]).toBeLessThanOrEqual(2.5 * day);
  await submitCommand(db, actor, id, command);
  expect(
    (await db.query("SELECT clock FROM games WHERE id=$1", [id])).rows[0].clock,
  ).toEqual(after);
  expect(replayRecord(await getReplay(db, actor, id)).state).toEqual(
    (await getGame(db, actor, id)).state,
  );
});
it("waiting paced rooms move to explicit time once, while active paced clocks keep their settings", async () => {
  const input: RoomInput = {
    visibility: "public",
    seats: 3,
    setupMode: "snake-reverse",
    settings: { time: { mode: "paced", movesPerDay: 12 } },
  };
  const waiting = await full(input),
    running = await game(input);
  const before = (
    await db.query("SELECT settings,clock,state FROM games WHERE id=$1", [
      running.id,
    ])
  ).rows[0];
  await migrate(db);
  const after = await roomView(db, actors[0], waiting.id);
  expect(after.settings.time).toMatchObject({
    mode: "incremental",
    initialHours: 72,
    incrementHours: 24,
    maximumHours: 72,
  });
  expect(after.settingsRevision).toBe(waiting.settingsRevision + 1);
  expect(after.seats.every((seat: any) => !seat.ready)).toBe(true);
  await migrate(db);
  expect((await roomView(db, actors[0], waiting.id)).settingsRevision).toBe(
    after.settingsRevision,
  );
  expect(
    (
      await db.query("SELECT settings,clock,state FROM games WHERE id=$1", [
        running.id,
      ])
    ).rows[0],
  ).toEqual(before);
});
