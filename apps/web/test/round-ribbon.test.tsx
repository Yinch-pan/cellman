import React from "react";
import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RoundRibbon } from "../src/round-ribbon";
import { actionState } from "../../../packages/rules/test/fixtures/actions";
import { applyAction } from "../../../packages/rules/src/engine";
import { officialLarge } from "../../../packages/rules/src/map";

it.each([
  ["workshop", "工坊 +2 分"],
  ["guild", "公会 +3 分"],
  ["school", "学院 +4 分"],
  ["border", "地图边缘建造工坊 +3 分"],
])(
  "shows final-round bonus %s from setup even before round six",
  (id, text) => {
    const state = actionState();
    state.setup.roundTiles[5] = "workshop-law";
    state.setup.finalRoundTile = id;
    const html = renderToStaticMarkup(<RoundRibbon state={state} />);
    expect(html).toContain("工坊 +2 分");
    expect(html).toContain(text);
    expect(html.match(/额外计分 · 可叠加/g)).toHaveLength(1);
  },
);

it.each([
  [5, true, 2],
  [6, true, 5],
  [6, false, 2],
])(
  "round %i, border=%s: workshop action awards %i points",
  (round, border, expected) => {
    const state = actionState();
    state.round = round;
    state.setup.roundTiles[round - 1] = "workshop-law";
    state.setup.finalRoundTile = "border";
    const target = Object.values(officialLarge.hexes).find(
      (h) =>
        h.terrain !== "river" &&
        officialLarge.neighbors[h.id].length < 6 === border &&
        officialLarge.neighbors[h.id].some(
          (n) => officialLarge.hexes[n].terrain !== "river",
        ),
    )!;
    const origin = officialLarge.neighbors[target.id].find(
      (n) => officialLarge.hexes[n].terrain !== "river",
    )!;
    state.board.buildings = { [origin]: { seat: "p1", kind: "workshop" } };
    state.board.terrain[target.id] = state.players.p1.native;
    const before = state.players.p1.vp;
    const result = applyAction(state, "p1", {
      kind: "terraform",
      hex: target.id,
      terrain: state.players.p1.native,
      build: true,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.state.players.p1.vp - before).toBe(expected);
  },
);
