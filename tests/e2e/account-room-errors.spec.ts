import { test, expect } from "@playwright/test";

test("failed logout keeps the current account and displays a recoverable error", async ({
  page,
}) => {
  const uncaught: string[] = [];
  page.on("pageerror", (e) => uncaught.push(e.message));
  await page.route("**/api/auth/me", (r) =>
    r.fulfill({
      json: { user: { id: "u1", name: "TestPlayer" }, csrf: "test" },
    }),
  );
  await page.route("**/api/rooms", (r) => r.fulfill({ json: [] }));
  await page.route("**/api/me/games", (r) => r.fulfill({ json: [] }));
  await page.route("**/api/auth/logout", (r) =>
    r.fulfill({ status: 503, json: { error: "SERVER_ERROR" } }),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "TestPlayer · 退出", exact: true })
    .click();
  await expect(page.locator(".notice.error")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "TestPlayer · 退出", exact: true }),
  ).toBeEnabled();
  expect(uncaught).toEqual([]);
});

test("failed room leave stays in the room and permits retry", async ({
  page,
}) => {
  const room = {
    id: "leave-test",
    hostId: "u1",
    capacity: 4,
    setupMode: "standard",
    seats: [{ userId: "u1", displayName: "TestPlayer", ready: false }],
  };
  await page.route("**/api/auth/me", (r) =>
    r.fulfill({
      json: { user: { id: "u1", name: "TestPlayer" }, csrf: "test" },
    }),
  );
  await page.route("**/api/rooms/leave-test", (r) => r.fulfill({ json: room }));
  await page.route("**/api/rooms/leave-test/leave", (r) =>
    r.fulfill({ status: 503, json: { error: "SERVER_ERROR" } }),
  );
  await page.goto("/#/room/leave-test");
  await page.getByRole("button", { name: "离开房间", exact: true }).click();
  await expect(page.locator(".room-page .error")).toBeVisible();
  await expect(page).toHaveURL(/#\/room\/leave-test$/);
  await expect(
    page.getByRole("button", { name: "离开房间", exact: true }),
  ).toBeEnabled();
});

test("failed registration email enqueue keeps the form available for retry", async ({
  page,
}) => {
  await page.route("**/api/auth/me", (r) =>
    r.fulfill({ json: { user: null } }),
  );
  await page.route("**/api/auth/register", (r) =>
    r.fulfill({ status: 503, json: { error: "MAIL_DISABLED" } }),
  );
  await page.route("**/api/auth/mail-status", (r) =>
    r.fulfill({ json: { available: true } }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "创建账号", exact: true }).click();
  await page.getByLabel("用户名").fill("recoverytest");
  await page.getByLabel("密码", { exact: true }).fill("a-long-test-password");
  await page.getByLabel("邮箱", { exact: true }).fill("new@example.test");
  await page
    .getByRole("button", { name: "注册并发送验证邮件", exact: true })
    .click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.locator(".recovery-code")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "注册并发送验证邮件", exact: true }),
  ).toBeEnabled();
});
