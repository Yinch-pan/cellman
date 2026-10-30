import { test, expect } from "@playwright/test";
import { createGame } from "../../packages/rules/src/state";
import { applyAction } from "../../packages/rules/src/engine";
import { sampleSetup } from "../../packages/rules/test/fixtures/setup";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

for (const width of [1440, 390])
  test(`${width}px BGA coordinates: stored target, preview and log location`, async ({
    page,
  }) => {
    const initial = createGame(sampleSetup());
    const action = { kind: "place", hex: "B4" } as const;
    const moved = applyAction(initial, initial.activeSeat, action);
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    moved.state.revision = 1;
    await page.setViewportSize({ width, height: 1000 });
    await page.addInitScript(
      ({ initial, state, action }) => {
        localStorage.setItem("boardgame-demo-v1", JSON.stringify(state));
        localStorage.setItem(
          "boardgame-demo-record",
          JSON.stringify({
            initial,
            commands: [{ revision: 1, seat: initial.activeSeat, action }],
            revision: 1,
          }),
        );
        localStorage.setItem("cellman-turn-planning", "off");
      },
      { initial, state: moved.state, action },
    );
    await page.goto("/#/demo");
    const hex = page.locator('[data-hex="B4"]');
    await expect(hex).toHaveAccessibleName(/^B2 森林/);
    await expect(hex.locator(".hex-id")).toHaveText("B2");
    await page.locator("details.history-panel > summary").click();
    await page
      .getByRole("button", { name: "在地图定位 B2", exact: true })
      .click();
    await expect(hex).toHaveAttribute("data-located", "true");
    await expect(hex).toBeInViewport();
    await expect(hex).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator("#table-preview")).toHaveCount(0);
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("boardgame-demo-v1")!),
    );
    expect(saved.revision).toBe(1);
    expect(saved.board.buildings.B4).toBeDefined();
    expect(saved.board.buildings.B2).toBeUndefined();
    mkdirSync(resolve("work/acceptance/bga-20261028"), { recursive: true });
    await page.screenshot({
      path: resolve(
        `work/acceptance/bga-20261028/local-log-coordinate-${width}.png`,
      ),
    });
    await page.getByRole("button", { name: "清除定位", exact: true }).click();
    await expect(hex).not.toHaveAttribute("data-located", "true");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  });
