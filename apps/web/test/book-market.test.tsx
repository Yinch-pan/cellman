import React from "react";
import { it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BookMarket } from "../src/book-market";
import { actionState } from "../../../packages/rules/test/fixtures/actions";

it("shows this game's public book actions separately, including spent actions", () => {
  const state = actionState();
  state.shared.bookActions = ["power", "science", "guild-score"];
  state.shared.usedActions = ["book:science"];
  const html = renderToStaticMarkup(
    <BookMarket state={state} seat="p1" disabled={false} onIntent={() => {}} />,
  );
  const publicSection = html.split('id="table-innovations"')[0];
  expect(publicSection).toContain("公共书籍行动");
  expect(publicSection.match(/public-book-card/g)).toHaveLength(3);
  expect(publicSection).toContain("1 本书 → 5 能量");
  expect(publicSection).toContain("2 本书 → 每公会 2 分");
  expect(publicSection).toMatch(/data-used="true"[^>]*disabled=""/);
  expect(publicSection).toContain("本轮已使用");
});

it("keeps acquired innovations visible and shows exact colored requirements and player-specific costs", () => {
  const state = actionState();
  state.setup.innovations = ["architecture", "sewerage"];
  state.setup.innovationCosts = {
    architecture: [2, 2, 0, 0],
    sewerage: [0, 0, 2, 0],
  };
  state.shared.innovations = ["architecture"];
  state.players.p2.innovations = ["sewerage"];
  const p = state.players.p1;
  p.innovations = ["libraries"];
  p.native = "wasteland";
  const render = () =>
    renderToStaticMarkup(
      <BookMarket
        state={state}
        seat="p1"
        disabled={false}
        onIntent={() => {}}
      />,
    );
  let html = render();
  expect(html.match(/class="board-tile innovation-card"/g)).toHaveLength(2);
  expect(html).toContain(`已由 ${state.players.p2.name} 获取`);
  expect(html).toContain("费用：5 本书、5 金币");
  expect(html).toMatch(/book0[^>]*>黄.*×2/);
  expect(html).toMatch(/book1[^>]*>蓝.*×2/);
  p.native = "forest";
  p.palace = "tools-special";
  html = render();
  expect(html).toContain("费用：6 本书、0 金币");
});
