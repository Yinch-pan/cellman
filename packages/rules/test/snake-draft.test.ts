import { it, expect } from "vitest";
import { snakeSetup, draftOptions, placementOptions } from "../src/setup";
import { createGame, validateState } from "../src/state";
import { applyAction, getAvailableChoices } from "../src/engine";
import { replayRecord, type RecordedCommand } from "../src/replay";
import { officialLarge } from "../src/map";
import type { GameAction, GameState } from "../src/types";
const categories = ["palace", "native", "bonus", "faction"] as const;
function initial(n = 3, direction: "forward" | "reverse" = "forward") {
  return createGame(
    snakeSetup(
      "snake",
      Array.from({ length: n }, (_, i) => ({
        id: `id${i}`,
        name: `Player ${i + 1}`,
      })),
      direction,
      () => 0.37,
    ),
  );
}
function play(s: GameState, action: GameAction) {
  const r = applyAction(s, s.activeSeat, action);
  if (!r.ok) throw Error(r.error.code);
  r.state.revision = s.revision + 1;
  return r.state;
}
for (const n of [3, 4, 5])
  for (const direction of ["forward", "reverse"] as const) {
    it(`${n} players ${direction}: four snake rounds, unique independent choices, deterministic replay`, () => {
      let s = initial(n, direction);
      const before = structuredClone(s),
        commands: RecordedCommand[] = [];
      const order = [...s.turnOrder];
      expect(s.setup.draft!.pools.native).toHaveLength(6);
      expect(s.setup.draft!.pools.palace).not.toContain("immediate-score");
      for (let i = 0; i < n * 4; i++) {
        const round = Math.floor(i / n),
          reverse = (round % 2 === 0) === (direction === "reverse");
        expect(s.activeSeat).toBe(order[reverse ? n - 1 - (i % n) : i % n]);
        const category = categories.find(
          (c) => !s.draftPicks![s.activeSeat][c],
        )!;
        const action: GameAction = {
          kind: "draftPick",
          category,
          option: draftOptions(s, s.activeSeat, category)[0],
        };
        commands.push({ revision: i + 1, seat: s.activeSeat, action });
        s = play(s, action);
      }
      expect(s.phase).toBe("placement");
      expect(s.turnOrder).toEqual(order);
      for (const category of categories)
        expect(
          new Set(Object.values(s.draftPicks!).map((p) => p[category])).size,
        ).toBe(n);
      for (const p of Object.values(s.players)) {
        expect(p.palace).toBeNull();
        expect(p.draftPalace).toBe(s.draftPicks![p.seat].palace);
        expect(p.faction).toBe(s.draftPicks![p.seat].faction);
        expect(p.native).toBe(s.draftPicks![p.seat].native);
      }
      expect(
        s.setup.bonusPool.filter(
          (id) => !Object.values(s.players).some((p) => p.bonus === id),
        ),
      ).toHaveLength(3);
      expect(validateState(s)).toEqual([]);
      expect(replayRecord({ initial: before, commands }).state).toEqual(s);
      for (
        let attempts = 0;
        attempts < 100 && s.phase !== "actions";
        attempts++
      ) {
        const choice = getAvailableChoices(s)[0];
        const seat = choice?.seat ?? s.activeSeat;
        const action: GameAction = choice
          ? {
              kind: "respond",
              choiceId: choice.id,
              option: choice.options.includes("discard")
                ? "discard"
                : choice.options[0],
            }
          : {
              kind: "place",
              hex: Object.values(officialLarge.hexes).find(
                (h) =>
                  h.terrain === s.players[seat].native &&
                  !s.board.buildings[h.id],
              )!.id,
              building: placementOptions(s, seat)[0] as
                "workshop" | "university" | "tower",
            };
        const result = applyAction(s, seat, action);
        if (!result.ok) throw Error(result.error.code);
        commands.push({ revision: s.revision + 1, seat, action });
        result.state.revision = s.revision + 1;
        s = result.state;
      }
      expect(s.phase).toBe("actions");
      expect(validateState(s)).toEqual([]);
      expect(replayRecord({ initial: before, commands }).state).toEqual(s);
    });
  }
it("rejects out-of-turn, unavailable, duplicate-category and old bundled picks without mutation", () => {
  let s = initial();
  const before = structuredClone(s),
    option = draftOptions(s, s.activeSeat, "faction")[0];
  expect(
    applyAction(s, s.turnOrder[1], {
      kind: "draftPick",
      category: "faction",
      option,
    }).ok,
  ).toBe(false);
  expect(
    applyAction(s, s.activeSeat, { kind: "chooseSetup", offer: 0 }).ok,
  ).toBe(false);
  expect(
    applyAction(s, s.activeSeat, {
      kind: "draftPick",
      category: "palace",
      option: "immediate-score",
    }).ok,
  ).toBe(false);
  expect(s).toEqual(before);
  s = play(s, { kind: "draftPick", category: "faction", option });
  expect(
    applyAction(s, s.activeSeat, {
      kind: "draftPick",
      category: "faction",
      option,
    }).ok,
  ).toBe(false);
  for (let i = 0; i < 2; i++)
    s = play(s, {
      kind: "draftPick",
      category: "faction",
      option: draftOptions(s, s.activeSeat, "faction")[0],
    });
  expect(draftOptions(s, s.activeSeat, "faction")).toEqual([]);
});
it("reserved palace is inactive until built and another palace cannot be substituted", () => {
  let s = initial();
  while (s.phase === "draft") {
    const category = categories.find((c) => !s.draftPicks![s.activeSeat][c])!;
    s = play(s, {
      kind: "draftPick",
      category,
      option: draftOptions(s, s.activeSeat, category)[0],
    });
  }
  s.phase = "actions";
  s.pending = [];
  s.activeSeat = s.turnOrder[0];
  const p = s.players[s.activeSeat];
  const hex = Object.values(officialLarge.hexes).find(
    (h) => h.terrain === p.native,
  )!.id;
  s.board.buildings[hex] = { seat: p.seat, kind: "guild" };
  p.resources.coins = 100;
  p.resources.tools = 100;
  expect(p.palace).toBeNull();
  expect(
    applyAction(s, p.seat, {
      kind: "upgrade",
      hex,
      to: "palace",
      palace: "immediate-score",
    }).ok,
  ).toBe(false);
  const built = play(s, { kind: "upgrade", hex, to: "palace" });
  expect(built.players[p.seat].palace).toBe(p.draftPalace);
});
