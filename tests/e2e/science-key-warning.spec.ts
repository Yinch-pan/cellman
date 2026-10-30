import { test, expect } from "@playwright/test";
import { auditState } from "../../packages/rules/test/fixtures/content-audit";
import { replayRecord } from "../../packages/rules/src/replay";

for (const [level, keys] of [
  [6, 0],
  [7, 0],
  [7, 1],
])
  test(`science ${level} with ${keys} keys confirms the actual outcome`, async ({
    page,
  }) => {
    const state = auditState();
    state.players.p1.science[2] = level;
    state.players.p1.keys = keys;
    state.players.p1.keysUsed = 0;
    state.players.p1.resources.scholars = 1;
    await page.setViewportSize({ width: 390, height: 900 });
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
    const slot = page
      .locator(".scholar-board > div")
      .nth(2)
      .getByRole("button")
      .nth(1);
    await slot.click();
    const preview = page.locator("#table-preview");
    await expect(preview).toContainText(
      keys ? "将使用 1 把城市钥匙" : "没有可用的城市钥匙",
    );
    expect(await saved()).toEqual(state);
    await preview
      .getByRole("button", { name: "返回修改", exact: true })
      .click();
    expect(await saved()).toEqual(state);
    await slot.click();
    await preview
      .getByRole("button", { name: "确认提交", exact: true })
      .dblclick();
    await expect.poll(async () => (await saved()).revision).toBe(1);
    const after = await saved();
    expect(after.players.p1.science[2]).toBe(keys ? 9 : 7);
    expect(after.players.p1.keysUsed).toBe(keys);
    expect(after.pending.some((c: { kind: string }) => c.kind === "key")).toBe(
      false,
    );
    expect(after.players.p1.resources.scholars).toBe(0);
    expect(after.shared.scholarSlots[2][1]).toBe("p1");
    const record = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("boardgame-demo-record")!),
    );
    expect(replayRecord(record).state).toEqual(after);
  });
