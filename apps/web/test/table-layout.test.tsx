import React from "react";
import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { actionState } from "../../../packages/rules/test/fixtures/actions";
import { takeCompetency } from "../../../packages/rules/src/actions/competency";
import { BoardActions } from "../src/board-actions";
import { CompetencyMarket } from "../src/competency-market";
import { buildingShapes, MapBuilding } from "../src/map-building";

it("keeps public power and book actions together before the innovation market", () => {
  const html = renderToStaticMarkup(
    <BoardActions
      state={actionState()}
      seat="p1"
      disabled={false}
      onPreview={() => {}}
      onIntent={() => {}}
    />,
  );
  expect(html.indexOf('id="table-public-actions"')).toBeLessThan(
    html.indexOf('id="table-book-actions"'),
  );
  expect(html.indexOf('id="table-book-actions"')).toBeLessThan(
    html.indexOf('id="table-innovations"'),
  );
  expect(html.match(/id="table-book-actions"/g)).toHaveLength(1);
});

it("keeps all FAV types visible and reflects acquisition, quantities and owners", () => {
  const state = actionState();
  const cell = state.shared.competencies.find(
    (c) => c.id === "income-vp-coins",
  )!;
  const before = cell.remaining;
  takeCompetency(state, state.players.p2, cell.id);
  const html = renderToStaticMarkup(
    <CompetencyMarket state={state} seat="p2" />,
  );
  expect(html.match(/class="competency-card"/g)).toHaveLength(
    state.shared.competencies.length,
  );
  expect(html).toContain(`剩余 ${before - 1} 块`);
  expect(html).toContain(`持有：${state.players.p2.name}`);
  expect(html).toContain('data-owned="true"');
  expect(html).toContain("FAV9");
});

it("draws a distinct silhouette for every building and preserves neutral and annex markings", () => {
  expect(
    new Set(Object.values(buildingShapes).map((s) => s.outline)).size,
  ).toBe(7);
  const html = renderToStaticMarkup(
    <svg>
      <MapBuilding kind="tower" color="#287444" neutral annex />
    </svg>,
  );
  expect(html).toContain('data-building="tower"');
  expect(html).toContain('fill="#f6f3e9"');
  expect(html).toContain('stroke="#287444"');
  expect(html).toContain('fill="#965791"');
  expect(html).not.toContain("building-letter");
});
