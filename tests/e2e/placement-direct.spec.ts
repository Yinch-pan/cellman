import { hexLabel } from "../../apps/web/src/map-coordinates";
import { test, expect } from "@playwright/test";
import { createGame } from "../../packages/rules/src/state";
import { sampleSetup } from "../../packages/rules/test/fixtures/setup";
import { applyAction } from "../../packages/rules/src/engine";
import { officialLarge } from "../../packages/rules/src/map";

for (const width of [1440, 390]) {
  test(`${width}px initial placement: map preview, change, cancel and confirm once`, async ({
    page,
  }, info) => {
    const state = createGame(sampleSetup());
    const seat = state.activeSeat;
    const legal = Object.keys(officialLarge.hexes).filter(
      (hex) => applyAction(state, seat, { kind: "place", hex }).ok,
    );
    expect(legal.length).toBeGreaterThan(1);
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript((s) => {
      localStorage.setItem("boardgame-demo-v1", JSON.stringify(s));
      localStorage.setItem("cellman-step-review", "off");
      localStorage.setItem("cellman-turn-planning", "off");
    }, state);
    await page.goto("/#/demo");
    const task = page.getByRole("region", { name: "当前行动" });
    await page
      .getByRole("button", { name: new RegExp(`^${hexLabel(legal[0])} `) })
      .click();
    await expect(
      task.getByRole("button", { name: "确认提交", exact: true }),
    ).toBeInViewport();
    await expect(task).toContainText(hexLabel(legal[0]));
    expect(
      await page.evaluate(
        () => JSON.parse(localStorage.getItem("boardgame-demo-v1")!).revision,
      ),
    ).toBe(0);
    await page
      .getByRole("button", { name: new RegExp(`^${hexLabel(legal[1])} `) })
      .click();
    await expect(task).toContainText(hexLabel(legal[1]));
    await task.getByRole("button", { name: "返回修改", exact: true }).click();
    await expect(page.locator("#table-preview")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: new RegExp(`^${hexLabel(legal[1])} `) }),
    ).toHaveAttribute("aria-pressed", "false");
    await page
      .getByRole("button", { name: new RegExp(`^${hexLabel(legal[0])} `) })
      .click();
    await page.screenshot({ path: info.outputPath("placement-confirm.png") });
    await task.getByRole("button", { name: "确认提交", exact: true }).click();
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("boardgame-demo-v1")!),
    );
    expect(saved.revision).toBe(1);
    expect(saved.board.buildings[legal[0]]).toMatchObject({
      seat,
      kind: "workshop",
    });
    expect(saved.board.buildings[legal[1]]).toBeUndefined();
    expect(saved.placementIndex).toBe(1);
    await expect(page.locator("#table-preview")).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  });
}
