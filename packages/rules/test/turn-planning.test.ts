import { it, expect } from "vitest";
import { applyAction } from "../src/engine";
import { actionState } from "./fixtures/actions";
import { incomeSources } from "../src/income";
import { giveIncome } from "../src/rounds";
import { replayGame } from "../src/replay";
import type { GameAction, GameState } from "../src/types";
function step(s: GameState, a: GameAction) {
  const r = applyAction(s, "p1", a);
  if (!r.ok) throw Error(r.error.code);
  return r.state;
}
it("publishes conversion, main action and end turn atomically with separate ledger entries", () => {
  const s = actionState();
  s.players.p1.resources.power = [0, 0, 12];
  const before = structuredClone(s);
  const action: GameAction = {
    kind: "turn",
    actions: [
      { kind: "convert", from: "power", to: "tool", count: 1 },
      { kind: "powerAction", id: "coins" },
      { kind: "endTurn" },
    ],
  };
  const r = applyAction(s, "p1", action);
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(s).toEqual(before);
  expect(r.state.players.p1.resources).toMatchObject({
    tools: 4,
    coins: 22,
    power: [7, 0, 5],
  });
  expect(r.state.activeSeat).toBe("p2");
  expect(r.events.filter((e) => e.kind === "ledger")).toHaveLength(3);
  r.state.revision = 1;
  expect(replayGame(s, [{ revision: 1, seat: "p1", action }]).state).toEqual(
    r.state,
  );
});
it("rejects invalid last steps, unfinished turns, duplicate main actions and actions after end", () => {
  const s = actionState();
  s.players.p1.resources.power = [0, 0, 12];
  const before = structuredClone(s);
  const sequences: GameAction[][] = [
    [],
    [{ kind: "convert", from: "power", to: "tool", count: 1 }],
    [
      { kind: "powerAction", id: "coins" },
      { kind: "powerAction", id: "tools" },
    ],
    [
      { kind: "powerAction", id: "coins" },
      { kind: "endTurn" },
      { kind: "convert", from: "tool", to: "coin", count: 1 },
    ],
    [
      { kind: "powerAction", id: "coins" },
      { kind: "convert", from: "tool", to: "coin", count: 999 },
      { kind: "endTurn" },
    ],
  ];
  for (const actions of sequences) {
    expect(
      applyAction(s, "p1", { kind: "turn", actions: actions as any }).ok,
    ).toBe(false);
    expect(s).toEqual(before);
  }
  expect(
    applyAction(s, "p2", { kind: "turn", actions: [{ kind: "endTurn" }] }).ok,
  ).toBe(false);
});
it("publishes when an opponent must respond, and cannot resolve their choice inside your turn", () => {
  const s = actionState();
  s.players.p2.leechPolicy.enabled = false;
  const r = applyAction(s, "p1", {
    kind: "turn",
    actions: [{ kind: "upgrade", hex: "A1", to: "guild" }],
  });
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(r.state.pending.some((c) => c.seat === "p2")).toBe(true);
  const c = r.state.pending.find((c) => c.seat === "p2")!;
  expect(
    applyAction(s, "p1", {
      kind: "turn",
      actions: [
        { kind: "upgrade", hex: "A1", to: "guild" },
        { kind: "respond", choiceId: c.id, option: "accept" },
      ],
    }).ok,
  ).toBe(false);
});
it("keeps the final conversion window before publishing a turn with paid leech", () => {
  const s = actionState();
  const action: GameAction = {
    kind: "turn",
    actions: [
      { kind: "upgrade", hex: "A1", to: "guild" },
      { kind: "convert", from: "tool", to: "coin", count: 1 },
      { kind: "endTurn" },
    ],
  };
  const result = applyAction(s, "p1", action);
  if (!result.ok) throw Error(result.error.code);
  expect(result.state.activeSeat).toBe("p2");
  expect(result.state.players.p1.primaryDone).toBe(false);
  expect(result.state.players.p1.resources).toMatchObject({
    tools: 0,
    coins: 13,
  });
  expect(result.state.players.p2.resources).toEqual(s.players.p2.resources);
  expect(result.state.pending).toHaveLength(1);
  expect(result.state.pending[0]).toMatchObject({
    kind: "leech",
    seat: "p2",
    amount: 2,
  });
  expect(
    applyAction(result.state, "p2", {
      kind: "upgrade",
      hex: "B1",
      to: "school",
    }),
  ).toMatchObject({ ok: false, error: { code: "PENDING_CHOICES" } });
  const accepted = applyAction(result.state, "p2", {
    kind: "respond",
    choiceId: result.state.pending[0].id,
    option: "accept",
  });
  if (!accepted.ok) throw Error(accepted.error.code);
  expect(accepted.state.activeSeat).toBe("p2");
  expect(accepted.state.players.p2.vp).toBe(19);
  expect(accepted.state.pending).toEqual([]);
  result.state.revision = 1;
  expect(replayGame(s, [{ revision: 1, seat: "p1", action }]).state).toEqual(
    result.state,
  );
});

