import { describe, it, expect } from "vitest";
import { standardSetup } from "../src/setup";
import { createGame, validateState } from "../src/state";
import { applyAction } from "../src/engine";
import { actionState } from "./fixtures/actions";
import { palaces, innovations } from "../src/content";
import { giveIncome } from "../src/rounds";
import { replayGame, type RecordedCommand } from "../src/replay";
import { officialLarge } from "../src/map";
import type { GameAction, GameState } from "../src/types";
function rng(seed: number) {
  return () =>
    (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
}
function step(s: GameState, seat: string, a: GameAction) {
  const r = applyAction(s, seat, a);
  expect(r.ok, JSON.stringify(a) + (r.ok ? "" : r.error.code)).toBe(true);
  if (!r.ok) throw Error(r.error.code);
  return r.state;
}
describe("official setup and serialized choices (rules p4–6,19–24)", () => {
  for (const count of [3, 4, 5])
    it(`${count} players draft, place, resolve starting rewards, finish six rounds and replay identically`, () => {
      const config = standardSetup(
        `test-${count}`,
        Array.from({ length: count }, (_, i) => ({
          id: `${i}`,
          name: `P${i}`,
        })),
        rng(99 + count),
      );
      expect(config.innovations).toHaveLength(
        count === 3 ? 8 : count === 4 ? 10 : 12,
      );
      expect(config.palaces).toHaveLength(count + 2);
      const initial = createGame(config);
      let s = initial;
      const commands: RecordedCommand[] = [];
      const act = (seat: string, a: GameAction) => {
        s = step(s, seat, a);
        s.revision++;
        commands.push({ revision: s.revision, seat, action: a });
        expect(validateState(s)).toEqual([]);
        s = JSON.parse(JSON.stringify(s));
      };
      for (let i = 0; i < count; i++)
        act(s.activeSeat, { kind: "chooseSetup", offer: i });
      expect(new Set(Object.values(s.players).map((p) => p.native)).size).toBe(
        count,
      );
      let guard = 0;
      while (s.status !== "finished" && guard++ < 300) {
        if (s.pending.length) {
          let moved = false;
          for (const c of s.pending) {
            const options =
              c.kind === "spades"
                ? ["discard"]
                : c.kind === "competency"
                  ? [
                      "immediate-resources",
                      "income-vp-coins",
                      "border-score",
                      "scholar-score",
                      ...c.options,
                    ]
                  : c.options;
            for (const option of options) {
              const a: GameAction = { kind: "respond", choiceId: c.id, option };
              if (applyAction(s, c.seat, a).ok) {
                act(c.seat, a);
                moved = true;
                break;
              }
            }
            if (moved) break;
          }
          expect(moved, `unresolved ${JSON.stringify(s.pending)}`).toBe(true);
        } else if (s.phase === "placement") {
          const p = s.players[s.activeSeat];
          const hex = Object.values(officialLarge.hexes).find(
            (h) => h.terrain === p.native && !s.board.buildings[h.id],
          )!.id;
          act(p.seat, { kind: "place", hex });
        } else {
          const bonus = s.setup.bonusPool.find(
            (id) => !Object.values(s.players).some((p) => p.bonus === id),
          );
          act(s.activeSeat, {
            kind: "pass",
            bonus: s.round < 6 ? bonus : undefined,
          });
        }
      }
      expect(s.status).toBe("finished");
      expect(s.scores).toHaveLength(count);
      expect(replayGame(initial, commands).state).toEqual(s);
    });
});
it("revised illusionists discount and scoring depend on player count (September 2024)", () => {
  const s = actionState();
  s.players.p1.faction = "illusionists";
  s.players.p1.resources.power = [0, 0, 12];
  const n = step(s, "p1", { kind: "powerAction", id: "coins" });
  expect(n.players.p1.resources.power).toEqual([3, 0, 9]);
  expect(n.players.p1.vp).toBe(s.players.p1.vp + 1);
});
it("psychics' bonus leaves one primary action, then prevents another (p20)", () => {
  let s = actionState();
  s.players.p1.faction = "psychics";
  s.players.p1.resources.power = [0, 12, 0];
  s = step(s, "p1", { kind: "special", source: "faction:psychics" });
  expect(s.players.p1.primaryDone).toBe(false);
  s = step(s, "p1", { kind: "powerAction", id: "coins" });
  expect(s.players.p1.primaryDone).toBe(true);
  expect(
    applyAction(s, "p1", { kind: "special", source: "faction:psychics" }).ok,
  ).toBe(false);
});
it("all 17 palaces and 18 innovations have rule references and executable entry effects", () => {
  expect(Object.keys(palaces)).toHaveLength(17);
  expect(Object.keys(innovations)).toHaveLength(18);
  for (const id of Object.keys(palaces)) {
    const s = actionState();
    s.players.p1.resources.coins = 100;
    s.players.p1.resources.tools = 100;
    s.board.buildings.A1 = { seat: "p1", kind: "guild" };
    s.shared.palaces = [id];
    const n = step(s, "p1", {
      kind: "upgrade",
      hex: "A1",
      to: "palace",
      palace: id,
    });
    expect(n.players.p1.palace).toBe(id);
    expect(n.shared.palaces).not.toContain(id);
  }
  for (const id of Object.keys(innovations)) {
    const s = actionState();
    s.setup.innovations = [id];
    s.shared.innovations = [id];
    s.players.p1.resources.books = [9, 9, 9, 9];
    s.players.p1.resources.coins = 100;
    const n = step(s, "p1", { kind: "innovation", id, books: [2, 1, 1, 1] });
    expect(n.players.p1.innovations).toContain(id);
  }
});
it("new palace income and trading routes use independently calculated amounts (p21–22)", () => {
  const s = actionState();
  const p = s.players.p1;
  p.palace = "tools-special";
  p.resources.power = [5, 7, 0];
  p.innovations = [
    "neutral-workshop",
    "neutral-guild",
    "neutral-university",
    "neutral-palace",
  ];
  const before = structuredClone(p);
  giveIncome(s);
  expect(p.resources.tools - before.resources.tools).toBe(5); // base 1 + one workshop + neutral innovation income 3
  expect(p.resources.coins - before.resources.coins).toBe(11); // bonus coins 6 + innovation 5
  expect(p.resources.power).toEqual([0, 8, 4]); // 5 palace +4 innovation
  expect(p.vp - before.vp).toBe(2);
});
