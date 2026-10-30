import { test, expect } from "@playwright/test";
import { auditState } from "../../packages/rules/test/fixtures/content-audit";
import { replayRecord } from "../../packages/rules/src/replay";

for (const width of [1440, 390])
  for (const planning of [false, true]) {
    test(`${width}px conversion batch planning=${planning}: chain, reset, cancel, confirm`, async ({
      page,
    }, info) => {
      const state = auditState();
      state.players.p1.resources.power = [0, 10, 2];
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript(
        ({ state, planning }) => {
          localStorage.setItem("boardgame-demo-v1", JSON.stringify(state));
          localStorage.setItem("cellman-step-review", "on");
          localStorage.setItem(
            "cellman-turn-planning",
            planning ? "on" : "off",
          );
        },
        { state, planning },
      );
      await page.goto("/#/demo");
      const saved = () =>
        page.evaluate(() =>
          JSON.parse(localStorage.getItem("boardgame-demo-v1")!),
        );
      await page.locator(".free-actions > summary").click();
      const open = page.getByRole("button", {
        name: "打开资源转换面板",
        exact: true,
      });
      await open.click();
      const dialog = page.getByRole("dialog", {
        name: "资源转换",
        exact: true,
      });
      const burn = dialog.getByRole("button", {
        name: "燃烧 1 魔力：II 碗 −2，III 碗 +1",
        exact: true,
      });
      const tool = dialog.getByRole("button", {
        name: "3 魔力 → 1 工具",
        exact: true,
      });
      const coin = dialog.getByRole("button", {
        name: "1 工具 → 1 金币",
        exact: true,
      });
      await expect(tool).toBeDisabled();
      await burn.click();
      await expect(tool).toBeEnabled();
      await tool.click();
      await coin.click();
      await expect(dialog.getByRole("status")).toContainText(
        "0 / 10 / 2 → 3 / 8 / 0",
      );
      await expect(dialog).toContainText("本批 3 步转换");
      expect((await saved()).revision).toBe(0);
      await dialog
        .getByRole("button", { name: "撤回一步", exact: true })
        .click();
      await expect(dialog).toContainText("本批 2 步转换");
      await dialog
        .getByRole("button", { name: "重置本批", exact: true })
        .click();
      await expect(dialog).toContainText("本批 0 步转换");
      await expect(tool).toBeDisabled();
      await burn.click();
      await dialog
        .getByRole("button", { name: "取消本批转换", exact: true })
        .click();
      await expect(dialog).toHaveCount(0);
      expect((await saved()).players.p1.resources.power).toEqual([0, 10, 2]);
      await open.click();
      await burn.click();
      await tool.click();
      await coin.click();
      await page.screenshot({ path: info.outputPath("conversion-batch.png") });
      await dialog
        .getByRole("button", { name: "完成转换", exact: true })
        .click();
      await expect(dialog).toHaveCount(0);
      const after = await saved();
      if (planning) {
        expect(after.revision).toBe(0);
        expect(after.players.p1.resources.power).toEqual([0, 10, 2]);
        await open.click();
        await expect(dialog.getByRole("status")).toContainText(
          "3 / 8 / 0 → 3 / 8 / 0",
        );
        await page.keyboard.press("Escape");
        await expect(dialog).toHaveCount(0);
      } else {
        expect(after.revision).toBe(1);
        expect(after.players.p1.resources.power).toEqual([3, 8, 0]);
        expect(after.players.p1.resources.coins).toBe(
          state.players.p1.resources.coins + 1,
        );
        expect(after.players.p1.primaryDone).toBe(false);
        const record = await page.evaluate(() =>
          JSON.parse(localStorage.getItem("boardgame-demo-record")!),
        );
        expect(replayRecord(record).state).toEqual(after);
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
    });
  }
