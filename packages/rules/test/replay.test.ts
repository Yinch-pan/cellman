import { expect, it } from "vitest";
import { createGame } from "../src/state";
import { developmentSetup } from "../src/preset";
import { applyAction } from "../src/engine";
import { replayGame } from "../src/replay";

it("replays ordered commands and rejects missing or invalid revisions", () => {
  const initial = createGame(
    developmentSetup(
      "replay",
      [1, 2, 3].map((id) => ({ id: String(id), name: String(id) })),
    ),
  );
  const commands = [
    { revision: 1, seat: "p1", action: { kind: "place" as const, hex: "A1" } },
  ];
  const result = replayGame(initial, commands);
  expect(result.state.board.buildings.A1).toEqual({
    seat: "p1",
    kind: "workshop",
  });
  expect(result.state.revision).toBe(1);
  expect(initial.board.buildings).toEqual({});
  expect(() => replayGame(initial, [{ ...commands[0], revision: 2 }])).toThrow(
    "REPLAY_GAP",
  );
  expect(() => replayGame(initial, [{ ...commands[0], seat: "p2" }])).toThrow(
    "NOT_YOUR_TURN",
  );
});

it("records a human-readable action and exact resource changes for all affected players", () => {
  const initial = createGame(
    developmentSetup(
      "ledger",
      [1, 2, 3].map((id) => ({ id: String(id), name: String(id) })),
    ),
  );
  initial.phase = "actions";
  const result = applyAction(initial, "p1", {
    kind: "convert",
    from: "tool",
    to: "coin",
    count: 1,
  });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  const entry = result.events.find((e) => e.kind === "ledger");
  expect(entry?.text).toContain("资源转换");
  expect(entry?.details?.changes).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        seat: "p1",
        field: "coins",
        before: 15,
        after: 16,
        delta: 1,
      }),
      expect.objectContaining({
        seat: "p1",
        field: "tools",
        before: 3,
        after: 2,
        delta: -1,
      }),
    ]),
  );
});
