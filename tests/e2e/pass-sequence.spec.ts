import { test, expect } from "@playwright/test";
import { actionState } from "../../packages/rules/test/fixtures/actions";
import { replayRecord } from "../../packages/rules/src/replay";
import { label } from "../../apps/web/src/api";
import type { GameState } from "../../packages/rules/src/types";

for (const planning of [false, true])
  for (const reminder of ["always", "never"])
    test(`pass confirms before bonus, restores after reload and finishes once, planning=${planning}, reminder=${reminder}`, async ({
      page,
    }, info) => {
      const initial = actionState();
      initial.shared.bonusCoins.bigbuilding = 2;
      await page.setViewportSize({ width: 390, height: 900 });
      await page.addInitScript(
        ({ initial, planning, reminder }) => {
          if (localStorage.getItem("pass-sequence-fixture")) return;
          localStorage.clear();
          localStorage.setItem("pass-sequence-fixture", "ready");
          localStorage.setItem("boardgame-demo-v1", JSON.stringify(initial));
          localStorage.setItem("cellman-step-review", "off");
          localStorage.setItem(
            "cellman-turn-planning",
            planning ? "on" : "off",
          );
          localStorage.setItem("cellman-conversion-prompt", reminder);
        },
        { initial, planning, reminder },
      );
      const saved = (): Promise<GameState> =>
        page.evaluate(() =>
          JSON.parse(localStorage.getItem("boardgame-demo-v1")!),
        );
      await page.goto("/#/demo");
      await page.getByRole("button", { name: "轮次", exact: true }).click();
      await expect(page.getByLabel("下一轮奖励", { exact: true })).toHaveCount(
        0,
      );
      await page.getByRole("button", { name: "结束本轮", exact: true }).click();
      const preview = page.locator("#table-preview");
      await expect(preview.locator(".pass-review")).toBeVisible();
      expect(await saved()).toEqual(initial);
      await preview
        .getByRole("button", { name: "返回修改", exact: true })
        .click();
      expect(await saved()).toEqual(initial);
      await page.getByRole("button", { name: "结束本轮", exact: true }).click();
      await preview
        .getByRole("button", {
          name: planning ? "确认步骤" : "确认提交",
          exact: true,
        })
        .click();
      await page.reload();
      await expect(
        page.getByRole("heading", { name: "选择下一轮奖励板", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "完成换轮", exact: true }),
      ).toHaveCount(0);
      const bonus = page.locator("[data-choice-id]").filter({
        has: page.getByRole("heading", {
          name: "选择下一轮奖励板",
          exact: true,
        }),
      });
      await bonus.scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath("pass-bonus-choice.png") });
      await bonus
        .getByRole("button", {
          name: new RegExp("^" + label("bonus:bigbuilding")),
        })
        .click();
      if (reminder === "always") {
        await expect(
          page.getByRole("heading", {
            name: "结束本轮前的资源转换",
            exact: true,
          }),
        ).toBeVisible();
        await page
          .getByRole("button", { name: "完成换轮", exact: true })
          .click();
      } else {
        await expect(
          page.getByRole("button", { name: "完成换轮", exact: true }),
        ).toHaveCount(0);
      }
      if (planning) {
        expect(await saved()).toEqual(initial);
        await page
          .getByRole("button", { name: "提交回合", exact: true })
          .click();
        const publish = page.getByRole("button", {
          name: "确认提交",
          exact: true,
        });
        if (await publish.count()) await publish.click();
      }
      await expect
        .poll(async () => (await saved()).revision)
        .toBe(planning ? 1 : 3);
      const after = await saved();
      expect(after.activeSeat).toBe("p2");
      expect(after.passOrder).toEqual(["p1"]);
      expect(after.players.p1.resources.coins).toBe(
        initial.players.p1.resources.coins + 2,
      );
      expect(after.players.p1.bonus).toBe("bigbuilding");
      const record = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("boardgame-demo-record")!),
      );
      expect(replayRecord(record).state).toEqual(after);
    });
