import { test, expect, type Page } from "@playwright/test";
import { auditState } from "../../packages/rules/test/fixtures/content-audit";
import { queueChoice } from "../../packages/rules/src/responses";
import { replayRecord } from "../../packages/rules/src/replay";

const saved = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("boardgame-demo-v1")!));
for (const width of [1440, 390]) {
  test(`${width}px book quantities: change, cancel, partial, atomic confirm and replay`, async ({
    page,
  }, info) => {
    const state = auditState();
    state.phase = "income";
    queueChoice(state, "p1", "book", 3, ["0", "1", "2", "3"], "income");
    queueChoice(
      state,
      "p1",
      "book",
      1,
      ["0", "1", "2", "3"],
      "setup-wasteland",
    );
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript((s) => {
      localStorage.setItem("boardgame-demo-v1", JSON.stringify(s));
      localStorage.setItem("cellman-step-review", "on");
      localStorage.setItem("cellman-turn-planning", "off");
    }, state);
    await page.goto("/#/demo");
    const panels = page.locator(".book-allocation");
    await expect(panels).toHaveCount(2);
    const group = panels.first();
    const yellow = group.getByRole("button", {
      name: "银行 / 黄",
      exact: true,
    });
    const blue = group.getByRole("button", { name: "法学 / 蓝", exact: true });
    const confirm = group.getByRole("button", {
      name: "确认提交",
      exact: true,
    });
    await expect(confirm).toBeDisabled();
    await yellow.click();
    await yellow.click();
    await group
      .getByRole("button", { name: "减少银行 / 黄", exact: true })
      .click();
    await expect(group.getByLabel("银行 / 黄数量", { exact: true })).toHaveText(
      "1",
    );
    await blue.click();
    expect((await saved(page)).revision).toBe(0);
    await group.getByRole("button", { name: "取消分配", exact: true }).click();
    await expect(confirm).toBeDisabled();
    expect((await saved(page)).players.p1.resources.books).toEqual([
      0, 0, 0, 0,
    ]);
    await yellow.click();
    await confirm.click();
    await expect.poll(async () => (await saved(page)).revision).toBe(1);
    expect((await saved(page)).pending).toHaveLength(3);
    await expect(group).toContainText("剩余 2");
    await blue.click();
    await blue.click();
    await expect(yellow).toBeDisabled();
    await expect(blue).toBeDisabled();
    await group.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: info.outputPath("book-allocation.png"),
      fullPage: false,
    });
    await confirm.click();
    await expect.poll(async () => (await saved(page)).revision).toBe(2);
    let current = await saved(page);
    expect(current.players.p1.resources.books).toEqual([1, 2, 0, 0]);
    expect(current.pending).toHaveLength(1);
    expect(current.pending[0].source).toBe("setup-wasteland");
    expect(current.phase).toBe("income");
    await panels
      .getByRole("button", { name: "工程 / 棕", exact: true })
      .click();
    await panels.getByRole("button", { name: "确认提交", exact: true }).click();
    await expect.poll(async () => (await saved(page)).revision).toBe(3);
    current = await saved(page);
    expect(current.players.p1.resources.books).toEqual([1, 2, 1, 0]);
    expect(current.phase).toBe("actions");
    const record = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("boardgame-demo-record")!),
    );
    expect(replayRecord(record).state).toEqual(current);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  });
}
