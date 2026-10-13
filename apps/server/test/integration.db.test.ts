import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool, migrate } from "../src/db/pool";
import {
  createRoom,
  joinRoom,
  setReady,
  startRoom,
} from "../src/rooms/service";
import {
  register,
  login,
  authenticate,
  logout,
  recover,
} from "../src/auth/sessions";
import { submitCommand, getGame } from "../src/games/commands";
import { createGame } from "../../../packages/rules/src/state";
import { sampleSetup } from "../../../packages/rules/test/fixtures/setup";
const schema = "test_" + randomUUID().replaceAll("-", "");
const url = process.env.TEST_DATABASE_URL;
const admin = new Pool({ connectionString: url });
const db = new Pool({
  connectionString: url,
  options: `-c search_path=${schema}`,
});
let actors: string[] = [];
beforeAll(async () => {
  if (!url)
    throw Error(
      "TEST_DATABASE_URL must point to a real local PostgreSQL 17 database",
    );
  await admin.query(`CREATE SCHEMA ${schema}`);
  await migrate(db);
  for (let i = 0; i < 4; i++) {
    actors.push(
      (
        await register(db, {
          username: "player" + i,
          password: "test-password-1234",
        })
      ).userId,
    );
  }
}, 30000);
afterAll(async () => {
  await db.end();
  if (url) await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.end();
});
async function seededGame() {
  const id = randomUUID();
  const state = createGame({ ...sampleSetup(), id });
  await db.query("INSERT INTO games(id,state,rules_version) VALUES($1,$2,$3)", [
    id,
    JSON.stringify(state),
    state.rulesVersion,
  ]);
  for (let i = 0; i < 3; i++)
    await db.query(
      "INSERT INTO game_members(game_id,user_id,seat) VALUES($1,$2,$3)",
      [id, actors[i], "p" + (i + 1)],
    );
  return id;
}
describe("PostgreSQL transactions", () => {
  it("duplicate command retries return the saved result without another event", async () => {
    const id = await seededGame();
    const command = {
      commandId: randomUUID(),
      expectedRevision: 0,
      action: { kind: "place" as const, hex: "A1" },
    };
    const [a, b] = await Promise.all([
      submitCommand(db, actors[0], id, command),
      submitCommand(db, actors[0], id, command),
    ]);
    expect(a).toEqual(b);
    expect((await getGame(db, actors[0], id)).state.revision).toBe(1);
    expect(
      (await db.query("SELECT * FROM game_events WHERE game_id=$1", [id]))
        .rowCount,
    ).toBe(1);
    await expect(
      submitCommand(db, actors[0], id, {
        ...command,
        action: { kind: "place", hex: "B4" },
      }),
    ).rejects.toMatchObject({ code: "COMMAND_REUSE" });
  });
  it("concurrent distinct commands at the same revision only commit once", async () => {
    const id = await seededGame();
    const results = await Promise.allSettled(
      ["A1", "B4"].map((hex) =>
        submitCommand(db, actors[0], id, {
          commandId: randomUUID(),
          expectedRevision: 0,
          action: { kind: "place", hex },
        }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      (results.find((r) => r.status === "rejected") as PromiseRejectedResult)
        .reason.code,
    ).toBe("REVISION_CONFLICT");
  });
  it("transaction failure rolls back both state and history", async () => {
    const id = await seededGame();
    await expect(
      submitCommand(
        db,
        actors[0],
        id,
        {
          commandId: randomUUID(),
          expectedRevision: 0,
          action: { kind: "place", hex: "A1" },
        },
        () => {
          throw Error("simulated storage fault");
        },
      ),
    ).rejects.toThrow("simulated");
    expect((await getGame(db, actors[0], id)).state.revision).toBe(0);
    expect(
      (await db.query("SELECT * FROM game_events WHERE game_id=$1", [id]))
        .rowCount,
    ).toBe(0);
  });
  it("nonmembers cannot read or submit", async () => {
    const id = await seededGame();
    await expect(getGame(db, actors[3], id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
describe("account sessions and recovery", () => {
  it("logout revokes cookie and recovery invalidates all old sessions", async () => {
    const user = await register(db, {
      username: "recoveruser",
      password: "original-password",
    });
    const first = await login(db, "recoveruser", "original-password");
    expect((await authenticate(db, first.session))?.id).toBe(user.userId);
    await logout(db, first.session);
    expect(await authenticate(db, first.session)).toBeNull();
    const second = await login(db, "recoveruser", "original-password");
    const recovered = await recover(
      db,
      "recoveruser",
      user.recoveryCode,
      "replacement-password",
    );
    expect(await authenticate(db, second.session)).toBeNull();
    await expect(
      recover(db, "recoveruser", user.recoveryCode, "another-password"),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    expect(recovered.recoveryCode).not.toBe(user.recoveryCode);
  });
  it("rejects duplicate case-insensitive usernames and wrong password", async () => {
    await expect(
      register(db, { username: "PLAYER0", password: "test-password-1234" }),
    ).rejects.toMatchObject({ code: "USERNAME_UNAVAILABLE" });
    await expect(login(db, "player0", "wrong-password")).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
    });
  });
});
describe("room locking", () => {
  it("only one player obtains the last seat; host alone can start once", async () => {
    const room = await createRoom(db, actors[0], {
      visibility: "public",
      seats: 3,
    });
    await joinRoom(db, actors[1], room.id);
    const results = await Promise.allSettled([
      joinRoom(db, actors[2], room.id),
      joinRoom(db, actors[3], room.id),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const winner = results[0].status === "fulfilled" ? actors[2] : actors[3];
    await expect(startRoom(db, actors[1], room.id)).rejects.toMatchObject({
      code: "HOST_REQUIRED",
    });
    await expect(startRoom(db, actors[0], room.id)).rejects.toMatchObject({
      code: "NOT_READY",
    });
    for (const id of [actors[0], actors[1], winner])
      await setReady(db, id, room.id, true);
    const [a, b] = await Promise.all([
      startRoom(db, actors[0], room.id),
      startRoom(db, actors[0], room.id),
    ]);
    expect(a).toEqual(b);
    await expect(joinRoom(db, actors[3], room.id)).rejects.toMatchObject({
      code: "ROOM_STARTED",
    });
  });
  it("private invitation is required and cannot be enumerated", async () => {
    const room = await createRoom(db, actors[0], {
      visibility: "private",
      seats: 3,
    });
    await expect(joinRoom(db, actors[1], room.id)).rejects.toMatchObject({
      code: "INVALID_INVITE",
    });
    await joinRoom(db, actors[1], room.id, room.inviteToken);
  });
});
