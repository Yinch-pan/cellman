import { describe, expect, it } from "vitest";
import { applyAction, getAvailableChoices } from "../src/engine";
import { groupBookChoices } from "../src/book-choice";
import { queueChoice } from "../src/responses";
import { actionState } from "./fixtures/actions";
import { atomicActionSchema } from "../../contracts/src/game";
import type { GameAction, GameState } from "../src/types";

function fixture() {
  const state = actionState();
  state.phase = "income";
  queueChoice(state, "p1", "book", 3, ["0", "1", "2", "3"], "income");
  return state;
}
function collect(
  state: GameState,
  colors: ("0" | "1" | "2" | "3")[],
): GameAction {
  return {
    kind: "collectBooks",
    selections: colors.map((option, i) => ({
      choiceId: state.pending[i].id,
      option,
    })),
  };
}
describe("atomic book allocation", () => {
  it("matches individual responses, preserves input and advances income only after the last book", () => {
    const state = fixture(),
      original = structuredClone(state);
    const action = collect(state, ["0", "2", "2"]);
    const result = applyAction(state, "p1", action);
    expect(result.ok).toBe(true);
    if (!result.ok || action.kind !== "collectBooks")
      throw Error("allocation failed");
    let sequential = state;
    const events = [];
    for (const selection of action.selections) {
      const next = applyAction(sequential, "p1", {
        kind: "respond",
        ...selection,
      });
      if (!next.ok) throw Error(next.error.code);
      sequential = next.state;
      events.push(...next.events);
    }
    expect(result.state).toEqual(sequential);
    expect(result.events).toEqual(events);
    expect(result.state.players.p1.resources.books).toEqual([1, 0, 2, 0]);
    expect(result.state.phase).toBe("actions");
    expect(result.state.pending).toHaveLength(0);
    expect(state).toEqual(original);
    const partial = applyAction(state, "p1", collect(state, ["1"]));
    expect(partial.ok && partial.state.phase).toBe("income");
    expect(partial.ok && partial.state.pending.length).toBe(2);
    expect(applyAction(result.state, "p1", action).ok).toBe(false);
  });
  it.each([
    "source",
    "batch",
    "triggerRevision",
    "seat",
    "kind",
    "options",
    "dependsOn",
  ] as const)("does not combine different or blocked %s", (field) => {
    const state = fixture();
    const second = state.pending[1];
    if (field === "triggerRevision") second.triggerRevision = 99;
    else if (field === "kind") second.kind = "science";
    else if (field === "seat") second.seat = "p2";
    else if (field === "options") second.options = ["0", "1"];
    else if (field === "dependsOn") second.dependsOn = [state.pending[0].id];
    else second[field] = "other";
    const before = structuredClone(state);
    expect(applyAction(state, "p1", collect(state, ["0", "1"])).ok).toBe(false);
    expect(state).toEqual(before);
    expect(groupBookChoices(getAvailableChoices(state), "p1")[0]).not.toContain(
      second,
    );
  });
  it("rejects duplicates, unavailable colors, empty selections, other seats and old engines", () => {
    const state = fixture();
    const first = { choiceId: state.pending[0].id, option: "0" as const };
    expect(
      applyAction(state, "p1", {
        kind: "collectBooks",
        selections: [first, first],
      }).ok,
    ).toBe(false);
    expect(applyAction(state, "p1", collect(state, [])).ok).toBe(false);
    expect(applyAction(state, "p2", collect(state, ["0"])).ok).toBe(false);
    state.pending[0].options = ["1"];
    expect(applyAction(state, "p1", collect(state, ["0"])).ok).toBe(false);
    state.rulesVersion = "aoi-1.1+2024-09.engine-5";
    expect(applyAction(state, "p1", collect(state, ["1"])).ok).toBe(false);
  });
  it("validates command payloads and caps their size", () => {
    const state = fixture();
    expect(
      atomicActionSchema.safeParse(collect(state, ["0", "3"])).success,
    ).toBe(true);
    expect(
      atomicActionSchema.safeParse({
        kind: "collectBooks",
        selections: [{ choiceId: "x", option: "4" }],
      }).success,
    ).toBe(false);
    expect(
      atomicActionSchema.safeParse({
        kind: "collectBooks",
        selections: Array(101).fill({ choiceId: "x", option: "0" }),
      }).success,
    ).toBe(false);
  });
});
