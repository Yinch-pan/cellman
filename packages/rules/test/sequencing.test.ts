import { it, expect } from "vitest";
import { applyAction, getAvailableChoices } from "../src/engine";
import { actionState } from "./fixtures/actions";
import { queueChoice } from "../src/responses";
import { createGame } from "../src/state";
import { sampleSetup } from "./fixtures/setup";
import { replayGame } from "../src/replay";
import type { GameState, GameAction } from "../src/types";
function step(s: GameState, a: GameAction) {
  const r = applyAction(s, "p1", a);
  if (!r.ok) throw Error(r.error.code);
  return r.state;
}
it("palace bridge pair is resolved together before another immediate reward", () => {
  let s = actionState();
  s.board.buildings = { A1: { seat: "p1", kind: "guild" } };
  s.shared.palaces = ["engineering-palace"];
  s.players.p1.resources = { ...s.players.p1.resources, tools: 10, coins: 20 };
  s = step(s, {
    kind: "upgrade",
    hex: "A1",
    to: "palace",
    palace: "engineering-palace",
  });
  const bridges = s.pending.filter((c) => c.kind === "bridge"),
    book = s.pending.find((c) => c.kind === "book")!;
  expect(bridges).toHaveLength(2);
  s = step(s, { kind: "respond", choiceId: bridges[0].id, option: "discard" });
  expect(
    applyAction(s, "p1", { kind: "respond", choiceId: book.id, option: "0" }),
  ).toMatchObject({ ok: false, error: { code: "FINISH_EFFECT_BATCH" } });
  expect(getAvailableChoices(s).map((c) => c.id)).toEqual([bridges[1].id]);
  s = step(s, { kind: "respond", choiceId: bridges[1].id, option: "discard" });
  s = step(s, { kind: "respond", choiceId: book.id, option: "0" });
  expect(s.players.p1.resources.books[0]).toBe(1);
});
it("remote guild uses supply freed by the palace upgrade", () => {
  let s = actionState();
  s.board.buildings = {
    A1: { seat: "p1", kind: "guild" },
    B4: { seat: "p1", kind: "guild" },
    B6: { seat: "p1", kind: "guild" },
    B9: { seat: "p1", kind: "guild" },
  };
  s.shared.palaces = ["remote-guild"];
  s.players.p1.resources.tools = 10;
  s.players.p1.resources.coins = 20;
  s = step(s, {
    kind: "upgrade",
    hex: "A1",
    to: "palace",
    palace: "remote-guild",
  });
  const c = s.pending.find((c) => c.kind === "freeGuild")!;
  expect(c).toBeDefined();
  s = step(s, { kind: "respond", choiceId: c.id, option: "E2" });
  expect(s.board.buildings.E2).toEqual({ seat: "p1", kind: "guild" });
  expect(s.players.p1.resources.tools).toBe(6);
  expect(s.players.p1.resources.coins).toBe(14);
});
it("automatic leech clears the final income response and resumes actions", () => {
  const s = actionState();
  s.phase = "income";
  queueChoice(s, "p1", "leech", 1, ["accept", "decline"], "test");
  const n = step(s, { kind: "setLeech", enabled: true, maxVpCost: 0 });
  expect(n.pending).toEqual([]);
  expect(n.phase).toBe("actions");
});
it("old saves dispatch to the frozen engine for deterministic replay", () => {
  const s = createGame({ ...sampleSetup(), rulesVersion: "aoi-1.1+2024-09" });
  const record = [
    { revision: 1, seat: "p1", action: { kind: "place" as const, hex: "A1" } },
  ];
  expect(replayGame(s, record).state.rulesVersion).toBe("aoi-1.1+2024-09");
  expect(replayGame(s, record).state.board.buildings.A1).toEqual({
    seat: "p1",
    kind: "workshop",
  });
});
