import { it, expect } from "vitest";
import {
  applyAction,
  getAvailableChoices,
  canYieldToLeech,
} from "../src/engine";
import { actionState } from "./fixtures/actions";
import { replayGame } from "../src/replay";
import type { GameState, GameAction } from "../src/types";
function fixture() {
  const s = actionState();
  s.board.buildings.A1.kind = "guild";
  s.players.p1.resources.tools = 8;
  s.shared.palaces = ["engineering-palace", "immediate-score", "city-discount"];
  return s;
}
function step(s: GameState, seat: string, action: GameAction) {
  const result = applyAction(s, seat, action);
  if (!result.ok) throw Error(result.error.code);
  return result.state;
}
const upgrade: GameAction = {
  kind: "upgrade",
  hex: "A1",
  to: "palace",
  deferPalace: true,
};
it("defers palace selection and rewards until every neighbor responds", () => {
  const initial = fixture();
  let s = step(initial, "p1", upgrade);
  expect(s.players.p1.palace).toBeNull();
  expect(s.players.p1.resources.tools).toBe(4);
  expect(s.players.p1.resources.coins).toBe(9);
  const palace = s.pending.find((c) => c.kind === "palace")!;
  expect(palace.options).toContain("engineering-palace");
  expect(getAvailableChoices(s).map((c) => c.kind)).toEqual(["leech"]);
  expect(
    applyAction(s, "p1", {
      kind: "respond",
      choiceId: palace.id,
      option: "engineering-palace",
    }),
  ).toMatchObject({ ok: false, error: { code: "WAIT_DEPENDENCY" } });
  expect(canYieldToLeech(s, "p1")).toBe(true);
  expect(applyAction(s, "p1", { kind: "endTurn" }).ok).toBe(false);
  const leech = s.pending.find((c) => c.kind === "leech")!;
  s = step(s, leech.seat, {
    kind: "respond",
    choiceId: leech.id,
    option: "accept",
  });
  expect(s.activeSeat).toBe("p1");
  expect(getAvailableChoices(s).map((c) => c.kind)).toEqual(["palace"]);
  const before = structuredClone(s);
  expect(
    applyAction(s, "p1", {
      kind: "respond",
      choiceId: palace.id,
      option: "missing",
    }).ok,
  ).toBe(false);
  expect(s).toEqual(before);
  s = step(s, "p1", {
    kind: "respond",
    choiceId: palace.id,
    option: "engineering-palace",
  });
  expect(s.players.p1.palace).toBe("engineering-palace");
  expect(s.pending.map((c) => c.kind).sort()).toEqual([
    "book",
    "book",
    "bridge",
    "bridge",
    "spades",
  ]);
  expect(s.shared.palaces).not.toContain("engineering-palace");
  expect(s.players.p1.resources.tools).toBe(4);
});
it("allows the new engineering palace's partial book and bridge rewards to interleave", () => {
  const initial = fixture();
  initial.players.p2.leechPolicy = {
    enabled: true,
    maxVpCost: 0,
    rejectPaid: true,
  };
  let s = step(initial, "p1", upgrade);
  const palace = s.pending.find((c) => c.kind === "palace")!;
  s = step(s, "p1", {
    kind: "respond",
    choiceId: palace.id,
    option: "engineering-palace",
  });
  const book = s.pending.find((c) => c.kind === "book")!;
  s = step(s, "p1", { kind: "respond", choiceId: book.id, option: "2" });
  expect(
    getAvailableChoices(s).filter((c) => c.kind === "bridge"),
  ).toHaveLength(2);
  expect(s.activeEffectBatch).toBeUndefined();
  const bridge = s.pending.find((c) => c.kind === "bridge")!;
  s = step(s, "p1", {
    kind: "respond",
    choiceId: bridge.id,
    option: "discard",
  });
  expect(getAvailableChoices(s).filter((c) => c.kind === "book")).toHaveLength(
    1,
  );
  expect(
    getAvailableChoices(s).filter((c) => c.kind === "spades"),
  ).toHaveLength(1);
  expect(s.players.p1.resources.books[2]).toBe(
    initial.players.p1.resources.books[2] + 1,
  );
});
it("allows final conversions before publication and resumes the builder after leech with exact replay", () => {
  const initial = fixture();
  const commands: { revision: number; seat: string; action: GameAction }[] = [];
  let s = initial;
  const run = (seat: string, action: GameAction) => {
    s = step(s, seat, action);
    s.revision = commands.length + 1;
    commands.push({ revision: s.revision, seat, action });
  };
  run("p1", {
    kind: "turn",
    actions: [
      upgrade as Extract<GameAction, { kind: "upgrade" }>,
      { kind: "convert", from: "tool", to: "coin", count: 1 },
    ],
  });
  expect(s.players.p1.resources).toMatchObject({ tools: 3, coins: 10 });
  const leech = s.pending.find((c) => c.kind === "leech")!;
  run(leech.seat, { kind: "respond", choiceId: leech.id, option: "decline" });
  const palace = s.pending.find((c) => c.kind === "palace")!;
  run("p1", {
    kind: "turn",
    actions: [
      { kind: "respond", choiceId: palace.id, option: "immediate-score" },
      { kind: "endTurn" },
    ],
  });
  expect(s.players.p1.vp).toBe(initial.players.p1.vp + 10);
  expect(s.activeSeat).toBe("p2");
  expect(replayGame(initial, commands).state).toEqual(s);
});
it("opens palace choice immediately when all leech is automatically handled", () => {
  const initial = fixture();
  initial.players.p2.leechPolicy = {
    enabled: true,
    maxVpCost: 0,
    rejectPaid: true,
  };
  const s = step(initial, "p1", upgrade);
  expect(getAvailableChoices(s).map((c) => c.kind)).toEqual(["palace"]);
  expect(canYieldToLeech(s, "p1")).toBe(false);
});
it("retains legacy combined upgrades and rejects the new deferred command in engine-6", () => {
  const s = fixture();
  s.rulesVersion = s.setup.rulesVersion = "aoi-1.1+2024-09.engine-6";
  expect(applyAction(s, "p1", upgrade)).toMatchObject({
    ok: false,
    error: { code: "RULESET_UNAVAILABLE" },
  });
  const n = step(s, "p1", {
    kind: "upgrade",
    hex: "A1",
    to: "palace",
    palace: "immediate-score",
  });
  expect(n.players.p1.palace).toBe("immediate-score");
  expect(n.pending.some((c) => c.kind === "palace")).toBe(false);
});

