import { it, expect } from "vitest";
import { applyAction } from "../src/engine";
import { actionState } from "./fixtures/actions";
import { completeRound } from "../src/rounds";
import { takeCity } from "../src/actions/city";
import { getWaitingSeats } from "../src/engine";
it("science spades follow the next round player order and cannot be answered early (p17)", () => {
  const s = actionState();
  s.setup.roundTiles[0] = "city-engineering";
  s.passOrder = ["p3", "p1", "p2"];
  for (const p of Object.values(s.players)) {
    p.science[2] = 4;
    p.faction = "goblins";
  }
  completeRound(s);
  expect(s.pending.map((c) => c.seat)).toEqual(["p3", "p1", "p2"]);
  expect(getWaitingSeats(s)).toEqual(["p3"]);
  const early = applyAction(s, "p1", {
    kind: "respond",
    choiceId: s.pending.find((c) => c.seat === "p1")!.id,
    option: "discard",
  });
  expect(early).toMatchObject({
    ok: false,
    error: { code: "WAIT_SCIENCE_ORDER" },
  });
});
it("round science rewards finish before the next income (rules p17)", () => {
  const s = actionState();
  s.round = 2;
  s.setup.roundTiles[1] = "guild-law";
  s.players.p1.science[1] = 3;
  s.players.p1.faction = "goblins";
  s.passOrder = [...s.turnOrder];
  for (const p of Object.values(s.players)) p.passed = true;
  const coins = s.players.p1.resources.coins;
  completeRound(s);
  expect(s.round).toBe(2);
  expect(s.phase).toBe("science");
  expect(s.players.p1.resources.coins).toBe(coins);
  let next = s;
  while (next.pending.length) {
    const c = next.pending[0];
    const r = applyAction(next, c.seat, {
      kind: "respond",
      choiceId: c.id,
      option: "0",
    });
    if (!r.ok) throw Error(r.error.code);
    next = r.state;
  }
  expect(next.round).toBe(3);
  expect(next.phase).toBe("actions");
  expect(next.players.p1.resources.coins).toBe(coins + 6);
});
it("income science does not earn the action-phase science round score (p17,p23)", () => {
  const s = actionState();
  s.setup.roundTiles[1] = "science-medicine";
  s.players.p1.competencies = ["income-tool-science"];
  s.passOrder = [...s.turnOrder];
  completeRound(s);
  const c = s.pending.find((c) => c.seat === "p1" && c.kind === "science")!;
  const vp = s.players.p1.vp;
  expect(s.phase).toBe("income");
  const r = applyAction(s, "p1", {
    kind: "respond",
    choiceId: c.id,
    option: "0",
  });
  expect(r.ok).toBe(true);
  if (r.ok) {
    expect(r.state.players.p1.vp).toBe(vp);
    expect(r.state.phase).toBe("actions");
  }
});
it("city round points are awarded when taking the tile, including a palace tile (p23)", () => {
  const s = actionState();
  s.setup.roundTiles[0] = "city-engineering";
  takeCity(s, s.players.p1, "coins");
  expect(s.players.p1.vp).toBe(31);
});
it("a workshop built by power spades receives its palace bonus (p22)", () => {
  const s = actionState();
  s.players.p1.palace = "workshop-score";
  s.players.p1.resources.tools = 10;
  s.players.p1.resources.power = [0, 0, 12];
  s.board.buildings = { B4: { seat: "p1", kind: "workshop" } };
  const r = applyAction(s, "p1", {
    kind: "powerAction",
    id: "spade",
    hex: "A4",
    terrain: "forest",
    build: true,
  });
  expect(r.ok).toBe(true);
  if (r.ok) expect(r.state.players.p1.vp).toBe(24);
});
