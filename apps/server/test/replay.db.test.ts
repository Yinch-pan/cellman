import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool, migrate } from "../src/db/pool";
import { register } from "../src/auth/sessions";
import {
  createRoom,
  joinRoom,
  setReady,
  startRoom,
} from "../src/rooms/service";
import { getGame, getReplay, submitCommand } from "../src/games/commands";
import { replayGame } from "../../../packages/rules/src/replay";
const url = process.env.TEST_DATABASE_URL;
const schema = "replay_" + randomUUID().replaceAll("-", "");
const admin = new Pool({ connectionString: url });
const db = new Pool({
  connectionString: url,
  options: `-c search_path=${schema}`,
});
const actors: string[] = [];
let created = false;
beforeAll(async () => {
  if (!url || url === process.env.DATABASE_URL)
    throw Error("Separate test database required");
  await admin.query(`CREATE SCHEMA ${schema}`);
  created = true;
  await migrate(db);
  for (let i = 0; i < 6; i++)
    actors.push(
      (
        await register(db, {
          username: `replay${i}`,
          password: "replay-test-password",
        })
      ).userId,
    );
});
afterAll(async () => {
  await db.end();
  if (created) await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
});
for (const count of [3, 4, 5])
  it(`${count}-player room persists draft commands, replay and idempotent retries`, async () => {
    const room = await createRoom(db, actors[0], {
      visibility: "public",
      seats: count,
      setupMode: "standard",
    });
    for (let i = 1; i < count; i++) await joinRoom(db, actors[i], room.id);
    for (const actor of actors.slice(0, count))
      await setReady(db, actor, room.id, true);
    const { gameId } = await startRoom(db, actors[0], room.id);
    for (let i = 0; i < count; i++) {
      const { state } = await getGame(db, actors[0], gameId);
      expect(state.phase).toBe("draft");
      const actor = actors[Number(state.activeSeat.slice(1)) - 1];
      const cmd = {
        commandId: randomUUID(),
        expectedRevision: i,
        action: { kind: "chooseSetup" as const, offer: i },
      };
      const response = await submitCommand(db, actor, gameId, cmd);
      expect(await submitCommand(db, actor, gameId, cmd)).toEqual(response);
    }
    const record = await getReplay(db, actors[0], gameId);
    expect(record.initial.revision).toBe(0);
    expect(record.commands).toHaveLength(count);
    expect(record.commands[0].action).toEqual({
      kind: "chooseSetup",
      offer: 0,
    });
    expect(replayGame(record.initial, record.commands).state).toEqual(
      (await getGame(db, actors[0], gameId)).state,
    );
    await expect(getReplay(db, actors[5], gameId)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await migrate(db);
    expect((await getReplay(db, actors[0], gameId)).initial.revision).toBe(0);
  });