it("cannot finish a turn with an unresolved building reward or use the new window in engine-6", () => {
  let s = actionState();
  s.board.buildings.A1.kind = "guild";
  s = step(s, { kind: "upgrade", hex: "A1", to: "school" });
  expect(applyAction(s, "p1", { kind: "endTurn" })).toMatchObject({
    ok: false,
    error: { code: "PENDING_CHOICES" },
  });
  const old = actionState();
  old.rulesVersion = old.setup.rulesVersion = "aoi-1.1+2024-09.engine-6";
  const upgraded = applyAction(old, "p1", {
    kind: "upgrade",
    hex: "A1",
    to: "guild",
  });
  if (!upgraded.ok) throw Error(upgraded.error.code);
  expect(
    applyAction(upgraded.state, "p1", {
      kind: "convert",
      from: "tool",
      to: "coin",
      count: 1,
    }),
  ).toMatchObject({ ok: false, error: { code: "PENDING_CHOICES" } });
});
it.each([true, false])(
  "split spade construction allows conversion, build=%s",
  (build) => {
    let s = actionState();
    s.board.buildings = { B4: { seat: "p1", kind: "workshop" } };
    s.players.p1.resources.tools = 0;
    s.players.p1.resources.power = [0, 0, 8];
    s = step(s, {
      kind: "powerAction",
      id: "spade",
      hex: "C5",
      terrain: "forest",
      build: false,
      deferBuild: true,
    });
    expect(s.board.terrain.C5).toBe("forest");
    expect(s.board.buildings.C5).toBeUndefined();
    const c = s.pending.find((c) => c.kind === "buildWorkshop")!;
    expect(
      step(s, { kind: "convert", from: "power", to: "tool", count: 1 }).pending,
    ).toEqual(s.pending);
    s = step(s, { kind: "convert", from: "power", to: "tool", count: 1 });
    s = step(s, {
      kind: "respond",
      choiceId: c.id,
      option: build ? "build" : "discard",
    });
    expect(!!s.board.buildings.C5).toBe(build);
    expect(s.players.p1.resources.tools).toBe(build ? 0 : 1);
    expect(s.players.p1.resources.coins).toBe(build ? 13 : 15);
    expect(s.players.p1.primaryDone).toBe(true);
  },
);
it("science rewards cannot use deferred building to bypass their construction ban", () => {
  const s = actionState();
  s.phase = "science";
  s.pending = [
    {
      id: "s",
      seat: "p1",
      kind: "spades",
      amount: 1,
      source: "round-science",
      options: ["terraform", "discard"],
      canBuild: false,
      canBuySpades: false,
      continuation: { kind: "resume-turn" },
    },
  ];
  expect(
    applyAction(s, "p1", {
      kind: "respond",
      choiceId: "s",
      option: "terraform",
      terraform: {
        hex: "C5",
        terrain: "forest",
        build: false,
        deferBuild: true,
      },
    }),
  ).toMatchObject({
    ok: false,
    error: { code: "CANNOT_BUILD_IN_SCIENCE_PHASE" },
  });
});
it("income sources match independent expected income and scholar supply caps", () => {
  const s = actionState(),
    p = s.players.p1;
  p.native = "mountain";
  p.faction = "omar";
  p.bonus = "power";
  p.science = [9, 9, 9, 9];
  p.resources = {
    coins: 0,
    tools: 0,
    scholars: 6,
    books: [0, 0, 0, 0],
    power: [12, 0, 0],
  };
  s.board.buildings = {
    A1: { seat: "p1", kind: "guild" },
    A2: { seat: "p1", kind: "school" },
    A3: { seat: "p1", kind: "university", neutral: true },
  };
  const rows = incomeSources(s, p);
  expect(rows.reduce((n, r) => n + (r.coins ?? 0), 0)).toBe(12);
  expect(rows.reduce((n, r) => n + (r.scholars ?? 0), 0)).toBe(4);
  giveIncome(s);
  expect(p.resources).toEqual({
    coins: 12,
    tools: 2, // Base tool + engineering 9.
    scholars: 7,
    books: [0, 0, 0, 0],
    power: [0, 11, 1],
  });
});
