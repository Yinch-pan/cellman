import { expect, it } from "vitest";
import { applyAction } from "../src/engine";
import { actionState } from "./fixtures/actions";
import { queueChoice } from "../src/responses";
import { createGame } from "../src/state";
import { sampleSetup } from "./fixtures/setup";
import { standardSetup, snakeSetup, draftOptions } from "../src/setup";

it("new games accept free leech by default and frozen engine-6 keeps manual responses", () => {
  const current = createGame(sampleSetup());
  expect(current.players.p1.leechPolicy).toEqual({
    enabled: true,
    maxVpCost: 0,
  });
  const old = createGame({
    ...sampleSetup(),
    rulesVersion: "aoi-1.1+2024-09.engine-6",
  });
  expect(old.players.p1.leechPolicy).toEqual({ enabled: false, maxVpCost: 0 });
});

it.each(["standard", "draft"])(
  "preserves a player's leech preference through %s setup",
  (mode) => {
    const players = [1, 2, 3].map((n) => ({ id: `p${n}`, name: `P${n}` }));
    let s = createGame(
      mode === "standard"
        ? standardSetup("leech-setup", players, () => 0.41)
        : snakeSetup("leech-draft", players, "reverse", () => 0.41),
    );
    const set = applyAction(s, "p1", {
      kind: "setLeech",
      enabled: true,
      maxVpCost: 0,
      rejectPaid: true,
    });
    if (!set.ok) throw Error(set.error.code);
    s = set.state;
    for (let guard = 0; s.phase === "draft" && guard < 15; guard++) {
      const seat = s.activeSeat;
      const category = (["faction", "native", "palace", "bonus"] as const).find(
        (c) => draftOptions(s, seat, c).length,
      )!;
      const action =
        mode === "standard"
          ? {
              kind: "chooseSetup" as const,
              offer: s.setup.offers!.findIndex(
                (_, i) => !s.chosenOffers!.includes(i),
              ),
            }
          : {
              kind: "draftPick" as const,
              category,
              option: draftOptions(s, seat, category)[0],
            };
      const result = applyAction(s, seat, action);
      if (!result.ok) throw Error(result.error.code);
      s = result.state;
    }
    expect(s.phase).toBe("placement");
    expect(s.players.p1.leechPolicy).toEqual({
      enabled: true,
      maxVpCost: 0,
      rejectPaid: true,
    });
  },
);

it("reject-paid policy declines paid offers without moving resources or VP and keeps unrelated choices", () => {
  const s = actionState();
  queueChoice(s, "p2", "leech", 3, ["accept", "decline"], "A1");
  queueChoice(s, "p2", "book", 1, ["0", "1", "2", "3"], "test");
  const before = structuredClone(s);
  const r = applyAction(s, "p2", {
    kind: "setLeech",
    enabled: true,
    maxVpCost: 3,
    rejectPaid: true,
  });
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(r.state.players.p2.resources).toEqual(s.players.p2.resources);
  expect(r.state.players.p2.vp).toBe(s.players.p2.vp);
  expect(r.state.pending.map((c) => c.kind)).toEqual(["book"]);
  expect(r.state.activeSeat).toBe(s.activeSeat);
  expect(
    r.events.some((e) => e.details?.declined && e.details?.automatic),
  ).toBe(true);
  expect(s).toEqual(before);
});

it.each(["one", "capacity", "vp"])(
  "reject-paid policy accepts an actually free offer (%s)",
  (scenario) => {
    const s = actionState();
    if (scenario === "capacity") s.players.p2.resources.power = [0, 1, 11];
    if (scenario === "vp") s.players.p2.vp = 0;
    queueChoice(
      s,
      "p2",
      "leech",
      scenario === "one" ? 1 : 3,
      ["accept", "decline"],
      "A1",
    );
    const r = applyAction(s, "p2", {
      kind: "setLeech",
      enabled: true,
      maxVpCost: 0,
      rejectPaid: true,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.pending).toEqual([]);
    expect(r.state.players.p2.vp).toBe(s.players.p2.vp);
    expect(r.state.players.p2.resources.power).not.toEqual(
      s.players.p2.resources.power,
    );
  },
);

it("disabled policy leaves paid choices pending and old engines reject unsupported policy changes", () => {
  const s = actionState();
  queueChoice(s, "p2", "leech", 3, ["accept", "decline"], "A1");
  const action = {
    kind: "setLeech",
    enabled: false,
    maxVpCost: 0,
    rejectPaid: true,
  } as const;
  const r = applyAction(s, "p2", action);
  expect(r.ok && r.state.pending).toEqual(s.pending);
  s.rulesVersion = s.setup.rulesVersion = "aoi-1.1+2024-09.engine-6";
  expect(applyAction(s, "p2", action)).toMatchObject({
    ok: false,
    error: { code: "RULESET_UNAVAILABLE" },
  });
});
