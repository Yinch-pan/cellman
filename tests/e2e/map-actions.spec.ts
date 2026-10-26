import { test, expect, type Page } from "@playwright/test";
import { actionState } from "../../packages/rules/test/fixtures/actions";
import type { GameState } from "../../packages/rules/src/types";

async function open(page: Page, state: GameState, planning = false) {
  await page.addInitScript(
    ({ state, planning }) => {
      localStorage.setItem("boardgame-demo-v1", JSON.stringify(state));
      localStorage.setItem("cellman-turn-planning", planning ? "on" : "off");
      localStorage.setItem("cellman-conversion-prompt", "never");
    },
    { state, planning },
  );
  await page.goto("/#/demo");
}
const saved = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("boardgame-demo-v1")!));

test("map upgrade previews beside the map, cancels safely and commits once", async ({
  page,
}, info) => {
  await open(page, actionState());
  await page.getByRole("button", { name: /^A1 / }).click();
  const panel = page.getByRole("region", { name: "地块操作" });
  const upgrade = panel.getByRole("button", { name: /^升级为公会/ });
  await expect(upgrade).toContainText("金币 15 → 12");
  await upgrade.click();
  await expect(panel.locator(".preview-changes")).toContainText("15 → 12");
  expect((await saved(page)).revision).toBe(0);
  await panel.getByRole("button", { name: "返回修改", exact: true }).click();
  await expect(upgrade).toBeVisible();
  await upgrade.click();
  await panel.screenshot({ path: info.outputPath("map-upgrade-confirm.png") });
  await panel.getByRole("button", { name: "确认提交", exact: true }).click();
  await expect(panel).toHaveCount(0);
  const after = await saved(page);
  expect(after.revision).toBe(1);
  expect(after.board.buildings.A1.kind).toBe("guild");
  expect(after.players.p1.resources.coins).toBe(12);
});

test("guild paths use the drafted SH code and show unavailable choices", async ({
  page,
}, info) => {
  const state = actionState();
  state.board.buildings.A1.kind = "guild";
  state.players.p1.draftPalace = "tools-special";
  await open(page, state);
  await page.getByRole("button", { name: /^A1 / }).click();
  const panel = page.getByRole("region", { name: "地块操作" });
  await expect(
    panel.getByRole("button", { name: /^升级为学院/ }),
  ).toBeEnabled();
  await expect(
    panel.getByRole("button", { name: /^升级为宫殿 · SH1/ }),
  ).toBeDisabled();
  await expect(panel).toContainText("资源不足");
  await panel.screenshot({ path: info.outputPath("map-upgrade-paths.png") });
  await panel.getByRole("button", { name: /^升级为学院/ }).click();
  await panel.getByRole("button", { name: "确认提交", exact: true }).click();
  expect(
    (await saved(page)).pending.some((c: any) => c.kind === "competency"),
  ).toBe(true);
});

test("mobile direct construction stays in view and remains private until turn submission", async ({
  page,
}, info) => {
  const state = actionState();
  state.board.buildings = { B4: { seat: "p1", kind: "workshop" } };
  state.board.terrain.C5 = "forest";
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, state, true);
  await page.getByRole("button", { name: /^C5 / }).click();
  const panel = page.getByRole("region", { name: "地块操作" });
  await panel.getByRole("button", { name: /^建造工坊/ }).click();
  const button = panel.getByRole("button", { name: "确认步骤", exact: true });
  await page
    .getByRole("navigation", { name: "对局快捷导航" })
    .getByRole("button", { name: "查看预览", exact: true })
    .click();
  await expect(button).toBeInViewport();
  const box = await button.boundingBox();
  const nav = await page.locator(".table-shortcuts").boundingBox();
  expect(box!.y + box!.height).toBeLessThan(nav!.y);
  await page.screenshot({ path: info.outputPath("map-build-mobile.png") });
  await button.click();
  expect((await saved(page)).board.buildings.C5).toBeUndefined();
  await expect(
    page.getByText("本回合试走 · 1 步", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "提交回合", exact: true }).click();
  await page.getByRole("button", { name: "确认提交", exact: true }).click();
  expect((await saved(page)).board.buildings.C5).toEqual({
    seat: "p1",
    kind: "workshop",
  });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});

test("opponents, unreachable sites, keyboard dismissal and detailed fallback", async ({
  page,
}) => {
  await open(page, actionState());
  const panel = page.getByRole("region", { name: "地块操作" });
  await page.getByRole("button", { name: /^B1 / }).focus();
  await page.keyboard.press("Enter");
  await expect(panel).toContainText("其他玩家的建筑");
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^B1 / })).toBeFocused();
  await page.getByRole("button", { name: /^I13 / }).click();
  await expect(
    panel.getByRole("button", { name: /^改造并建造工坊/ }),
  ).toBeDisabled();
  await expect(panel).toContainText("可达范围");
  await panel.getByRole("button", { name: /^详细设置/ }).click();
  await expect(panel).toHaveCount(0);
  await expect(page.getByLabel("地形改造目标")).toBeVisible();
  expect((await saved(page)).revision).toBe(0);
});

