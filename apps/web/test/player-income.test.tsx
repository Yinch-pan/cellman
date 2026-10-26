import React from "react";
import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PlayerIncome } from "../src/player-income";
import { actionState } from "../../../packages/rules/test/fixtures/actions";
import { PlayerTechnology } from "../src/player-technology";
import { advanceTechnology } from "../../../packages/rules/src/technology";

it("totals income for the specified player, includes technologies and hides sources", () => {
  const state = actionState();
  const p = state.players.p2;
  p.bonus = "coins";
  p.science = [9, 9, 9, 9];
  p.sailing = 2;
  p.terraformLevel = 1;
  // p2 owns a guild: 2 coins + 1 power, plus BON10 and four science incomes.
  const html = renderToStaticMarkup(<PlayerIncome state={state} player={p} />);
  expect(html).toContain(`aria-label="${p.name}的收入与技术"`);
  const text = html.replace(/<[^>]*>/g, "");
  expect(text).toContain("金币 +11");
  expect(text).toContain("能量 +7");
  expect(text).toContain("工具 +1");
  expect(text).toContain("学者 +3");
  expect(text).toContain("书籍 +0");
  expect(text).toContain("航海等级 2");
  expect(text).toContain("铲子等级 1");
  expect(text).not.toContain("BON10");
  expect(html).not.toContain("<table");
  p.bonus = "power";
  expect(
    renderToStaticMarkup(<PlayerIncome state={state} player={p} />).replace(
      /<[^>]*>/g,
      "",
    ),
  ).toContain("金币 +7");
});

it("retains science and point income, without presenting constrained gross income as guaranteed", () => {
  const state = actionState();
  const p = state.players.p1;
  p.competencies = ["income-tool-science", "income-vp-coins"];
  const html = renderToStaticMarkup(<PlayerIncome state={state} player={p} />);
  const text = html.replace(/<[^>]*>/g, "");
  expect(text).toContain("科学 +1");
  expect(text).toContain("分数 +3");
  expect(html).toContain("受供应和容量限制");
});

it("does not promise another income after the final round or early game end", () => {
  const state = actionState();
  state.round = 6;
  for (const status of ["active", "finished"] as const) {
    state.status = status;
    if (status === "finished") state.round = 2;
    const html = renderToStaticMarkup(
      <PlayerIncome state={state} player={state.players.p1} />,
    );
    expect(html).toContain("本局不再发放轮次收入");
    expect(html).not.toContain("player-income-totals");
    expect(html).toContain("航海等级");
  }
});

it.each(["forest", "lake", "plains"] as const)(
  "technology tracks match %s limits and current levels",
  (native) => {
    const state = actionState();
    const p = state.players.p1;
    p.native = native;
    p.sailing = 0;
    p.terraformLevel = 0;
    p.resources.coins = 30;
    p.resources.tools = 10;
    p.resources.scholars = 7;
    let html = renderToStaticMarkup(<PlayerTechnology player={p} />);
    advanceTechnology(state, p, "terraform");
    expect(html).not.toContain("升级：");
    html = renderToStaticMarkup(<PlayerTechnology player={p} />);
    expect(html).toContain('aria-current="step" class="current"><b>1</b>');
    expect(html).toContain("每把铲子：2 工具");
    expect(html.match(/<li /g)).toHaveLength(native === "lake" ? 8 : 7);
    p.sailing = native === "lake" ? 4 : 3;
    p.terraformLevel = 2;
    html = renderToStaticMarkup(<PlayerTechnology player={p} />);
    expect(html.match(/已满级/g)).toHaveLength(2);
    expect(() => advanceTechnology(state, p, "sailing")).toThrow();
    expect(() => advanceTechnology(state, p, "terraform")).toThrow();
  },
);
