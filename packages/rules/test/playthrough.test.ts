import { expect, it } from "vitest";
import { standardSetup } from "../src/setup";
import { createGame } from "../src/state";
import { applyAction } from "../src/engine";
import { replayGame, replayRecord, type RecordedCommand } from "../src/replay";
import { jsonbSnapshot } from "../src/serialization";
import { chooseMove, seededRandom } from "./fixtures/players";

// PostgreSQL jsonb does not preserve object key insertion order. Persist each
// move in canonical key order so replay is checked against actual storage semantics.
function stored<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stored) as T;
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, stored(v)]),
    ) as T;
  return value;
}

it.each([3, 4, 5])(
  "%i strategic players finish seeded games with conserved state and replay",
  (count) => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 8; seed++) {
      const initial = createGame(
        standardSetup(
          `simulation-${count}-${seed}`,
          Array.from({ length: count }, (_, i) => ({
            id: String(i),
            name: `Player ${i + 1}`,
          })),
          seededRandom(seed),
        ),
      );
      let state = initial;
      const commands: RecordedCommand[] = [];
      const events = [];
      for (let step = 0; step < 900 && state.status !== "finished"; step++) {
        const { seat, action } = chooseMove(state);
        const before = JSON.stringify(state);
        const next = applyAction(state, seat, action);
        expect(JSON.stringify(state)).toBe(before);
        if (!next.ok) throw Error(next.error.code);
        state = stored(next.state);
        state.revision++;
        commands.push({ revision: state.revision, seat, action });
        events.push(next.events);
        seen.add(action.kind);
        for (const p of Object.values(state.players)) {
          for (const n of [
            p.resources.coins,
            p.resources.tools,
            p.resources.scholars,
            ...p.resources.books,
            ...p.resources.power,
          ]) {
            expect(Number.isInteger(n)).toBe(true);
            expect(n).toBeGreaterThanOrEqual(0);
          }
        }
      }
      expect(state.status, `seed ${seed}, revision ${state.revision}`).toBe(
        "finished",
      );
      expect(state.scores).toHaveLength(count);
      for (const score of state.scores)
        expect(score.total).toBe(
          score.items.reduce((n, item) => n + item.points, 0),
        );
      const replay = replayGame(initial, commands);
      expect(replay.state).toEqual(state);
      expect(replay.history.map((row) => row.events)).toEqual(events);
    }
    for (const kind of [
      "upgrade",
      "terraform",
      "scholar",
      "advance",
      "powerAction",
      "bookAction",
      "innovation",
      "respond",
      "pass",
    ])
      expect(seen.has(kind), kind).toBe(true);
  },
  120000,
);

it("frozen v2 online games replay with their original database storage ordering", () => {
  const setup = standardSetup(
    "legacy-online",
    Array.from({ length: 5 }, (_, i) => ({ id: String(i), name: `P${i}` })),
    seededRandom(1),
  );
  setup.rulesVersion = "aoi-1.1+2024-09.engine-2";
  const initial = jsonbSnapshot(createGame(setup));
  let state = initial;
  const commands: RecordedCommand[] = [];
  for (let step = 0; step < 900 && state.status !== "finished"; step++) {
    const { seat, action } = chooseMove(state);
    const next = applyAction(state, seat, action);
    if (!next.ok) throw Error(next.error.code);
    state = jsonbSnapshot(next.state);
    state.revision++;
    commands.push({ revision: state.revision, seat, action });
  }
  expect(state.status).toBe("finished");
  expect(
    replayRecord({ initial, commands, storage: "postgres-jsonb" }).state,
  ).toEqual(state);
}, 30000);
