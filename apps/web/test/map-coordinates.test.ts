import { expect, it } from "vitest";
import { bridgeLabel, eventHexes, hexLabel } from "../src/map-coordinates";
import { officialLarge } from "../../../packages/rules/src/map";
import type { RuleEvent } from "../../../packages/rules/src/types";

it("matches the observed BGA land numbering without mutating stored IDs", () => {
  for (const [id, displayed] of [
    ["A1", "A1"],
    ["A3", "A2"],
    ["A4", "A3"],
    ["A6", "A5"],
    ["B4", "B2"],
    ["C5", "C4"],
    ["D5", "D4"],
    ["E3", "E3"],
    ["I13", "I12"],
  ])
    expect(hexLabel(id)).toBe(displayed);
  const ids = Object.keys(officialLarge.hexes);
  expect(new Set(ids.map(hexLabel)).size).toBe(ids.length);
  expect(officialLarge.hexes.B4.id).toBe("B4");
  expect(bridgeLabel("A3:B4")).toBe("A2 ↔ B2");
  expect(hexLabel("unknown")).toBe("unknown");
});

it("only reads structured action targets, including multi-spade and bridge endpoints", () => {
  const event: RuleEvent = {
    kind: "ledger",
    seat: "p1",
    text: "Player A1 says B4",
    details: {
      action: {
        kind: "respond",
        choiceId: "c1",
        option: "terraform",
        terraform: {
          hex: "C5",
          terrain: "forest",
          additional: [{ hex: "B4", terrain: "forest" }],
        },
      },
    },
  };
  expect(eventHexes(event)).toEqual(["C5", "B4"]);
  expect(eventHexes({ ...event, details: undefined })).toEqual([]);
  expect(
    eventHexes({
      ...event,
      details: { action: { kind: "respond", option: "A3:B4" } },
    }),
  ).toEqual(["A3", "B4"]);
  expect(
    eventHexes({
      ...event,
      details: { action: { kind: "respond", option: "0" } },
    }),
  ).toEqual([]);
});
