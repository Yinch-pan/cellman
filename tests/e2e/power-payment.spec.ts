import { test, expect } from "@playwright/test";
import { auditState } from "../../packages/rules/test/fixtures/content-audit";
import { replayRecord } from "../../packages/rules/src/replay";

for (const width of [1440, 390]) {
  test(`${width}px automatic burn: explicit quote, cancellation and one atomic payment`, async ({
    page,
  }, info) => {
    const state = auditState();
    state.players.p1.resources.power = [0, 10, 2];
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript((s) => {
      localStorage.setItem("boardgame-demo-v1", JSON.stringify(s));
      localStorage.setItem("cellman-step-review", "off");
      localStorage.setItem("cellman-turn-planning", "off");
    }, state);
    await page.goto("/#/demo");
    const saved = () =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("boardgame-demo-v1")!),
      );
    const tile = page.locator('[data-table-action="power:coins"]');
    await expect(tile).toContainText("需燃烧 2");
    await tile.click();
    const editor = page.locator("#table-action-editor");
    const player = page.locator(".player-chip").filter({ hasText: "甲（你）" });
    await expect(player.locator(".chip-bowls")).toHaveAttribute(
      "aria-label",
      /0 \/ 6 \/ 4/,
    );
    expect((await saved()).players.p1.resources.power).toEqual([0, 10, 2]);
    await expect(editor).toContainText("将燃烧 2");
    expect((await saved()).revision).toBe(0);
    await editor.getByRole("button", { name: "取消操作", exact: true }).click();
    await expect(player.locator(".chip-bowls")).toHaveAttribute(
      "aria-label",
      /0 \/ 10 \/ 2/,
    );
    expect((await saved()).players.p1.resources.power).toEqual([0, 10, 2]);
    await tile.click();
    await editor
      .getByRole("button", { name: "执行此行动", exact: true })
      .click();
    const preview = page.locator("#table-preview");
    await expect(preview).toContainText("将燃烧 2");
    expect((await saved()).revision).toBe(0);
    await preview
      .getByRole("button", { name: "返回修改", exact: true })
      .click();
    expect((await saved()).players.p1.resources.power).toEqual([0, 10, 2]);
    await editor
      .getByRole("button", { name: "执行此行动", exact: true })
      .click();
    await preview.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: info.outputPath("power-payment-confirm.png"),
    });
    await preview
      .getByRole("button", { name: "确认提交", exact: true })
      .click();
    await expect.poll(async () => (await saved()).revision).toBe(1);
    const after = await saved();
    expect(after.players.p1.resources.power).toEqual([4, 6, 0]);
    expect(after.players.p1.resources.coins).toBe(
      state.players.p1.resources.coins + 7,
    );
    expect(after.players.p1.primaryDone).toBe(true);
    const record = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("boardgame-demo-record")!),
    );
    expect(replayRecord(record).state).toEqual(after);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  });
}
