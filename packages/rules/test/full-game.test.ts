import { it, expect } from "vitest";
import { createGame, validateState } from "../src/state";
import { developmentSetup } from "../src/preset";
import { applyAction } from "../src/engine";
import type { GameAction } from "../src/types";
import fixture from "./fixtures/six-round-baseline.json";
it("matches independently calculated six-round resources and every final total", () => {
  let s = createGame(
    developmentSetup("lifecycle", [
      { id: "1", name: "A" },
      { id: "2", name: "B" },
      { id: "3", name: "C" },
    ]),
  );
  function action(seat: string, a: GameAction) {
    const result = applyAction(s, seat, a);
    expect(result.ok, JSON.stringify(a)).toBe(true);
    if (!result.ok) throw Error(result.error.code);
    s = JSON.parse(JSON.stringify(result.state));
    expect(validateState(s)).toEqual([]);
  }
  for (const [seat, hex] of fixture.placements)
    action(seat, { kind: "place", hex });
  for (let round = 1; round <= 6; round++) {
    expect(s.round).toBe(round);
    for (let i = 0; i < 3; i++) {
      action("p" + (i + 1), {
        kind: "pass",
        bonus: fixture.bonuses[round - 1]?.[i],
      });
      while (s.pending.length) {
        const c = s.pending[0];
        expect(c.kind).toBe("book");
        action(c.seat, { kind: "respond", choiceId: c.id, option: "0" });
      }
    }
  }
  expect(s.status).toBe("finished");
  for (const [seat, resources] of Object.entries(fixture.resources))
    expect(s.players[seat].resources, seat).toEqual(resources);
  expect(
    Object.fromEntries(s.scores.map((score) => [score.seat, score.total])),
  ).toEqual(fixture.totals);
});
