import { test, expect } from "@playwright/test";
import { actionState } from "../../packages/rules/test/fixtures/actions";
import { createGame } from "../../packages/rules/src/state";
import { standardSetup } from "../../packages/rules/src/setup";
import { seededRandom } from "../../packages/rules/test/fixtures/players";
import { finishGame } from "../../packages/rules/src/scoring";

test("random book actions default to the visible action and unavailable choices stay disabled", async ({
  page,
}) => {
  const state = actionState();
  state.shared.bookActions = ["science", "coins", "upgrade"];
  state.players.p1.resources.books = [2, 0, 0, 0];
  await page.addInitScript(
    (state) => localStorage.setItem("boardgame-demo-v1", JSON.stringify(state)),
    state,
  );
  await page.goto("/#/demo");
  await page.getByRole("button", { name: "公共行动", exact: true }).click();
  await expect(page.getByLabel("书籍公共动作", { exact: true })).toHaveValue(
    "science",
  );
  await page.getByLabel("公共动作黄书").fill("1");
  await page.getByRole("button", { name: "执行书籍行动", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "确认提交", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "确认提交", exact: true }).click();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("boardgame-demo-v1")!),
  );
  expect(saved.players.p1.science[0]).toBe(state.players.p1.science[0] + 2);
  expect(saved.shared.usedActions).toContain("book:science");
});

test("five long player names fit a narrow mobile screen", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 780 });
  const state = createGame(
    standardSetup(
      "mobile-five",
      Array.from({ length: 5 }, (_, i) => ({
        id: String(i),
        name: "PlayerWithAVeryLongName" + i,
      })),
      seededRandom(9),
    ),
  );
  await page.addInitScript(
    (state) => localStorage.setItem("boardgame-demo-v1", JSON.stringify(state)),
    state,
  );
  await page.goto("/#/demo");
  await expect(page.locator(".player-chip")).toHaveCount(5);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
});

test("finished player cards show final totals and settings cannot submit new actions", async ({
  page,
}) => {
  const state = actionState();
  finishGame(state);
  await page.addInitScript(
    (state) => localStorage.setItem("boardgame-demo-v1", JSON.stringify(state)),
    state,
  );
  await page.goto("/#/demo");
  await expect(page.getByRole("heading", { name: "终局成绩" })).toBeVisible();
  for (const [i, player] of Object.values(state.players).entries()) {
    const total = state.scores.find(
      (score) => score.seat === player.seat,
    )!.total;
    await expect(page.locator(".player-chip .score").nth(i)).toHaveText(
      `${total} 分`,
    );
  }
  await page.getByText("自动蹭魔设置", { exact: true }).click();
  await expect(page.getByLabel("启用自动接受")).toBeDisabled();
  await expect(page.getByLabel("最多支付分数")).toBeDisabled();
});

test("an occupied default scholar slot falls back to an available position", async ({
  page,
}) => {
  const state = actionState();
  state.players.p1.resources.scholars = 1;
  state.shared.scholarSlots[0][0] = "p2";
  await page.addInitScript(
    (state) => localStorage.setItem("boardgame-demo-v1", JSON.stringify(state)),
    state,
  );
  await page.goto("/#/demo");
  await page.getByRole("button", { name: "研究", exact: true }).click();
  await expect(page.getByLabel("学者位置")).toHaveValue("1");
  await page.getByRole("button", { name: "派遣学者", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "确认提交", exact: true }),
  ).toBeVisible();
});

test("loading older history survives a later live refresh", async ({
  page,
}) => {
  const state = actionState();
  state.setup.id = "history-regression";
  state.revision = 110;
  const row = (revision: number) => ({
    revision,
    events: [{ kind: "test", text: `Saved action ${revision}` }],
  });
  let latest = 110;
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      json: { user: { id: "u1", name: "Player" }, csrf: "test" },
    }),
  );
  await page.route("**/api/games/history-regression/events", (route) =>
    route.fulfill({ contentType: "text/event-stream", body: ": test\n\n" }),
  );
  await page.route("**/api/games/history-regression", (route) =>
    route.fulfill({
      json: { state: { ...state, revision: latest }, seat: "p1" },
    }),
  );
  await page.route("**/api/games/history-regression/history*", (route) =>
    route.fulfill({
      json: route.request().url().includes("before=")
        ? Array.from({ length: 10 }, (_, i) => row(i + 1))
        : Array.from({ length: 100 }, (_, i) => row(latest - 99 + i)),
    }),
  );
  await page.goto("/#/game/history-regression");
  await page.locator(".history-panel > summary").click();
  await page.getByRole("button", { name: "载入更早记录", exact: true }).click();
  await expect(page.getByText("Saved action 1", { exact: true })).toBeVisible();
  latest++;
  const refreshed = page.waitForResponse((r) => r.url().endsWith("/history"));
  await page.evaluate(() =>
    window.dispatchEvent(new Event("visibilitychange")),
  );
  await refreshed;
  await expect(
    page.getByText("Saved action 111", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Saved action 1", { exact: true })).toBeVisible();
  await expect(page.locator(".history-row")).toHaveCount(111);
});
