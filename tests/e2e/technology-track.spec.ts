import { test, expect } from "@playwright/test";
import { auditState } from "../../packages/rules/test/fixtures/content-audit";
import { replayRecord } from "../../packages/rules/src/replay";

for (const width of [1440, 390])
  test(`${width}px technology track previews, cancels and pays once`, async ({
    page,
  }, info) => {
    const state = auditState();
    state.players.p1.resources.coins = 11;
    state.players.p1.resources.scholars = 1;
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
    const player = page.locator(".player-chip").filter({ hasText: "甲（你）" });
    const advance = player.getByRole("button", {
      name: "提升航海等级到1级",
      exact: true,
    });
    await expect(advance).toBeEnabled();
    await advance.click();
    const preview = page.locator("#table-preview");
    await expect(preview).toBeVisible();
    expect(await saved()).toEqual(state);
    await preview
      .getByRole("button", { name: "返回修改", exact: true })
      .click();
    expect(await saved()).toEqual(state);
    await advance.click();
    await preview
      .getByRole("button", { name: "确认提交", exact: true })
      .dblclick();
    await expect.poll(async () => (await saved()).revision).toBe(1);
    const after = await saved();
    expect(after.players.p1.sailing).toBe(1);
    expect(after.players.p1.resources.coins).toBe(7);
    expect(after.players.p1.resources.scholars).toBe(0);
    expect(after.players.p1.resources.power).toEqual(
      state.players.p1.resources.power,
    );
    await expect(
      player.getByRole("button", { name: "提升航海等级到2级", exact: true }),
    ).toBeDisabled();
    await player.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath("technology-track.png") });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    const record = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("boardgame-demo-record")!),
    );
    expect(replayRecord(record).state).toEqual(after);
  });
