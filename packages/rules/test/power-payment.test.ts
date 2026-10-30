import { it, expect } from "vitest";
import { applyAction } from "../src/engine";
import { actionState } from "./fixtures/actions";
import { withPowerBurn } from "../../../apps/web/src/power-payment";
import { atomicActionSchema } from "../../contracts/src/game";

it("burn and power purchase are atomic and equivalent to two valid actions", () => {
  const s = actionState();
  s.players.p1.resources.power = [0, 10, 2];
  const before = structuredClone(s);
  const action = withPowerBurn(s, "p1", { kind: "powerAction", id: "coins" });
  expect(action).toEqual({ kind: "powerAction", id: "coins", burn: 2 });
  expect(atomicActionSchema.safeParse(action).success).toBe(true);
  const result = applyAction(s, "p1", action);
  if (!result.ok) throw Error(result.error.code);
  expect(result.state.players.p1.resources.power).toEqual([4, 6, 0]);
  expect(result.state.players.p1.resources.coins).toBe(
    s.players.p1.resources.coins + 7,
  );
  expect(result.state.players.p1.primaryDone).toBe(true);
  const burned = applyAction(s, "p1", { kind: "burn", count: 2 });
  if (!burned.ok) throw Error(burned.error.code);
  const paid = applyAction(burned.state, "p1", {
    kind: "powerAction",
    id: "coins",
  });
  if (!paid.ok) throw Error(paid.error.code);
  expect(result.state).toEqual(paid.state);
  expect(result.events).toEqual([...burned.events, ...paid.events]);
  expect(s).toEqual(before);
  expect(applyAction(result.state, "p1", action).ok).toBe(false);
});

it("a failed purchase never commits the burn, including bad bridge and occupied action", () => {
  const s = actionState();
  s.players.p1.resources.power = [0, 10, 2];
  const before = structuredClone(s);
  expect(
    applyAction(s, "p1", {
      kind: "powerAction",
      id: "bridge",
      burn: 1,
      a: "A1",
      b: "A1",
    }).ok,
  ).toBe(false);
  expect(s).toEqual(before);
  s.shared.usedActions.push("coins");
  expect(
    applyAction(s, "p1", { kind: "powerAction", id: "coins", burn: 2 }).ok,
  ).toBe(false);
  expect(s.players.p1.resources.power).toEqual([0, 10, 2]);
  for (const burn of [0, -1, 0.5, 6]) {
    expect(
      applyAction(s, "p1", { kind: "powerAction", id: "tools", burn }).ok,
    ).toBe(false);
  }
});

it("suggestion respects discount, second-bowl capacity, and frozen rules", () => {
  const s = actionState();
  s.players.p1.resources.power = [0, 10, 2];
  s.players.p1.faction = "illusionists";
  expect(
    withPowerBurn(s, "p1", { kind: "powerAction", id: "coins" }),
  ).toMatchObject({ burn: 1 });
  s.players.p1.resources.power = [0, 1, 2];
  expect(
    withPowerBurn(s, "p1", { kind: "powerAction", id: "coins" }),
  ).not.toHaveProperty("burn");
  s.rulesVersion = "aoi-1.1+2024-09.engine-5";
  expect(
    withPowerBurn(s, "p1", { kind: "powerAction", id: "coins" }),
  ).not.toHaveProperty("burn");
  expect(
    applyAction(s, "p1", { kind: "powerAction", id: "coins", burn: 1 }).ok,
  ).toBe(false);
});

it("payment can be published inside the existing atomic turn", () => {
  const s = actionState();
  s.players.p1.resources.power = [0, 10, 2];
  const result = applyAction(s, "p1", {
    kind: "turn",
    actions: [
      { kind: "powerAction", id: "coins", burn: 2 },
      { kind: "endTurn" },
    ],
  });
  expect(result.ok && result.state.activeSeat).toBe("p2");
});
