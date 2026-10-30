import { test, expect } from "@playwright/test";
import { actionState } from "../../packages/rules/test/fixtures/actions";
import { replayRecord } from "../../packages/rules/src/replay";
import { hexLabel } from "../../apps/web/src/map-coordinates";
import type { GameState } from "../../packages/rules/src/types";

for (const planning of [false, true]) {
  test(`palace choice follows neighbor response, planning=${planning}`, async ({
    page,
  }, info) => {
    const initial = actionState();
    initial.board.buildings.A1.kind = "guild";
    initial.players.p1.resources.tools = 8;
    initial.shared.palaces = ["engineering-palace", "immediate-score"];
    await page.setViewportSize({ width: 390, height: 900 });
    await page.addInitScript(
      ({ initial, planning }) => {
        if (localStorage.getItem("palace-sequence-fixture")) return;
        localStorage.clear();
        localStorage.setItem("palace-sequence-fixture", "ready");
        localStorage.setItem("boardgame-demo-v1", JSON.stringify(initial));
        localStorage.setItem("cellman-step-review", "off");
        localStorage.setItem("cellman-turn-planning", planning ? "on" : "off");
        localStorage.setItem("cellman-conversion-prompt", "never");
      },
      { initial, planning },
    );
    await page.goto("/#/demo");
    const saved = (): Promise<GameState> =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("boardgame-demo-v1")!),
      );
    await page
      .getByRole("button", { name: new RegExp(`^${hexLabel("A1")} `) })
      .click();
    const map = page.getByRole("region", { name: "地块操作" });
    await expect(map).toContainText("其他玩家处理蹭魔后再选择宫殿能力");
    await map.getByRole("button", { name: /^升级为宫殿/ }).click();
    // Map actions always retain their explicit confirmation.
    const confirmation = page.getByRole("button", {
      name: planning ? "确认步骤" : "确认提交",
      exact: true,
    });
    if (await confirmation.count()) await confirmation.click();
    if (planning) {
      await expect(
        page.getByRole("button", { name: "提交并等待回应", exact: true }),
      ).toBeEnabled();
      await page.reload();
      await page.getByRole("button", { name: "提交并等待回应", exact: true }).click();
      const publish = page.getByRole("button", {
        name: "确认提交",
        exact: true,
      });
      if (await publish.count()) await publish.click();
    }
    await expect.poll(async () => (await saved()).revision).toBe(1);
    let state = await saved();
    expect(state.board.buildings.A1.kind).toBe("palace");
    expect(state.players.p1.palace).toBeNull();
    expect(state.players.p1.resources.tools).toBe(4);
    await expect(
      page.getByRole("heading", { name: "选择宫殿能力", exact: true }),
    ).toHaveCount(0);
    const leech = state.pending.find((c) => c.kind === "leech")!;
    await page
      .locator(`[data-choice-id="${leech.id}"]`)
      .getByRole("button", { name: "放弃", exact: true })
      .click();
    await expect.poll(async () => (await saved()).revision).toBe(2);
    await expect(
      page.getByRole("heading", { name: "选择宫殿能力", exact: true }),
    ).toBeVisible();
    state = await saved();
    expect(state.activeSeat).toBe("p1");
    const choice = state.pending.find((c) => c.kind === "palace")!;
    const panel = page.locator(`[data-choice-id="${choice.id}"]`);
    await panel.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: info.outputPath("palace-choice-after-leech.png"),
    });
    await panel.getByRole("button", { name: /SH15/ }).click();
    if (!planning) {
      await expect.poll(async () => (await saved()).revision).toBe(3);
      expect((await saved()).players.p1.palace).toBe("engineering-palace");
    } else {
      expect((await saved()).revision).toBe(2);
      await expect(
        page.getByText("本回合试走 · 1 步", { exact: true }),
      ).toBeVisible();
      await page.reload();
    }
    await expect(
      page.getByRole("heading", { name: "选择宫殿能力", exact: true }),
    ).toHaveCount(0);
    await expect(page.getByText(/分配.*书/).first()).toBeVisible();
    const record = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("boardgame-demo-record")!),
    );
    expect(replayRecord(record).state).toEqual(await saved());
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
  });
}
