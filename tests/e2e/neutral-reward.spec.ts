import { test, expect } from "@playwright/test";
import { actionState } from "../../packages/rules/test/fixtures/actions";
import { officialLarge } from "../../packages/rules/src/map";
import { queueNeutral } from "../../packages/rules/src/actions/neutral";
import { replayRecord } from "../../packages/rules/src/replay";

for (const width of [1440, 390]) {
  test(`${width}px neutral reward survives insufficient resources, conversion and reload`, async ({
    page,
  }) => {
    const s = actionState();
    s.board.buildings = { B4: { seat: "p1", kind: "school" } };
    s.board.terrain = Object.fromEntries(
      Object.values(officialLarge.hexes)
        .filter((h) => h.terrain !== "river")
        .map((h) => [h.id, "mountain" as const]),
    );
    s.players.p1.resources.tools = 0;
    s.players.p1.resources.scholars = 1;
    s.players.p1.resources.power = [0, 0, 6];
    s.players.p1.primaryDone = true;
    queueNeutral(s, s.players.p1, "tower", "competency");
    const id = s.pending[0].id;
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript((state) => {
      if (!localStorage.getItem("boardgame-demo-v1"))
        localStorage.setItem("boardgame-demo-v1", JSON.stringify(state));
      localStorage.setItem("cellman-step-review", "off");
      localStorage.setItem("cellman-turn-planning", "off");
    }, s);
    await page.goto("/#/demo");
    const saved = () =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("boardgame-demo-v1")!),
      );
    const pending = page.locator(`[data-choice-id="${id}"]`);
    await expect(pending).toContainText("当前没有能支付改造费用的可达空地");
    await pending.getByRole("button", { name: /放弃/ }).click();
    await expect(
      page.getByRole("button", { name: "确认提交", exact: true }),
    ).toBeVisible();
    expect((await saved()).revision).toBe(0);
    await page.getByRole("button", { name: "返回修改", exact: true }).click();
    await expect(pending).toBeVisible();
    if (
      !(await page
        .getByRole("button", { name: "打开资源转换面板", exact: true })
        .isVisible())
    )
      await page.locator(".free-actions > summary").click();
    await page
      .getByRole("button", { name: "打开资源转换面板", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "资源转换", exact: true });
    await dialog
      .getByRole("button", { name: "1 学者 → 1 工具", exact: true })
      .click();
    await dialog
      .getByRole("button", { name: "3 魔力 → 1 工具", exact: true })
      .click();
    await dialog
      .getByRole("button", { name: "3 魔力 → 1 工具", exact: true })
      .click();
    await dialog.getByRole("button", { name: "完成转换", exact: true }).click();
    await expect.poll(async () => (await saved()).revision).toBe(1);
    expect((await saved()).pending[0].options).toContain("C5");
    await page.reload();
    await expect(pending).toBeVisible();
    await page.getByRole("button", { name: /^C4 / }).click();
    await pending.getByRole("button", { name: /C4/ }).click();
    await expect.poll(async () => (await saved()).revision).toBe(2);
    const final = await saved();
    expect(final.board.buildings.C5).toEqual({
      seat: "p1",
      kind: "tower",
      neutral: true,
    });
    expect(final.players.p1.resources.tools).toBe(0);
    expect(final.pending).toEqual([]);
    const record = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("boardgame-demo-record")!),
    );
    expect(replayRecord(record).state).toEqual(final);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: `work/acceptance/bga-20261028/local-neutral-conversion-${width}.png`,
    });
  });
}
