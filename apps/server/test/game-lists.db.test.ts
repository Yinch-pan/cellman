import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool, migrate } from "../src/db/pool";
import { register, login } from "../src/auth/sessions";
import { createApp } from "../src/app";
import { activeGames, gameHistory } from "../src/games/lists";
import { createGame } from "../../../packages/rules/src/state";
import { sampleSetup } from "../../../packages/rules/test/fixtures/setup";
import type { GameState } from "../../../packages/rules/src/types";

const url = process.env.TEST_DATABASE_URL,
  schema = "gamelists_" + randomUUID().replaceAll("-", "");
const admin = new Pool({ connectionString: url }),
  db = new Pool({ connectionString: url, options: `-c search_path=${schema}` }),
  app = createApp(db);
let created = false,
  actor = "",
  outsider = "";
beforeAll(async () => {
  if (!url || url === process.env.DATABASE_URL)
    throw Error("Separate test database required");
  await admin.query(`CREATE SCHEMA ${schema}`);
  created = true;
  await migrate(db);
  actor = (
    await register(db, {
      username: "listowner",
      password: "list-test-password",
    })
  ).userId;
  outsider = (
    await register(db, {
      username: "listoutsider",
      password: "list-test-password",
    })
  ).userId;
  await app.ready();
});
afterAll(async () => {
  await app.close();
  await db.end();
  if (created) await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
});
async function fixture(
  finished: boolean,
  index: number,
  reason?: NonNullable<GameState["matchResult"]>["reason"],
) {
  const id = randomUUID(),
    state = createGame({ ...sampleSetup(), id });
  if (finished) {
    state.status = "finished";
    state.phase = "finished";
    state.pending = [];
  }
  if (reason)
    state.matchResult = {
      reason,
      at: new Date(1700000000000 + index * 1000).toISOString(),
      winners: [],
      round: state.round,
    };
  await db.query(
    "INSERT INTO games(id,state,rules_version,updated_at,stats_eligible) VALUES($1,$2,$3,$4,false)",
    [
      id,
      JSON.stringify(state),
      state.rulesVersion,
      new Date(1700000000000 + index * 1000),
    ],
  );
  await db.query(
    "INSERT INTO game_members(game_id,user_id,seat) VALUES($1,$2,'p1')",
    [id, actor],
  );
  return id;
}
it("filters before limiting so over 100 recent finished games cannot hide an ongoing game", async () => {
  const active = await fixture(false, 0);
  const finished: string[] = [];
  for (let i = 1; i <= 105; i++) finished.push(await fixture(true, i));
  expect((await activeGames(db, actor)).map((g) => g.id)).toEqual([active]);
  const all: string[] = [];
  for (let page = 0; page < 6; page++) {
    const result = await gameHistory(db, actor, page);
    expect(result.games).toHaveLength(page === 5 ? 5 : 20);
    expect(result.hasMore).toBe(page < 5);
    expect(
      result.games.every(
        (g) => g.status === "finished" && !g.needAction && g.endedAt,
      ),
    ).toBe(true);
    all.push(...result.games.map((g) => g.id));
  }
  expect(all).toEqual(finished.reverse());
  expect(all).not.toContain(active);
});
it("all completed outcomes move to history, but a settled forfeit still being played remains active", async () => {
  for (const reason of ["consensus", "inactive", "forfeit"] as const) {
    const id = await fixture(true, 1000, reason);
    expect((await activeGames(db, actor)).some((g) => g.id === id)).toBe(false);
    expect(
      (await gameHistory(db, actor, 0)).games.find((g) => g.id === id)?.reason,
    ).toBe(reason);
  }
  const continued = await fixture(false, 1001, "forfeit");
  expect((await activeGames(db, actor)).some((g) => g.id === continued)).toBe(
    true,
  );
  expect(
    (await gameHistory(db, actor, 0)).games.some((g) => g.id === continued),
  ).toBe(false);
});
it("a game reopened by an approved undo returns to active without deleting its saved game", async () => {
  const id = await fixture(true, 2000);
  const reopened = createGame({ ...sampleSetup(), id });
  await db.query("UPDATE games SET state=$2 WHERE id=$1", [
    id,
    JSON.stringify(reopened),
  ]);
  expect((await activeGames(db, actor)).some((g) => g.id === id)).toBe(true);
  expect((await gameHistory(db, actor, 0)).games.some((g) => g.id === id)).toBe(
    false,
  );
});
it("history stays scoped to the authenticated player and validates page input", async () => {
  expect((await app.inject({ url: "/api/me/game-history" })).statusCode).toBe(
    401,
  );
  const own = await login(db, "listowner", "list-test-password"),
    other = await login(db, "listoutsider", "list-test-password");
  const response = await app.inject({
    url: "/api/me/game-history",
    headers: { cookie: `session=${own.session}` },
  });
  expect(response.statusCode).toBe(200);
  expect(response.json().games).toHaveLength(20);
  expect(
    (
      await app.inject({
        url: "/api/me/game-history",
        headers: { cookie: `session=${other.session}` },
      })
    ).json().games,
  ).toEqual([]);
  expect(await activeGames(db, outsider)).toEqual([]);
  for (const page of ["-1", "no", "1.5", "10001"])
    expect(
      (
        await app.inject({
          url: `/api/me/game-history?page=${page}`,
          headers: { cookie: `session=${own.session}` },
        })
      ).statusCode,
    ).toBe(400);
  expect(
    (
      await app.inject({
        url: "/api/me/games",
        headers: { cookie: `session=${own.session}` },
      })
    )
      .json()
      .every((g: any) => g.status !== "finished"),
  ).toBe(true);
});
