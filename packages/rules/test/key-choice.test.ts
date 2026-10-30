import { it, expect } from "vitest";
import { applyAction } from "../src/engine";
import { actionState } from "./fixtures/actions";
import { atomicActionSchema } from "../../contracts/src/game";
it("an explicit scholar key payment advances directly while older commands retain their choice", () => {
  const s = actionState();
  s.players.p1.science[1] = 7;
  s.players.p1.keys = 1;
  s.players.p1.resources.scholars = 1;
  const action = atomicActionSchema.parse({
    kind: "scholar",
    track: 1,
    slot: 1,
    useKey: true,
  });
  const r = applyAction(s, "p1", action);
  if (!r.ok) throw Error(r.error.code);
  expect(r.state.players.p1.science[1]).toBe(9);
  expect(r.state.players.p1.keysUsed).toBe(1);
  expect(r.state.players.p1.resources.scholars).toBe(0);
  expect(r.state.pending.some((c) => c.kind === "key")).toBe(false);
  const old = applyAction(s, "p1", { kind: "scholar", track: 1, slot: 1 });
  if (!old.ok) throw Error(old.error.code);
  expect(old.state.pending.some((c) => c.kind === "key")).toBe(true);
  s.rulesVersion = s.setup.rulesVersion = "aoi-1.1+2024-09.engine-6";
  expect(applyAction(s, "p1", action)).toMatchObject({
    ok: false,
    error: { code: "RULESET_UNAVAILABLE" },
  });
});
it.each(["use", "decline"])(
  "the player can %s a city key at science level 8 (p10)",
  (option) => {
    const s = actionState();
    const p = s.players.p1;
    p.science[0] = 6;
    p.keys = 1;
    p.resources.scholars = 1;
    const r = applyAction(s, "p1", { kind: "scholar", track: 0, slot: 0 });
    if (!r.ok) throw Error(r.error.code);
    expect(r.state.players.p1.science[0]).toBe(7);
    expect(r.state.players.p1.keysUsed).toBe(0);
    const choice = r.state.pending.find((c) => c.kind === "key")!;
    expect(choice).toBeDefined();
    const result = applyAction(JSON.parse(JSON.stringify(r.state)), "p1", {
      kind: "respond",
      choiceId: choice.id,
      option,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.players.p1.science[0]).toBe(option === "use" ? 9 : 7);
      expect(result.state.players.p1.keysUsed).toBe(option === "use" ? 1 : 0);
    }
  },
);
it("a key used during science income grants the newly reached income immediately (p24)", () => {
  const s = actionState();
  s.phase = "income";
  s.players.p1.science[0] = 7;
  s.players.p1.keys = 1;
  s.pending = [
    {
      id: "income",
      seat: "p1",
      kind: "science",
      amount: 2,
      options: ["0"],
      source: "income-tool-science",
      continuation: { kind: "resume-turn" },
    },
  ];
  const coins = s.players.p1.resources.coins;
  const r = applyAction(s, "p1", {
    kind: "respond",
    choiceId: "income",
    option: "0",
  });
  if (!r.ok) throw Error(r.error.code);
  expect(r.state.pending[0]?.kind).toBe("key");
  const d = applyAction(r.state, "p1", {
    kind: "respond",
    choiceId: r.state.pending[0].id,
    option: "use",
  });
  if (!d.ok) throw Error(d.error.code);
  expect(d.state.players.p1.resources.coins).toBe(coins + 3);
  expect(d.state.phase).toBe("actions");
});
