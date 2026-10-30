import { it, expect } from "vitest";
import { createGame } from "../src/state";
import { adjudicate, type LifecycleAction } from "../src/lifecycle";
import { replayRecord } from "../src/replay";
import { applyAction, getWaitingSeats } from "../src/engine";
import { sampleSetup } from "./fixtures/setup";

for (const version of [2, 3, 4, 5, 6])
  it(`engine ${version}: consent closes historical games without changing their board or engine`, () => {
    const state = createGame({
      ...sampleSetup(),
      rulesVersion: `aoi-1.1+2024-09.engine-${version}`,
    });
    const seats = Object.keys(state.players);
    const action: LifecycleAction = {
      kind: "adjudicate",
      reason: "consensus",
      at: "2026-10-27T00:00:00Z",
      consent: {
        requestId: "test",
        proposer: seats[0],
        approvedSeats: seats,
        reason: "test",
      },
    };
    for (const approvedSeats of [
      seats.slice(1),
      seats.map(() => seats[0]),
      [...seats.slice(1), "fake"],
    ])
      expect(() =>
        adjudicate(state, {
          ...action,
          consent: { ...action.consent!, approvedSeats },
        }),
      ).toThrow("INVALID_ADJUDICATION");
    const result = adjudicate(state, action);
    if (!result.ok) throw Error("adjudication");
    result.state.revision = 1;
    expect(result.state.board).toEqual(state.board);
    expect(result.state.players).toEqual(state.players);
    expect(result.state.rulesVersion).toBe(state.rulesVersion);
    expect(getWaitingSeats(result.state)).toEqual([]);
    expect(applyAction(result.state, seats[0], { kind: "endTurn" }).ok).toBe(
      false,
    );
    expect(
      replayRecord({
        initial: state,
        commands: [{ revision: 1, seat: seats[0], action }],
      }).state,
    ).toEqual(result.state);
  });
