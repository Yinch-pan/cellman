import { test, expect } from "@playwright/test";
import { createGame } from "../../packages/rules/src/state";
import { developmentSetup } from "../../packages/rules/src/preset";
import { defaultGameSettings } from "../../packages/contracts/src/room";
test("overtime gives a visible reminder without blocking the player's controls", async ({
  page,
}) => {
  const state = createGame(
    developmentSetup("clock-fixture", [
      { id: "1", name: "甲" },
      { id: "2", name: "乙" },
      { id: "3", name: "丙" },
    ]),
  );
  await page.route("**/api/auth/me", (r) =>
    r.fulfill({ json: { user: { id: "1", name: "甲" }, csrf: "test" } }),
  );
  await page.route("**/api/games/clock-fixture", (r) =>
    r.fulfill({
      json: {
        state,
        seat: "p1",
        settings: {
          ...defaultGameSettings(),
          time: { mode: "bank", minutes: 15 },
        },
        clock: {
          remaining: { p1: 1500, p2: 900000, p3: 900000 },
          running: ["p1"],
          paused: false,
        },
        undoRequests: [],
      },
    }),
  );
  await page.route("**/api/games/clock-fixture/history", (r) =>
    r.fulfill({ json: [] }),
  );
  await page.route("**/api/games/clock-fixture/events", (r) =>
    r.fulfill({ contentType: "text/event-stream", body: ": connected\n\n" }),
  );
  await page.goto("/#/game/clock-fixture");
  await expect(page.locator(".game-clock-panel [role=status]")).toContainText(
    "甲 已超时。可以继续等待",
  );
  await expect(page.getByLabel("甲 的计时")).toContainText("已超时");
  await expect(page.getByLabel("乙 的计时")).toContainText("15:00");
  await expect(page.locator(".control-column")).toBeEnabled();
  await page.getByRole("button", { name: "A1 森林" }).click();
  await expect(
    page.getByRole("button", { name: "执行行动", exact: true }),
  ).toBeEnabled();
});
