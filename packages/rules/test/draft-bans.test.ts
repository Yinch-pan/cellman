import { it, expect } from "vitest";
import { snakeSetup, draftOptions } from "../src/setup";
import { createGame, validateState } from "../src/state";
import { applyAction } from "../src/engine";
import { replayRecord, type RecordedCommand } from "../src/replay";
import {
  draftCategories,
  draftCatalog,
  draftPoolSizes,
  emptyDraftBans,
} from "../src/draft-bans";
import { gameSettingsSchema } from "../../contracts/src/room";
const players = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `id${i}`, name: `Player ${i}` }));

for (const n of [3, 4, 5])
  for (const direction of ["forward", "reverse"] as const) {
    it(`${n} players ${direction}: maximum bans preserve draft sizes, legal picks and replay`, () => {
      const bans = emptyDraftBans(),
        sizes = draftPoolSizes(n);
      for (const category of draftCategories)
        bans[category] = draftCatalog[category].slice(
          0,
          draftCatalog[category].length - sizes[category],
        );
      const setup = snakeSetup(
        "banned",
        players(n),
        direction,
        () => 0.37,
        bans,
      );
      for (const category of draftCategories) {
        expect(setup.draft!.pools[category]).toHaveLength(sizes[category]);
        for (const banned of bans[category])
          expect(setup.draft!.pools[category]).not.toContain(banned);
      }
      const initial = createGame(setup);
      let state = structuredClone(initial);
      const commands: RecordedCommand[] = [];
      const illegal = applyAction(state, state.activeSeat, {
        kind: "draftPick",
        category: "faction",
        option: bans.faction[0],
      });
      expect(illegal).toMatchObject({
        ok: false,
        error: { code: "SETUP_UNAVAILABLE" },
      });
      for (let i = 0; i < n * 4; i++) {
        const category = draftCategories.find(
          (c) => !state.draftPicks![state.activeSeat][c],
        )!;
        const action = {
          kind: "draftPick" as const,
          category,
          option: draftOptions(state, state.activeSeat, category)[0],
        };
        commands.push({ revision: i + 1, seat: state.activeSeat, action });
        const result = applyAction(state, state.activeSeat, action);
        if (!result.ok) throw Error(result.error.code);
        state = result.state;
        state.revision = i + 1;
      }
      expect(state.phase).toBe("placement");
      expect(validateState(state)).toEqual([]);
      expect(replayRecord({ initial, commands }).state).toEqual(state);
      expect(state.setup.bonusPool).toEqual(setup.draft!.pools.bonus);
    });
  }
it("no bans preserves seeded setup and invalid lists fail before setup generation", () => {
  const build = (bans = emptyDraftBans()) =>
    snakeSetup("same", players(3), "forward", () => 0.5, bans);
  expect(build()).toEqual(snakeSetup("same", players(3), "forward", () => 0.5));
  expect(() =>
    build({ ...emptyDraftBans(), native: ["forest", "lake"] }),
  ).toThrow("DRAFT_POOL_TOO_SMALL");
  for (const faction of [["missing"], ["monks", "monks"]]) {
    expect(() => build({ ...emptyDraftBans(), faction })).toThrow(
      "INVALID_DRAFT_BANS",
    );
    expect(
      gameSettingsSchema.safeParse({ draftBans: { faction } }).success,
    ).toBe(false);
  }
  expect(
    gameSettingsSchema.safeParse({ draftBans: { palace: ["immediate-score"] } })
      .success,
  ).toBe(false);
  expect(
    gameSettingsSchema.safeParse({ draftBans: { unexpected: [] } }).success,
  ).toBe(false);
  expect(
    gameSettingsSchema.parse({ draftBans: { faction: ["monks"] } }).draftBans,
  ).toEqual({ ...emptyDraftBans(), faction: ["monks"] });
});
