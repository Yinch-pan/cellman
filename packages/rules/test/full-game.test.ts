import { it, expect } from "vitest";
import { createGame, validateState, RULES_VERSION } from "../src/state";
import { developmentSetup } from "../src/preset";
import { applyAction } from "../src/engine";
import type { GameAction } from "../src/types";
import { replayRecord, type RecordedCommand } from "../src/replay";
import fixture from "./fixtures/six-round-baseline.json";
it.each(["aoi-1.1+2024-09.engine-7", RULES_VERSION])(
  "%s matches independently calculated six-round resources, final totals and replay",
  (rulesVersion) => {
    let s = createGame({
      ...developmentSetup("lifecycle", [
        { id: "1", name: "A" },
        { id: "2", name: "B" },
        { id: "3", name: "C" },
      ]),
      rulesVersion,
    });
    const initial = structuredClone(s);
    const commands: RecordedCommand[] = [];
    function action(seat: string, a: GameAction) {
      const result = applyAction(s, seat, a);
      expect(result.ok, JSON.stringify(a)).toBe(true);
      if (!result.ok) throw Error(result.error.code);
      s = JSON.parse(JSON.stringify(result.state));
      s.revision = commands.length + 1;
      commands.push({ revision: s.revision, seat, action: a });
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
    // Six income phases: one base tool each. Final resource totals become
    // 74/64/71 coins, yielding 14/12/14 points (one more point per player).
    const baseTools = rulesVersion === RULES_VERSION ? 6 : 0;
    for (const [seat, resources] of Object.entries(fixture.resources))
      expect(s.players[seat].resources, seat).toEqual({
        ...resources,
        tools: resources.tools + baseTools,
      });
    expect(
      Object.fromEntries(s.scores.map((score) => [score.seat, score.total])),
    ).toEqual(baseTools ? { p1: 74, p2: 52, p3: 54 } : fixture.totals);
    expect(replayRecord({ initial, commands }).state).toEqual(s);
  },
);
