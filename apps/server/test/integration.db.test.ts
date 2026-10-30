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
import { queueChoice } from "../../../packages/rules/src/responses";
import { actionState } from "../../../packages/rules/test/fixtures/actions";
import { replayGame } from "../../../packages/rules/src/replay";
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
  it("persists staged passing and retries bonus coins without double payment", async () => {
    const id = await seededGame();
    const state = actionState();
    state.setup.id = id;
    state.shared.bonusCoins.bigbuilding = 2;
    await db.query("UPDATE games SET state=$2 WHERE id=$1", [
      id,
      JSON.stringify(state),
    ]);
    await submitCommand(db, actors[0], id, {
      commandId: randomUUID(),
      expectedRevision: 0,
      action: { kind: "pass", deferBonus: true },
    });
    let current = (await getGame(db, actors[0], id)).state;
    expect(current.activeSeat).toBe("p1");
    const bonus = {
      commandId: randomUUID(),
      expectedRevision: 1,
      action: {
        kind: "respond" as const,
        choiceId: current.pending.find((c) => c.kind === "bonus")!.id,
        option: "bigbuilding",
      },
    };
    const [a, b] = await Promise.all([
      submitCommand(db, actors[0], id, bonus),
      submitCommand(db, actors[0], id, bonus),
    ]);
    expect(a).toEqual(b);
    current = (await getGame(db, actors[0], id)).state;
    expect(current.players.p1.resources.coins).toBe(
      state.players.p1.resources.coins + 2,
    );
    expect(current.activeSeat).toBe("p1");
    await submitCommand(db, actors[0], id, {
      commandId: randomUUID(),
      expectedRevision: 2,
      action: {
        kind: "respond",
        choiceId: current.pending.find((c) => c.kind === "passFinish")!.id,
        option: "finish",
      },
    });
    current = (await getGame(db, actors[1], id)).state;
    expect(current.activeSeat).toBe("p2");
    expect(current.revision).toBe(3);
    expect(current.passOrder).toEqual(["p1"]);
    expect(
      (await db.query("SELECT * FROM game_events WHERE game_id=$1", [id]))
        .rowCount,
    ).toBe(3);
  });
  it("publishes a palace before leech and persists a retried ability choice once", async () => {
    const id = await seededGame();
    const state = actionState();
    state.setup.id = id;
    state.board.buildings.A1.kind = "guild";
    state.players.p1.resources.tools = 8;
    state.shared.palaces = ["engineering-palace"];
    await db.query("UPDATE games SET state=$2 WHERE id=$1", [
      id,
      JSON.stringify(state),
    ]);
    const upgrade = {
      commandId: randomUUID(),
      expectedRevision: 0,
      action: {
        kind: "upgrade" as const,
        hex: "A1",
        to: "palace" as const,
        deferPalace: true,
      },
    };
    await submitCommand(db, actors[0], id, upgrade);
    const published = (await getGame(db, actors[1], id)).state;
    expect(published.board.buildings.A1.kind).toBe("palace");
    expect(published.players.p1.palace).toBeNull();
    const palace = published.pending.find((c) => c.kind === "palace")!;
    const leech = published.pending.find((c) => c.kind === "leech")!;
    const choose = {
      commandId: randomUUID(),
      expectedRevision: 1,
      action: {
        kind: "respond" as const,
        choiceId: palace.id,
        option: "engineering-palace",
      },
    };
    await expect(
      submitCommand(db, actors[0], id, choose),
    ).rejects.toMatchObject({ code: "WAIT_DEPENDENCY" });
    const response = {
      commandId: randomUUID(),
      expectedRevision: 1,
      action: {
        kind: "respond" as const,
        choiceId: leech.id,
        option: "decline",
      },
    };
    await submitCommand(db, actors[1], id, response);
    choose.expectedRevision = 2;
    const [first, retry] = await Promise.all([
      submitCommand(db, actors[0], id, choose),
      submitCommand(db, actors[0], id, choose),
    ]);
    expect(first).toEqual(retry);
    const after = (await getGame(db, actors[0], id)).state;
    expect(after.revision).toBe(3);
    expect(after.players.p1.resources.tools).toBe(4);
    expect(after.players.p1.palace).toBe("engineering-palace");
    expect(after.pending).toHaveLength(5);
    expect(
      (await db.query("SELECT * FROM game_events WHERE game_id=$1", [id]))
        .rowCount,
    ).toBe(3);
    expect(
      replayGame(state, [
        { revision: 1, seat: "p1", action: upgrade.action },
        { revision: 2, seat: "p2", action: response.action },
        { revision: 3, seat: "p1", action: choose.action },
      ]).state,
    ).toEqual(after);
  });
  it("book allocation and combined burn retry atomically and replay at one revision each", async () => {
    const id = await seededGame();
    const state = actionState();
    state.setup.id = id;
    state.phase = "income";
    state.players.p1.resources.power = [0, 10, 2];
    queueChoice(state, "p1", "book", 2, ["0", "1", "2", "3"], "income");
    await db.query("UPDATE games SET state=$2 WHERE id=$1", [
      id,
      JSON.stringify(state),
    ]);
    const books = {
      commandId: randomUUID(),
      expectedRevision: 0,
      action: {
        kind: "collectBooks" as const,
        selections: state.pending.map((c, i) => ({
          choiceId: c.id,
          option: (i ? "2" : "0") as "0" | "2",
        })),
      },
    };
    const [a, b] = await Promise.all([
      submitCommand(db, actors[0], id, books),
      submitCommand(db, actors[0], id, books),
    ]);
    expect(a).toEqual(b);
    expect(
      (await getGame(db, actors[0], id)).state.players.p1.resources.books,
    ).toEqual([1, 0, 1, 0]);
    const power = {
      commandId: randomUUID(),
      expectedRevision: 1,
      action: { kind: "powerAction" as const, id: "coins", burn: 2 },
    };
    const paid = await submitCommand(db, actors[0], id, power);
    expect(await submitCommand(db, actors[0], id, power)).toEqual(paid);
    const conversions = {
      commandId: randomUUID(),
      expectedRevision: 2,
      action: {
        kind: "convertBatch" as const,
        actions: [
          { kind: "burn" as const, count: 3 },
          {
            kind: "convert" as const,
            from: "power" as const,
            to: "tool" as const,
            count: 1,
          },
        ],
      },
    };
    const [c, d] = await Promise.all([
      submitCommand(db, actors[0], id, conversions),
      submitCommand(db, actors[0], id, conversions),
    ]);
    expect(c).toEqual(d);
    const after = (await getGame(db, actors[0], id)).state;
    expect(after.revision).toBe(3);
    expect(after.players.p1.resources.power).toEqual([7, 0, 0]);
    expect(
      (await db.query("SELECT * FROM game_events WHERE game_id=$1", [id]))
        .rowCount,
    ).toBe(3);
    expect(
      replayGame(state, [
        { revision: 1, seat: "p1", action: books.action },
        { revision: 2, seat: "p1", action: power.action },
        { revision: 3, seat: "p1", action: conversions.action },
      ]).state,
    ).toEqual(after);
  });
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
