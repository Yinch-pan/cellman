import { test, expect } from "@playwright/test";
import { actionState } from "../../packages/rules/test/fixtures/actions";
import type { GameState } from "../../packages/rules/src/types";
import { replayRecord } from "../../packages/rules/src/replay";

for (const palace of [false, true])
  test(`innovation quote, cancellation and mixed payment, palace=${palace}`, async ({
    page,
  }) => {
    const initial = actionState();
    initial.players.p1.resources.books = [5, 0, 1, 0];
    initial.players.p1.resources.coins = 7;
    if (palace) {
      initial.players.p1.palace = "engineering-palace";
      initial.board.buildings.A1.kind = "palace";
    }
    initial.setup.innovations = ["colleges"];
    initial.setup.innovationCosts = { colleges: [2, 0, 0, 0] };
    initial.shared.innovations = ["colleges"];
    await page.setViewportSize({ width: 390, height: 900 });
    await page.addInitScript((initial) => {
      if (localStorage.getItem("innovation-sequence-fixture")) return;
      localStorage.clear();
      localStorage.setItem("innovation-sequence-fixture", "ready");
      localStorage.setItem("boardgame-demo-v1", JSON.stringify(initial));
      localStorage.setItem("cellman-step-review", "off");
      localStorage.setItem("cellman-turn-planning", "off");
      localStorage.setItem("cellman-conversion-prompt", "always");
    }, initial);
    await page.goto("/#/demo");
    const saved = (): Promise<GameState> =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("boardgame-demo-v1")!),
      );
    const card = page.locator('[data-table-action="innovation:colleges"]');
    const editor = page.locator("#table-innovations #table-action-editor");
    const next = () =>
      editor
        .getByRole("button", { name: "继续选择支付书籍", exact: true })
        .click();
    await card.click();
    await expect(editor.getByRole("spinbutton")).toHaveCount(0);
    expect(await saved()).toEqual(initial);
    await next();
    const fields = editor.getByRole("spinbutton");
    await expect(fields.nth(0)).toHaveValue("2");
    await expect(
      editor.getByRole("button", { name: "执行此行动", exact: true }),
    ).toBeDisabled();
    await fields.nth(0).fill("4");
    await fields.nth(2).fill("1");
    await editor.getByRole("button", { name: "取消操作", exact: true }).click();
    expect(await saved()).toEqual(initial);
    await card.click();
    await next();
    await expect(fields.nth(0)).toHaveValue("2");
    await expect(fields.nth(2)).toHaveValue("0");
    // Removing a required-colour book must leave payment unavailable.
    await fields.nth(0).fill("1");
    await fields.nth(2).fill("1");
    await expect(
      editor.getByRole("button", { name: "执行此行动", exact: true }),
    ).toBeDisabled();
    await fields.nth(0).fill("4");
    await expect(
      editor.getByRole("button", { name: /^增加/ }).nth(0),
    ).toBeDisabled();
    await editor.screenshot({
      path: `work/acceptance/bga-20261028/local-innovation-payment-palace-${palace}-390.png`,
    });
    await editor
      .getByRole("button", { name: "执行此行动", exact: true })
      .click();
    await expect
      .poll(async () => (await saved()).revision)
      .toBe(initial.revision + 1);
    const result = await saved();
    expect(result.players.p1.resources.books).toEqual([1, 0, 0, 0]);
    expect(result.players.p1.resources.coins).toBe(palace ? 7 : 2);
    expect(result.players.p1.innovations).toEqual(["colleges"]);
    expect(result.shared.innovations).toEqual([]);
    expect(result.players.p1.vp).toBe(initial.players.p1.vp);
    await page.reload();
    expect(await saved()).toEqual(result);
    const record = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("boardgame-demo-record")!),
    );
    expect(replayRecord(record).state).toEqual(result);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
  });
