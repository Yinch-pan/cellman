import { reviewContext } from "./review-context";
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { hexLabel } from "../../apps/web/src/map-coordinates";
import { label } from "../../apps/web/src/api";
const fixture = JSON.parse(
  readFileSync(
    new URL(
      "../../packages/rules/test/fixtures/six-round-baseline.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
test("local six-round UI matches the independently calculated scores", async ({
  page,
}) => {
  await page.goto("/#/demo");
  await page.getByRole("button", { name: "重新开始", exact: true }).click();
  for (const [, hex] of fixture.placements) {
    await page
      .locator('[role="button"][aria-label^="' + hexLabel(hex) + ' "]')
      .click();
    await page.getByRole("button", { name: "执行行动", exact: true }).click();
    await page.getByRole("button", { name: "确认提交", exact: true }).click();
  }
  for (let round = 1; round <= 6; round++) {
    for (let seat = 0; seat < 3; seat++) {
      await page.getByRole("button", { name: "轮次", exact: true }).click();
      const staged = !(await page.getByLabel("下一轮奖励").count());
      if (round < 6 && !staged)
        await page
          .getByLabel("下一轮奖励")
          .selectOption(fixture.bonuses[round - 1][seat]);
      await page.getByRole("button", { name: "结束本轮", exact: true }).click();
      await page.getByRole("button", { name: "确认提交", exact: true }).click();
      if (round < 6 && staged)
        await page
          .locator("[data-choice-id]")
          .getByRole("button", {
            name: new RegExp(
              "^" + label("bonus:" + fixture.bonuses[round - 1][seat]),
            ),
          })
          .click();
      if (staged)
        await page
          .getByRole("button", { name: "完成换轮", exact: true })
          .click();
      while (
        await page
          .getByRole("button", { name: "银行 / 黄", exact: true })
          .count()
      ) {
        await page
          .getByRole("button", { name: "银行 / 黄", exact: true })
          .first()
          .click();
        await page
          .getByRole("button", { name: "确认提交", exact: true })
          .click();
      }
    }
  }
  await expect(page.getByRole("heading", { name: "终局成绩" })).toBeVisible();
  await expect(page.locator(".final-scores")).toContainText(/你\s*73\s*分/);
  await expect(page.locator(".final-scores")).toContainText(/林间客\s*51\s*分/);
  await expect(page.locator(".final-scores")).toContainText(/远行者\s*53\s*分/);
  const finalState = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("boardgame-demo-v1")!),
  );
  expect(
    finalState.scores
      .map((score: { total: number }) => score.total)
      .sort((a: number, b: number) => a - b),
  ).toEqual([51, 53, 73]);
});
for (const viewport of [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
])
  test(`mobile ${viewport.width} selects, previews and saves without overflow`, async ({
    browser,
  }) => {
    const context = await reviewContext(browser, { viewport });
    const page = await context.newPage();
    await page.goto("/#/demo");
    const target = await page
      .getByRole("button", { name: "A1 森林" })
      .boundingBox();
    expect(target!.width).toBeGreaterThanOrEqual(44);
    await page.getByRole("button", { name: "A1 森林" }).click();
    await page.getByRole("button", { name: "执行行动", exact: true }).click();
    await page.getByRole("button", { name: "确认提交", exact: true }).click();
    await expect(page.getByText("局面版本 1", { exact: true })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.reload();
    await expect(page.getByText("局面版本 1", { exact: true })).toBeVisible();
    await expect(page.getByLabel("演示座位")).toHaveValue("p2");
    await context.close();
  });
