import { test, expect } from "@playwright/test";
test("three independent accounts join, start, preview and recover a saved game", async ({
  browser,
}) => {
  const contexts = await Promise.all([0, 1, 2].map(() => browser.newContext()));
  const pages = await Promise.all(contexts.map((c) => c.newPage()));
  const stamp = Date.now().toString(36);
  for (let i = 0; i < 3; i++) {
    await pages[i].goto("/");
    await pages[i].getByRole("button", { name: "创建账号" }).click();
    await pages[i].getByLabel("用户名").fill("e2e" + stamp + i);
    await pages[i]
      .getByLabel("密码", { exact: true })
      .fill("e2e-long-password");
    await pages[i].getByRole("button", { name: "注册并登录" }).click();
    await expect(pages[i].getByText("请保存恢复码")).toBeVisible();
    await pages[i].getByRole("button", { name: "我已保存" }).click();
  }
  await pages[0].getByRole("button", { name: "创建房间", exact: true }).click();
  await expect(pages[0].getByText("等待大家落座")).toBeVisible();
  const url = pages[0].url();
  for (let i = 1; i < 3; i++) {
    await pages[i].goto(url);
    await pages[i].getByRole("button", { name: "加入这个房间" }).click();
  }
  for (const page of pages)
    await page.getByRole("button", { name: "准备就绪" }).click();
  await expect(
    pages[0].getByRole("button", { name: "开始对局" }),
  ).toBeEnabled();
  await pages[0].getByRole("button", { name: "开始对局" }).click();
  await expect(
    pages[0].getByText("放置起始工坊", { exact: true }).first(),
  ).toBeVisible();
  await pages[0].getByRole("button", { name: "A1 森林" }).click();
  await pages[0].getByRole("button", { name: "预览行动" }).click();
  await expect(pages[0].getByText("确认提交后生效")).toBeVisible();
  await pages[0].getByRole("button", { name: "确认提交" }).click();
  await expect(pages[0].getByText("局面版本 1", { exact: true })).toBeVisible();
  await pages[0].reload();
  await expect(pages[0].getByText("局面版本 1", { exact: true })).toBeVisible();
  for (const c of contexts) await c.close();
});
