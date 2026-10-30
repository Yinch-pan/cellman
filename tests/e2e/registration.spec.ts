import { test, expect } from "@playwright/test";
import { Pool } from "pg";

test("new users verify a required email, can correct it, and only then log in", async ({
  browser,
}) => {
  test.setTimeout(120000);
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const inboxContext = await browser.newContext();
  const page = await context.newPage(),
    inbox = await inboxContext.newPage();
  const db = new Pool({
    connectionString: process.env.TEST_DATABASE_URL,
    options: `-c search_path=${process.env.E2E_SCHEMA}`,
  });
  const username = "signup" + Date.now().toString(36),
    password = "abc123";
  const email = username + "@example.test",
    corrected = "fixed-" + email;
  const origin = `http://127.0.0.1:${process.env.E2E_WEB_PORT ?? 5174}`;
  async function deliveredLink(destination: string) {
    let message: { text: string } | undefined;
    await expect
      .poll(
        async () => {
          message = (
            await db.query(
              "SELECT message FROM test_mail_deliveries WHERE message->>'to'=$1 AND message->>'subject'='cellman · 确认注册' ORDER BY created_at DESC LIMIT 1",
              [destination],
            )
          ).rows[0]?.message;
          return !!message;
        },
        { timeout: 25000 },
      )
      .toBe(true);
    return message!.text.match(/http[^\s]+/)![0];
  }
  try {
    await page.clock.install();
    await page.goto(origin);
    await page.getByRole("button", { name: "创建账号", exact: true }).click();
    await page.getByLabel("用户名", { exact: true }).fill(username);
    await page.getByLabel("密码", { exact: true }).fill(password);
    await page.getByRole("button", { name: "注册并发送验证邮件" }).click();
    await expect(
      page.getByRole("heading", { name: "注册", exact: true }),
    ).toBeVisible();
    expect(
      await page
        .getByLabel("邮箱", { exact: true })
        .evaluate((e: HTMLInputElement) => e.validity.valueMissing),
    ).toBe(true);
    await page.getByLabel("邮箱", { exact: true }).fill(email);
    await page.getByRole("button", { name: "注册并发送验证邮件" }).click();
    await expect(
      page.getByRole("heading", { name: "请验证邮箱" }),
    ).toBeVisible();
    expect(
      (await (await page.request.get(origin + "/api/auth/me")).json()).user,
    ).toBeNull();
    const blocked = await page.request.post(origin + "/api/auth/login", {
      headers: { origin },
      data: { username, password },
    });
    expect(blocked.status()).toBe(403);
    expect((await blocked.json()).error).toBe("REGISTRATION_PENDING");
    expect((await page.request.get(origin + "/api/rooms")).status()).toBe(401);
    const oldLink = await deliveredLink(email);
    await page.getByRole("button", { name: "修改邮箱" }).click();
    await page.getByLabel("邮箱", { exact: true }).fill(corrected);
    await db.query(
      "UPDATE email_attempts SET created_at=now()-interval '2 minutes' WHERE user_id=(SELECT id FROM accounts WHERE username=$1)",
      [username],
    );
    await page.clock.runFor(61000);
    await page
      .getByRole("button", { name: "发送验证邮件", exact: true })
      .click();
    await expect(
      page.getByText("验证邮箱：" + corrected, { exact: true }),
    ).toBeVisible();
    await inbox.goto(oldLink);
    await inbox.getByRole("button", { name: "确认注册", exact: true }).click();
    await expect(inbox.getByRole("alert")).toContainText("链接已过期");
    const link = await deliveredLink(corrected);
    await inbox.goto(link);
    await expect(inbox).not.toHaveURL(/token=/);
    await inbox.getByRole("button", { name: "确认注册", exact: true }).click();
    await expect(
      inbox.getByText("邮箱验证成功，注册已完成。请返回登录。", {
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "返回登录", exact: true }).click();
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "游戏大厅", exact: true }),
    ).toBeVisible();
    await page.goto(origin + "/#/account");
    await expect(
      page.getByText("已验证：" + corrected, { exact: true }),
    ).toBeVisible();
    await inbox.goto(link);
    await inbox.getByRole("button", { name: "确认注册", exact: true }).click();
    await expect(inbox.getByRole("alert")).toContainText("链接已过期");
  } finally {
    await db.end();
    await context.close();
    await inboxContext.close();
  }
});

test("registration always shows required email and disables submission without mail service", async ({
  page,
}) => {
  await page.route("**/api/auth/mail-status", (r) =>
    r.fulfill({ json: { available: false } }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "创建账号", exact: true }).click();
  await expect(page.getByLabel("邮箱", { exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("邮件服务尚未启用");
  await expect(
    page.getByRole("button", { name: "注册并发送验证邮件" }),
  ).toBeDisabled();
});

test("a pending user can resume verification after reloading and attempting login", async ({
  page,
}) => {
  await page.route("**/api/auth/login", (r) =>
    r.fulfill({ status: 403, json: { error: "REGISTRATION_PENDING" } }),
  );
  await page.goto("/");
  await page.getByLabel("用户名或已验证邮箱").fill("waitinguser");
  await page.getByLabel("密码", { exact: true }).fill("abc123");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.getByRole("heading", { name: "请验证邮箱" })).toBeVisible();
  await expect(page.getByLabel("邮箱", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "发送验证邮件", exact: true }),
  ).toBeEnabled();
});
