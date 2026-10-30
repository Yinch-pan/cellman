import { expect, it } from "vitest";
import { auditState } from "./fixtures/content-audit";
import { applyAction, applyTurn, getAvailableChoices } from "../src/engine";
import { replayGame } from "../src/replay";
import { atomicActionSchema } from "../../contracts/src/game";
import type { GameAction, GameState } from "../src/types";

function fixture() {
  const s = auditState();
  s.players.p1.resources.power = [0, 0, 12];
  return s;
}
const first: GameAction = {
  kind: "powerAction",
  id: "spades",
  hex: "C5",
  terrain: "forest",
  build: false,
  deferBuild: true,
  deferSpades: true,
};
function step(s: GameState, action: GameAction) {
  const r = applyAction(s, "p1", action);
  if (!r.ok) throw Error(r.error.code);
  return r.state;
}
it("retains the paid surplus and blocks building until that surplus is resolved", () => {
  const initial = fixture();
  const s = step(initial, first);
  expect(s.board.terrain.C5).toBe("forest");
  expect(s.board.buildings.C5).toBeUndefined();
  expect(s.players.p1.resources.power).toEqual([6, 0, 6]);
  expect(s.players.p1.resources.tools).toBe(initial.players.p1.resources.tools);
  expect(getAvailableChoices(s).map((c) => c.kind)).toEqual(["spades"]);
  const surplus = s.pending.find((c) => c.kind === "spades")!;
  const build = s.pending.find((c) => c.kind === "buildWorkshop")!;
  expect(surplus).toMatchObject({
    amount: 1,
    canBuild: false,
    canBuySpades: false,
  });
  expect(build.dependsOn).toEqual([surplus.id]);
  expect(
    applyAction(s, "p1", {
      kind: "respond",
      choiceId: build.id,
      option: "build",
    }),
  ).toMatchObject({ ok: false, error: { code: "WAIT_DEPENDENCY" } });
  expect(applyAction(s, "p1", first).ok).toBe(false);
  expect(applyAction(s, "p1", { kind: "endTurn" }).ok).toBe(false);
});
it.each(["C5", "B5"])(
  "builds once on chosen transformed terrain %s, with exact replay",
  (buildHex) => {
    const initial = fixture();
    let s = initial;
    const commands: { revision: number; seat: string; action: GameAction }[] =
      [];
    const run = (a: GameAction) => {
      s = step(s, a);
      s.revision = commands.length + 1;
      commands.push({ revision: s.revision, seat: "p1", action: a });
    };
    run(first);
    const surplus = s.pending.find((c) => c.kind === "spades")!;
    const build = s.pending.find((c) => c.kind === "buildWorkshop")!;
    run({
      kind: "respond",
      choiceId: surplus.id,
      option: "terraform",
      terraform: { hex: "B5", terrain: "forest", build: false },
    });
    expect(s.board.terrain).toMatchObject({ C5: "forest", B5: "forest" });
    expect(s.pending.map((c) => c.kind)).toEqual(["buildWorkshop"]);
    expect(s.players.p1.resources.power).toEqual([6, 0, 6]);
    expect(s.pending[0].buildHexes).toEqual(["C5", "B5"]);
    expect(
      applyAction(s, "p1", {
        kind: "respond",
        choiceId: build.id,
        option: "build",
        buildHex: "A5",
      }).ok,
    ).toBe(false);
    const action: GameAction = {
      kind: "respond",
      choiceId: build.id,
      option: "build",
      buildHex,
    };
    expect(atomicActionSchema.parse(action)).toEqual(action);
    run(action);
    expect(s.board.buildings[buildHex].kind).toBe("workshop");
    expect(s.board.buildings[buildHex === "C5" ? "B5" : "C5"]).toBeUndefined();
    expect(applyAction(s, "p1", action)).toMatchObject({
      ok: false,
      error: { code: "STALE_CHOICE" },
    });
    expect(s.players.p1.resources.tools).toBe(
      initial.players.p1.resources.tools - 1,
    );
    expect(s.players.p1.resources.coins).toBe(
      initial.players.p1.resources.coins - 2,
    );
    expect(replayGame(initial, commands).state).toEqual(s);
  },
);
it("rejects building, paid extra spades and special travel during the surplus", () => {
  const s = step(fixture(), first);
  const c = s.pending.find((c) => c.kind === "spades")!;
  for (const terraform of [
    { hex: "B5", terrain: "forest" as const, build: true },
    { hex: "B5", terrain: "forest" as const, build: false, deferBuild: true },
    { hex: "A5", terrain: "forest" as const, build: false },
    {
      hex: "B5",
      terrain: "forest" as const,
      build: false,
      travel: "flight" as const,
    },
  ])
    expect(
      applyAction(s, "p1", {
        kind: "respond",
        choiceId: c.id,
        option: "terraform",
        terraform,
      }).ok,
    ).toBe(false);
  expect(s.players.p1.resources.power).toEqual([6, 0, 6]);
});
it("commits both terrains and the second-site building in one private turn", () => {
  const initial = fixture();
  const a = step(initial, first);
  const surplus = a.pending.find((c) => c.kind === "spades")!;
  const build = a.pending.find((c) => c.kind === "buildWorkshop")!;
  const actions: Exclude<GameAction, { kind: "turn" }>[] = [
    first,
    {
      kind: "respond",
      choiceId: surplus.id,
      option: "terraform",
      terraform: { hex: "B5", terrain: "forest", build: false },
    },
    { kind: "respond", choiceId: build.id, option: "build", buildHex: "B5" },
    { kind: "endTurn" },
  ];
  const r = applyTurn(initial, "p1", actions);
  if (!r.ok) throw Error(r.error.code);
  expect(r.state.board.buildings.B5.kind).toBe("workshop");
  expect(r.state.board.buildings.C5).toBeUndefined();
  expect(r.state.players.p1.resources.power).toEqual([6, 0, 6]);
  expect(r.state.activeSeat).toBe("p2");
  expect(initial.board.terrain.C5).not.toBe("forest");
  expect(
    r.events.find(
      (e) =>
        e.kind === "ledger" && (e.details?.action as any)?.buildHex === "B5",
    )?.details?.choiceSource,
  ).toBe("B5");
});
it("discarding the surplus preserves terrain and the independent build choice at zero resources", () => {
  const initial = fixture();
  initial.players.p1.resources.tools = initial.players.p1.resources.coins = 0;
  let s = step(initial, first);
  const c = s.pending.find((c) => c.kind === "spades")!;
  s = step(s, { kind: "respond", choiceId: c.id, option: "discard" });
  expect(s.board.terrain.C5).toBe("forest");
  const build = getAvailableChoices(s)[0];
  expect(build.kind).toBe("buildWorkshop");
  expect(
    applyAction(s, "p1", {
      kind: "respond",
      choiceId: build.id,
      option: "build",
    }).ok,
  ).toBe(false);
  s = step(s, { kind: "respond", choiceId: build.id, option: "discard" });
  expect(s.pending).toEqual([]);
  expect(s.board.buildings.C5).toBeUndefined();
});
it("retains the flag in commands and leaves earlier combined commands unchanged", () => {
  expect(atomicActionSchema.parse(first)).toMatchObject({ deferSpades: true });
  const initial = fixture();
  expect(
    step(initial, { ...first, deferSpades: undefined }).pending.map(
      (c) => c.kind,
    ),
  ).toEqual(["buildWorkshop"]);
  initial.rulesVersion = initial.setup.rulesVersion =
    "aoi-1.1+2024-09.engine-6";
  expect(applyAction(initial, "p1", first)).toMatchObject({
    ok: false,
    error: { code: "RULESET_UNAVAILABLE" },
  });
});