for (const to of ["school", "university"] as const)
  it(`${to} waits for leech before competency selection and replays the published interruption`, () => {
    const initial = fixture();
    initial.board.buildings.A1.kind = to === "school" ? "guild" : "school";
    const action: GameAction = {
      kind: "upgrade",
      hex: "A1",
      to,
      deferCompetency: true,
    };
    let s = step(initial, "p1", { kind: "turn", actions: [action] });
    s.revision = 1;
    expect(getAvailableChoices(s).map((c) => c.kind)).toEqual(["leech"]);
    expect(canYieldToLeech(s, "p1")).toBe(true);
    const ability = s.pending.find((c) => c.kind === "competency")!;
    const choose: GameAction = {
      kind: "respond",
      choiceId: ability.id,
      option: "annexes",
    };
    expect(applyAction(s, "p1", choose)).toMatchObject({
      ok: false,
      error: { code: "WAIT_DEPENDENCY" },
    });
    const leech = s.pending.find((c) => c.kind === "leech")!;
    const response: GameAction = {
      kind: "respond",
      choiceId: leech.id,
      option: "decline",
    };
    s = step(s, "p2", response);
    s.revision = 2;
    expect(getAvailableChoices(s).map((c) => c.kind)).toEqual(["competency"]);
    s = step(s, "p1", choose);
    s.revision = 3;
    expect(s.players.p1.annexes).toBe(2);
    expect(
      replayGame(initial, [
        {
          revision: 1,
          seat: "p1",
          action: { kind: "turn", actions: [action] },
        },
        { revision: 2, seat: "p2", action: response },
        { revision: 3, seat: "p1", action: choose },
      ]).state,
    ).toEqual(s);
    const old = structuredClone(initial);
    old.rulesVersion = old.setup.rulesVersion = "aoi-1.1+2024-09.engine-6";
    expect(applyAction(old, "p1", action)).toMatchObject({
      ok: false,
      error: { code: "RULESET_UNAVAILABLE" },
    });
    expect(
      applyAction(old, "p1", { ...action, deferCompetency: undefined }).ok,
    ).toBe(true);
  });
