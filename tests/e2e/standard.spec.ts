import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { replayGame } from "../../packages/rules/src/replay";
for (const count of [3, 4, 5])
  test(`${count}-player random draft survives refresh and exports a replay`, async ({
    page,
  }) => {
    await page.goto("/#/demo");
    await page.getByLabel("本地游玩人数").selectOption(String(count));
    await page
      .getByRole("button", { name: "新开随机对局", exact: true })
      .click();
    await expect(page.locator(".setup-option")).toHaveCount(7);
    for (let i = 0; i < count; i++) {
      await page.locator(".setup-option:not(:disabled)").first().click();
      await page.getByRole("button", { name: "确认提交", exact: true }).click();
      await expect(
        page.getByText(`局面版本 ${i + 1}`, { exact: true }),
      ).toBeVisible();
      if (i === 0) {
        await page.reload();
        await expect(page.locator(".setup-option:disabled")).toHaveCount(1);
      }
    }
    await expect(page.locator(".setup-options")).toHaveCount(0);
    await page.getByText(`行动记录 · ${count} 条`, { exact: true }).click();
    const downloaded = page.waitForEvent("download");
    await page.getByRole("button", { name: "导出对局记录" }).click();
    const file = await (await downloaded).path();
    const record = JSON.parse(readFileSync(file!, "utf8"));
    expect(record.commands).toHaveLength(count);
    const replay = replayGame(record.initial, record.commands);
    expect(replay.state.phase).toBe("placement");
    expect(Object.keys(replay.state.players)).toHaveLength(count);
  });
