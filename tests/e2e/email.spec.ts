import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { mkdirSync } from "node:fs";
import { seedAccount } from "./account-fixture";
test("bind email, verify, email login and one-time password reset across independent browsers", async ({
  browser,
}) => {
  test.setTimeout(120000);
  const contexts = await Promise.all([
    browser.newContext({ viewport: { width: 390, height: 844 } }),
    browser.newContext(),
  ]);
  const [page, inbox] = await Promise.all(contexts.map((c) => c.newPage()));
  const db = new Pool({
    connectionString: process.env.TEST_DATABASE_URL,
    options: `-c search_path=${process.env.E2E_SCHEMA}`,
  });
  const username = "em" + Date.now().toString(36),
    email = username + "@example.test",
    password = randomUUID(),
    nextPassword = "abc123",
    errors: string[] = [];
  for (const p of [page, inbox])
    p.on("pageerror", (e) => errors.push(e.message));
  async function mail(subject: string) {
    let message: any;
    await expect
      .poll(
        async () => {
          message = (
            await db.query(
              "SELECT message FROM test_mail_deliveries WHERE message->>'to'=$1 AND message->>'subject'=$2 ORDER BY created_at DESC LIMIT 1",
              [email, subject],
            )
          ).rows[0]?.message;
          return !!message;
        },
        { timeout: 25000 },
      )
      .toBe(true);
    return message.text.match(/http[^\s]+/)[0] as string;
  }
  try {
    const origin = "http://127.0.0.1:5174";
    await seedAccount({ username, password });
    expect(
      (
        await page.request.post(origin + "/api/auth/login", {
          headers: { Origin: origin },
          data: { username, password },
        })
      ).ok(),
    ).toBe(true);
    await page.goto(origin + "/#/account");
    await expect(page.getByText("尚未绑定邮箱", { exact: true })).toBeVisible();
    await page.getByLabel("绑定邮箱", { exact: true }).fill(email);
    await page.getByLabel("当前密码", { exact: true }).fill(password);
    await page
      .getByRole("button", { name: "发送验证邮件", exact: true })
      .click();
    await expect(
      page.getByText("验证邮件已加入发送队列。请打开邮件中的链接完成验证。", {
        exact: true,
      }),
    ).toBeVisible();
    const verify = await mail("cellman · 验证邮箱");
    await inbox.goto(verify);
    await expect(inbox).not.toHaveURL(/token=/);
    await inbox.getByLabel("当前账号密码", { exact: true }).fill(password);
    await inbox.getByRole("button", { name: "确认绑定邮箱" }).click();
    await expect(
      inbox.getByText("邮箱验证成功，可用于登录和找回密码。", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByText("已验证：" + email, { exact: true }),
    ).toBeVisible();
    await page.getByLabel("轮到我行动或响应时提醒", { exact: true }).check();
    await expect(
      page.getByText("提醒设置已保存", { exact: true }),
    ).toBeVisible();
    mkdirSync("work/acceptance", { recursive: true });
    await page.screenshot({
      path: "work/acceptance/email-account-mobile.png",
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("button", { name: username + " · 退出", exact: true })
      .click();
    await page.getByLabel("用户名或已验证邮箱", { exact: true }).fill(email);
    await page.getByLabel("密码", { exact: true }).fill(password);
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "游戏大厅", exact: true }),
    ).toBeVisible();
    await page.goto(origin + "/#/account");
    await db.query(
      "UPDATE email_attempts SET created_at=now()-interval '2 minutes'",
    );
    await page.goto(origin + "/#/email/forgot");
    await page.getByLabel("已验证邮箱", { exact: true }).fill(email);
    await page.getByRole("button", { name: "发送重置邮件" }).click();
    const reset = await mail("cellman · 重置密码");
    await inbox.goto(reset);
    await inbox.getByLabel("新密码", { exact: true }).fill(nextPassword);
    await inbox
      .getByLabel("再次输入新密码", { exact: true })
      .fill(nextPassword);
    await inbox.getByRole("button", { name: "确认重置密码" }).click();
    await expect(
      inbox.getByText("密码已重置，旧登录会话已失效。请使用新密码登录。", {
        exact: true,
      }),
    ).toBeVisible();
    await page.goto(origin + "/#/account");
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "登录", exact: true }),
    ).toBeVisible();
    await page.getByLabel("用户名或已验证邮箱", { exact: true }).fill(email);
    await page.getByLabel("密码", { exact: true }).fill(nextPassword);
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await expect(
      page.getByText("已验证：" + email, { exact: true }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await db.end();
    await Promise.all(contexts.map((c) => c.close()));
  }
});
test("unconfigured mail does not pretend to send verification or reset messages", async ({
  page,
}) => {
  await page.route("**/api/auth/me", (r) =>
    r.fulfill({ json: { user: { id: "1", name: "test" }, csrf: "test" } }),
  );
  await page.route("**/api/account/email", (r) =>
    r.fulfill({
      json: {
        available: false,
        email: null,
        pendingEmail: null,
        notifyTurn: false,
        notifyOverdue: false,
      },
    }),
  );
  await page.route("**/api/auth/mail-status", (r) =>
    r.fulfill({ json: { available: false } }),
  );
  await page.goto("/#/account");
  await expect(
    page.getByRole("button", { name: "发送验证邮件", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText(
      "邮件服务尚未启用。管理员配置后即可绑定邮箱和使用邮件找回密码。",
      { exact: true },
    ),
  ).toBeVisible();
  await page.goto("/#/email/forgot");
  await expect(
    page.getByRole("button", { name: "发送重置邮件", exact: true }),
  ).toBeDisabled();
});
