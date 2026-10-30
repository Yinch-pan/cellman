import { test, expect } from "@playwright/test";
import { actionState } from "../../packages/rules/test/fixtures/actions";
import { replayRecord } from "../../packages/rules/src/replay";
import type { GameState } from "../../packages/rules/src/types";

for (const planning of [false, true])
  for (const building of ["school", "university"] as const)
    test(`${building} waits for leech before FAV, planning=${planning}`, async ({
      page,
    }) => {
      const initial = actionState();
      initial.board.buildings.A1.kind =
        building === "school" ? "guild" : "school";
      initial.players.p1.resources.tools = 8;
      await page.setViewportSize({ width: 390, height: 900 });
      await page.addInitScript(
        ({ initial, planning }) => {
          if (localStorage.getItem("competency-sequence-fixture")) return;
          localStorage.clear();
          localStorage.setItem("competency-sequence-fixture", "ready");
          localStorage.setItem("boardgame-demo-v1", JSON.stringify(initial));
          localStorage.setItem(
            "cellman-turn-planning",
            planning ? "on" : "off",
          );
          localStorage.setItem("cellman-step-review", "off");
          localStorage.setItem("cellman-conversion-prompt", "never");
        },
        { initial, planning },
      );
      await page.goto("/#/demo");
      const saved = (): Promise<GameState> =>
        page.evaluate(() =>
          JSON.parse(localStorage.getItem("boardgame-demo-v1")!),
        );
      await page.getByRole("button", { name: /^A1 / }).click();
      await page
        .getByRole("region", { name: "地块操作" })
        .getByRole("button", {
          name: building === "school" ? /^升级为学院/ : /^升级为大学/,
        })
        .click();
      const review = page.getByRole("button", {
        name: planning ? "确认步骤" : "确认提交",
        exact: true,
      });
      if (await review.count()) await review.click();
      if (planning) {
        await page.reload();
        await page
          .getByRole("button", { name: "提交并等待回应", exact: true })
          .click();
        const publish = page.getByRole("button", {
          name: "确认提交",
          exact: true,
        });
        if (await publish.count()) await publish.click();
      }
      await expect.poll(async () => (await saved()).revision).toBe(1);
      const state = await saved();
      expect(state.players.p1.resources.tools).toBe(
        building === "school" ? 5 : 3,
      );
      expect(state.players.p1.resources.coins).toBe(
        initial.players.p1.resources.coins - (building === "school" ? 5 : 8),
      );
      expect(state.board.buildings.A1.kind).toBe(building);
      expect(state.players.p1.competencies).toEqual([]);
      const leech = state.pending.find((c) => c.kind === "leech")!;
      await page
        .locator(`[data-choice-id="${leech.id}"]`)
        .getByRole("button", { name: "放弃", exact: true })
        .click();
      await expect.poll(async () => (await saved()).revision).toBe(2);
      await page
        .getByRole("button", { name: "领取 FAV9", exact: true })
        .click();
      if (planning) {
        await expect(
          page.getByText("本回合试走 · 1 步", { exact: true }),
        ).toBeVisible();
        await page.reload();
        expect((await saved()).revision).toBe(2);
      } else {
        await expect.poll(async () => (await saved()).revision).toBe(3);
        expect((await saved()).players.p1.competencies).toHaveLength(1);
      }
      const record = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("boardgame-demo-record")!),
      );
      expect(replayRecord(record).state).toEqual(await saved());
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(390);
    });
