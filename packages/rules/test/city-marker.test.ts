import { it, expect } from "vitest";
import { actionState } from "./fixtures/actions";
import { applyAction } from "../src/engine";
import { queueChoice } from "../src/responses";
import { commandSchema } from "../../contracts/src/game";

it("keeps a city marker on its chosen building and rejects other groups without awarding rewards", () => {
  const s = actionState();
  s.board.buildings.A1.cityId = "city:test";
  queueChoice(s, "p1", "city", 1, ["coins"], "city:test");
  const action = {
    kind: "respond" as const,
    choiceId: s.pending[0].id,
    option: "coins",
    cityHex: "A1",
  };
  const snapshot = structuredClone(s);
  expect(applyAction(s, "p1", { ...action, cityHex: "A2" }).ok).toBe(false);
  expect(s).toEqual(snapshot);
  const accepted = applyAction(s, "p1", action);
  expect(accepted.ok).toBe(true);
  if (!accepted.ok) return;
  expect(accepted.state.board.buildings.A1.cityTile).toBe("coins");
  expect(accepted.state.players.p1.keys).toBe(s.players.p1.keys + 1);
  expect(accepted.state.players.p1.resources.coins).toBe(
    s.players.p1.resources.coins + 6,
  );
  expect(applyAction(accepted.state, "p1", action).ok).toBe(false);
  expect(
    commandSchema.parse({
      commandId: "00000000-0000-4000-8000-000000000001",
      expectedRevision: 0,
      action,
    }).action,
  ).toEqual(action);
});
