import { test, expect } from "@playwright/test";
import { auditState } from "../../packages/rules/test/fixtures/content-audit";
import { replayRecord } from "../../packages/rules/src/replay";
import { bridgeLabel } from "../../apps/web/src/map-coordinates";
import { applyAction } from "../../packages/rules/src/engine";

for (const [width, reward] of [
  [1440, false],
  [390, false],
  [390, true],
] as const) {
  test(`${width}px ${reward ? "reward" : "public"} bridge: map selection, cancellation and atomic confirmation`, async ({
    page,
  }, info) => {
    let state = auditState();
    state.players.p1.resources.power = [0, 7, 4];
    if (reward) {
      state.players.p1.bonus = "bridge-bonus";
      const result = applyAction(state, "p1", {
        kind: "special",
        source: "bonus:bridge-bonus",
      });
      if (!result.ok) throw Error(result.error.code);
      state = result.state;
    }
    const pair = "B4:C3";
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript((s) => {
      localStorage.clear();
      localStorage.setItem("boardgame-demo-v1", JSON.stringify(s));
      localStorage.setItem("cellman-step-review", "off");
      localStorage.setItem("cellman-turn-planning", "off");
    }, state);
    await page.goto("/#/demo");
    const saved = () =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("boardgame-demo-v1")!),
      );
    const tile = page.locator('[data-table-action="power:bridge"]');
    const target = page
      .locator(".bridge-target")
      .filter({ has: page.locator("title", { hasText: bridgeLabel(pair) }) });
    if (!reward) {
      await tile.click();
      await expect(page.locator("#table-map-target")).toContainText(
        "选择高亮桥位",
      );
    }
    await target.click();
    const preview = page.locator("#table-preview");
    await expect(preview).toBeVisible();
    expect(await saved()).toEqual(state);
    await preview
      .getByRole("button", { name: "返回修改", exact: true })
      .click();
    if (!reward) {
      await expect(page.locator("#table-action-editor")).toHaveCount(0);
      await expect(page.locator(".bridge-target")).toHaveCount(0);
    }
    expect(await saved()).toEqual(state);
    if (!reward) await tile.click();
    await target.click();
    await preview.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath("bridge-map-preview.png") });
    await preview
      .getByRole("button", { name: "确认提交", exact: true })
      .dblclick();
    await expect
      .poll(async () => (await saved()).revision)
      .toBe(state.revision + 1);
    const after = await saved();
    expect(after.players.p1.resources.power).toEqual(
      reward ? [0, 7, 4] : [3, 7, 1],
    );
    expect(after.board.bridges).toHaveLength(state.board.bridges.length + 1);
    expect(
      after.shared.usedActions.filter((id: string) => id === "bridge"),
    ).toHaveLength(reward ? 0 : 1);
    const [a, b] = pair.split(":");
    expect(after.board.bridges.at(-1)).toEqual({ seat: "p1", a, b });
    const record = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("boardgame-demo-record")!),
    );
    expect(replayRecord(record).state).toEqual(after);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  });
}
