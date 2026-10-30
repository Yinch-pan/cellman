import { hexLabel } from "../../apps/web/src/map-coordinates";
import { test, expect } from "@playwright/test";
import { actionState } from "../../packages/rules/test/fixtures/actions";

test("mobile shortcuts preserve selected target and explain unavailable building actions", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(
    (s) => localStorage.setItem("boardgame-demo-v1", JSON.stringify(s)),
    actionState(),
  );
  await page.goto("/#/demo");
  const home = page.getByRole("button", { name: /^A1 森林/ });
  await home.click();
  await expect(home).toHaveAttribute("aria-pressed", "true");
  await expect(home).toHaveAccessibleName(/甲的工坊/);
  await page
    .getByRole("navigation", { name: "对局快捷导航" })
    .getByRole("button", { name: "操作", exact: true })
    .click();
  await expect(page.locator(".selected-target")).toBeInViewport();
  await expect(page.locator(".selected-target")).toContainText("A1");
  await expect(
    page.getByRole("button", { name: "改造与建造", exact: true }),
  ).toBeDisabled();
  await expect(page.getByLabel("升级为")).toHaveValue("guild");
  expect(
    await page.getByLabel("升级为").locator("option").allTextContents(),
  ).toEqual(["公会"]);
  await page.getByRole("button", { name: "升级建筑", exact: true }).click();
  await expect(page.locator(".preview-changes")).toContainText("15 →");
  await expect(page.locator(".pending-preview")).toContainText(
    "乙：决定是否获得",
  );
  const shortcuts = page.getByRole("navigation", { name: "对局快捷导航" });
  await shortcuts
    .getByRole("button", { name: "查看预览", exact: true })
    .click();
  await expect(page.locator(".preview-panel")).toBeInViewport();
  const confirmBox = await page
    .getByRole("button", { name: "确认提交", exact: true })
    .boundingBox();
  const navigationBox = await shortcuts.boundingBox();
  expect(confirmBox!.y).toBeGreaterThanOrEqual(0);
  expect(confirmBox!.y + confirmBox!.height).toBeLessThan(navigationBox!.y);
  await page.getByRole("button", { name: "返回修改", exact: true }).click();
  await page
    .getByRole("navigation", { name: "对局快捷导航" })
    .getByRole("button", { name: "地图", exact: true })
    .click();
  await page.getByRole("button", { name: new RegExp(`^${hexLabel("B1")} `) }).click();
  await page
    .getByRole("navigation", { name: "对局快捷导航" })
    .getByRole("button", { name: "操作", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "升级建筑", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".action-hint")).toContainText(
    "不能升级其他玩家的建筑",
  );
  await page
    .getByRole("navigation", { name: "对局快捷导航" })
    .getByRole("button", { name: "记录", exact: true })
    .click();
  await expect(page.locator(".history-panel")).toHaveAttribute("open", "");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  const targetHeight = await page
    .getByRole("navigation", { name: "对局快捷导航" })
    .getByRole("button", { name: "操作", exact: true })
    .boundingBox();
  expect(targetHeight!.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: info.outputPath("mobile-shortcuts.png") });
});

test("offline status stops new submissions, reconnect restores controls, and guide is keyboard accessible", async ({
  page,
  context,
}) => {
  const state = actionState();
  state.setup.id = "usability";
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({ json: { user: { id: "u1", name: "玩家" }, csrf: "test" } }),
  );
  await page.route("**/api/games/usability", (route) =>
    route.fulfill({ json: { state, seat: "p1" } }),
  );
  await page.route("**/api/watch/usability", (route) =>
    route.fulfill({ json: { state, memberSeat: "p1" } }),
  );
  await page.route("**/api/games/usability/history", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route("**/api/games/usability/events", (route) =>
    route.fulfill({ contentType: "text/event-stream", body: ": test\n\n" }),
  );
  await page.goto("/#/game/usability");
  await page.getByRole("button", { name: /^A1 森林/ }).click();
  await expect(
    page.getByRole("button", { name: "升级建筑", exact: true }),
  ).toBeEnabled();
  await context.setOffline(true);
  await expect(page.locator(".connection-status")).toContainText("离线");
  await expect(
    page.getByRole("button", { name: "升级建筑", exact: true }),
  ).toBeDisabled();
  await context.setOffline(false);
  await expect(page.locator(".connection-status")).not.toContainText("离线");
  await expect(
    page.getByRole("button", { name: "升级建筑", exact: true }),
  ).toBeEnabled();
  await page.locator(".table-help summary").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".table-help")).toHaveAttribute("open", "");
  await expect(page.locator(".table-help")).toContainText("每 5 金币计 1 分");
});
