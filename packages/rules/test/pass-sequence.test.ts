import { it, expect } from "vitest";
import {
  applyAction,
  getAvailableChoices,
  canConvertDuringChoice,
} from "../src/engine";
import { actionState } from "./fixtures/actions";
import { replayGame } from "../src/replay";
import type { GameAction, GameState } from "../src/types";
const pass: GameAction = { kind: "pass", deferBonus: true };
function step(s: GameState, a: GameAction) {
  const r = applyAction(s, "p1", a);
  if (!r.ok) throw Error(r.error.code);
  return r.state;
}
function reply(s: GameState, kind: string, option: string): GameAction {
  return {
    kind: "respond",
    choiceId: s.pending.find((c) => c.kind === kind)!.id,
    option,
  };
}
it("confirms passing before selecting a bonus, then permits conversions until explicit finish", () => {
  const initial = actionState();
  initial.shared.bonusCoins.bigbuilding = 2;
  let s = step(initial, pass);
  expect(s.passOrder).toEqual(["p1"]);
  expect(s.players.p1.passed).toBe(true);
  expect(s.players.p1.bonus).toBe("coins");
  expect(getAvailableChoices(s).map((c) => c.kind)).toEqual(["bonus"]);
  expect(canConvertDuringChoice(s, "p1")).toBe(false);
  expect(applyAction(s, "p1", reply(s, "passFinish", "finish"))).toMatchObject({
    ok: false,
    error: { code: "WAIT_DEPENDENCY" },
  });
  s = step(s, reply(s, "bonus", "bigbuilding"));
  expect(s.players.p1.resources.coins).toBe(
    initial.players.p1.resources.coins + 2,
  );
  expect(s.shared.bonusCoins.bigbuilding).toBe(0);
  expect(s.activeSeat).toBe("p1");
  expect(canConvertDuringChoice(s, "p1")).toBe(true);
  s = step(s, { kind: "convert", from: "tool", to: "coin", count: 1 });
  s = step(s, reply(s, "passFinish", "finish"));
  expect(s.activeSeat).toBe("p2");
  expect(s.passOrder).toEqual(["p1"]);
  expect(s.players.p1.resources.tools).toBe(
    initial.players.p1.resources.tools - 1,
  );
});
it("last passing player cannot trigger income until bonus and finish are resolved", () => {
  const initial = actionState();
  initial.players.p2.passed = initial.players.p3.passed = true;
  initial.passOrder = ["p2", "p3"];
  let s = step(initial, pass);
  expect(s.round).toBe(1);
  s = step(s, reply(s, "bonus", "bigbuilding"));
  expect(s.round).toBe(1);
  s = step(s, reply(s, "passFinish", "finish"));
  expect(s.round).toBe(2);
  expect(s.turnOrder).toEqual(["p2", "p3", "p1"]);
});
it("final round skips bonus selection but preserves the conversion window before scoring", () => {
  const initial = actionState();
  initial.round = 6;
  initial.players.p2.passed = initial.players.p3.passed = true;
  initial.passOrder = ["p2", "p3"];
  let s = step(initial, pass);
  expect(s.status).toBe("active");
  expect(getAvailableChoices(s).map((c) => c.kind)).toEqual(["passFinish"]);
  s = step(s, reply(s, "passFinish", "finish"));
  expect(s.status).toBe("finished");
});
it("keeps pass science rewards behind bonus selection and before finish", () => {
  const initial = actionState();
  initial.players.p1.bonus = "school";
  initial.board.buildings.A1.kind = "school";
  let s = step(initial, pass);
  expect(getAvailableChoices(s).map((c) => c.kind)).toEqual(["bonus"]);
  s = step(s, reply(s, "bonus", "bigbuilding"));
  expect(getAvailableChoices(s).map((c) => c.kind)).toEqual(["science"]);
  s = step(s, reply(s, "science", "0"));
  expect(getAvailableChoices(s).map((c) => c.kind)).toEqual(["passFinish"]);
});
it("private staged passing can publish as one turn and replay; frozen rules reject the new command", () => {
  const initial = actionState();
  let s = step(initial, pass);
  const bonus = reply(s, "bonus", "bigbuilding");
  s = step(s, bonus);
  const finish = reply(s, "passFinish", "finish");
  const action: GameAction = {
    kind: "turn",
    actions: [
      pass as Exclude<GameAction, { kind: "turn" }>,
      bonus as Exclude<GameAction, { kind: "turn" }>,
      finish as Exclude<GameAction, { kind: "turn" }>,
    ],
  };
  s = step(initial, action);
  s.revision = 1;
  expect(
    replayGame(initial, [{ revision: 1, seat: "p1", action }]).state,
  ).toEqual(s);
  const old = structuredClone(initial);
  old.rulesVersion = old.setup.rulesVersion = "aoi-1.1+2024-09.engine-6";
  expect(applyAction(old, "p1", pass)).toMatchObject({
    ok: false,
    error: { code: "RULESET_UNAVAILABLE" },
  });
  expect(
    applyAction(old, "p1", { kind: "pass", bonus: "bigbuilding" }).ok,
  ).toBe(true);
});