test("map palace keeps its fixed ID through confirmation", async ({ page }) => {
  const state = actionState();
  state.board.buildings = { B4: { seat: "p1", kind: "guild" } };
  state.players.p1.draftPalace = "tools-special";
  state.players.p1.resources.tools = 10;
  await open(page, state);
  await page.getByRole("button", { name: /^B4 / }).click();
  const panel = page.getByRole("region", { name: "地块操作" });
  await panel.getByRole("button", { name: /^升级为宫殿 · SH1/ }).click();
  await panel.getByRole("button", { name: "确认提交", exact: true }).click();
  expect((await saved(page)).players.p1.palace).toBe("tools-special");
});

test("SH15 with two opponents keeps the long confirmation inside the viewport", async ({
  page,
}, info) => {
  const state = actionState();
  state.board.buildings = {
    A6: { seat: "p1", kind: "guild" },
    A5: { seat: "p2", kind: "palace" },
    B6: { seat: "p3", kind: "workshop" },
  };
  state.players.p1.draftPalace = "engineering-palace";
  state.players.p1.resources.tools = 10;
  state.players.p1.name = "玩家甲：多项奖励与其他玩家响应";
  state.players.p2.name = "玩家乙：宫殿邻接响应";
  state.players.p3.name = "玩家丙：工坊邻接响应";
  await page.setViewportSize({ width: 1440, height: 1000 });
  await open(page, state);
  await page.getByRole("button", { name: /^A6 / }).click();
  const panel = page.getByRole("region", { name: "地块操作" });
  await panel.getByRole("button", { name: /^升级为宫殿 · SH15/ }).click();
  await expect(panel).toContainText("7 项奖励");
  const bounds = await panel.boundingBox();
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(1000);
  const confirm = panel.getByRole("button", { name: "确认提交", exact: true });
  await confirm.scrollIntoViewIfNeeded();
  await expect(confirm).toBeInViewport();
  await page.screenshot({ path: info.outputPath("SH15-long-preview.png") });
  await page.setViewportSize({ width: 1100, height: 600 });
  await expect
    .poll(async () => {
      const box = await panel.boundingBox();
      return box!.y + box!.height;
    })
    .toBeLessThanOrEqual(600);
  await confirm.click();
  expect((await saved(page)).players.p1.palace).toBe("engineering-palace");
});

test("map terraforming builds directly and does not leave an extra build prompt", async ({
  page,
}) => {
  const state = actionState();
  state.board.buildings = { B4: { seat: "p1", kind: "workshop" } };
  state.players.p1.resources.tools = 10;
  await open(page, state);
  await page.getByRole("button", { name: /^C5 / }).click();
  const panel = page.getByRole("region", { name: "地块操作" });
  await panel.getByRole("button", { name: /^改造并建造工坊/ }).click();
  await panel.getByRole("button", { name: "确认提交", exact: true }).click();
  const after = await saved(page);
  expect(after.board.terrain.C5).toBe("forest");
  expect(after.board.buildings.C5.kind).toBe("workshop");
  expect(after.pending.some((c: any) => c.kind === "buildWorkshop")).toBe(
    false,
  );
});

test("terraform-only preserves the later building decision when resources are short", async ({
  page,
}) => {
  const state = actionState();
  state.board.buildings = { B4: { seat: "p1", kind: "workshop" } };
  state.players.p1.resources.tools = 3;
  await open(page, state);
  await page.getByRole("button", { name: /^C5 / }).click();
  const panel = page.getByRole("region", { name: "地块操作" });
  await expect(
    panel.getByRole("button", { name: /^改造并建造工坊/ }),
  ).toBeDisabled();
  await panel.getByRole("button", { name: /^先改造地形/ }).click();
  await panel.getByRole("button", { name: "确认提交", exact: true }).click();
  const after = await saved(page);
  expect(after.board.terrain.C5).toBe("forest");
  expect(after.board.buildings.C5).toBeUndefined();
  expect(after.players.p1.resources.tools).toBe(0);
  expect(
    after.pending.some(
      (c: any) => c.kind === "buildWorkshop" && c.source === "C5",
    ),
  ).toBe(true);
  await expect(panel).toHaveCount(0);
});

test("selecting a river closes an unrelated land action preview", async ({
  page,
}) => {
  const state = actionState();
  state.players.p1.palace = "river-city";
  await open(page, state);
  await page.getByRole("button", { name: /^A1 / }).click();
  const panel = page.getByRole("region", { name: "地块操作" });
  await panel.getByRole("button", { name: /^升级为公会/ }).click();
  await page.getByRole("button", { name: /^A13 / }).click();
  await expect(panel).toHaveCount(0);
  await expect(page.locator(".preview-panel")).toHaveCount(0);
  expect((await saved(page)).revision).toBe(0);
});
