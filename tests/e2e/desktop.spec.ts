import { reviewContext } from "./review-context";
import { test, expect } from "@playwright/test";
import { seedAccount } from "./account-fixture";
test("three independent accounts rotate turns, synchronize and reconnect to a saved game", async ({
  browser,
}) => {
  const contexts = await Promise.all(
    [0, 1, 2].map(() => reviewContext(browser)),
  );
  const pages = await Promise.all(contexts.map((c) => c.newPage()));
  const stamp = Date.now().toString(36);
  for (let i = 0; i < 3; i++) {
    await seedAccount({ username: "e2e" + stamp + i, password: "abc123" });
    await pages[i].goto("/");
    await pages[i].getByLabel("用户名或已验证邮箱").fill("e2e" + stamp + i);
    await pages[i].getByLabel("密码", { exact: true }).fill("abc123");
    await pages[i].getByRole("button", { name: "登录", exact: true }).click();
    await expect(
      pages[i].getByRole("heading", { name: "游戏大厅", exact: true }),
    ).toBeVisible();
  }
  await pages[0].getByLabel("开局方式").selectOption("snake-forward");
  await pages[0].getByLabel("房间人数").selectOption("3");
  await pages[0].getByRole("button", { name: "创建房间", exact: true }).click();
  await expect(pages[0].getByText("等待大家落座")).toBeVisible();
  const url = pages[0].url();
  for (let i = 1; i < 3; i++) {
    await pages[i].goto(url);
    await pages[i].getByRole("button", { name: "加入这个房间" }).click();
  }
  await Promise.all(pages.map((p) => p.reload()));
  for (const page of pages) {
    await expect(page.locator(".seat.occupied")).toHaveCount(3);
    await page.getByRole("button", { name: "准备就绪" }).click();
  }
  await expect(
    pages[0].getByRole("button", { name: "开始对局" }),
  ).toBeEnabled();
  await pages[0].getByRole("button", { name: "开始对局" }).click();
  for (const page of pages) await expect(page).toHaveURL(/\/game\//);
  const gameId = pages[0].url().split("/game/")[1];
  for (let revision = 0; revision < 6; revision++) {
    const snapshot = await (
      await pages[0].request.get("/api/games/" + gameId)
    ).json();
    const actor = [0, 1, 2].find(
      (i) =>
        snapshot.state.players[snapshot.state.activeSeat].name ===
        "e2e" + stamp + i,
    )!;
    expect(actor).toBeDefined();
    const offline = (actor + 1) % 3;
    if (revision === 1) await contexts[offline].setOffline(true);
    const page = pages[actor];
    await page.locator(".setup-option:not(:disabled)").first().click();
    await page.getByRole("button", { name: "确认提交", exact: true }).click();
    for (const peer of revision === 1
      ? pages.filter((_, i) => i !== offline)
      : pages)
      await expect(
        peer.getByText(`局面版本 ${revision + 1}`, { exact: true }),
      ).toBeVisible({ timeout: 10000 });
    if (revision === 1) {
      await contexts[offline].setOffline(false);
      await pages[offline].reload();
      await expect(
        pages[offline].getByText("局面版本 2", { exact: true }),
      ).toBeVisible();
    }
  }
  await pages[0].reload();
  await expect(pages[0].getByText("局面版本 6", { exact: true })).toBeVisible();
  for (const c of contexts) await c.close();
});
