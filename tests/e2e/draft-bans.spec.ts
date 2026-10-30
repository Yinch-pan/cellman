import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { reviewContext } from "./review-context";
import { seedAccount } from "./account-fixture";
import { replayRecord } from "../../packages/rules/src/replay";

test("host bans synchronize, reset readiness and exclude content throughout a full three-player draft", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(180000);
  const contexts = await Promise.all(
    [0, 1, 2].map((i) =>
      reviewContext(browser, {
        viewport:
          i === 0 ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
      }),
    ),
  );
  const pages = await Promise.all(contexts.map((c) => c.newPage()));
  for (const page of pages) page.setDefaultTimeout(10000);
  const errors: string[] = [];
  mkdirSync("work/acceptance", { recursive: true });
  try {
    for (const [i, page] of pages.entries()) {
      page.on("pageerror", (e) => errors.push(e.message));
      const credentials = {
        username: `ban${Date.now().toString(36)}${i}`,
        password: randomUUID(),
      };
      await seedAccount(credentials);
      await page.goto(baseURL!);
      await page.getByLabel("用户名或已验证邮箱").fill(credentials.username);
      await page.getByLabel("密码", { exact: true }).fill(credentials.password);
      await page.getByRole("button", { name: "登录", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "游戏大厅" }),
      ).toBeVisible();
    }
    const host = pages[0],
      guest = pages[1];
    await host
      .getByLabel("开局方式", { exact: true })
      .selectOption("snake-forward");
    await host.getByRole("button", { name: "创建房间", exact: true }).click();
    await expect(
      host.getByRole("heading", { name: "等待大家落座" }),
    ).toBeVisible();
    const roomUrl = host.url();
    for (const page of pages.slice(1)) {
      await page.goto(roomUrl);
      await page
        .getByRole("button", { name: "加入这个房间", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "准备就绪", exact: true }),
      ).toBeVisible();
    }
    for (const page of pages) {
      await expect(page.locator(".seat.occupied")).toHaveCount(3);
      // Refresh ensures the ready request uses the last join's revision.
      await page.reload();
      await page.getByRole("button", { name: "准备就绪", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "取消准备", exact: true }),
      ).toBeVisible();
    }
    await expect(
      host.getByRole("button", { name: "开始对局", exact: true }),
    ).toBeEnabled();
    await expect(
      guest.getByRole("button", { name: "设置轮抽禁用" }),
    ).toHaveCount(0);
    await host.getByRole("button", { name: "设置轮抽禁用" }).click();
    const openCategory = async (name: string) => {
      const section = host
        .locator(".draft-ban-category")
        .filter({ has: host.locator("summary").filter({ hasText: name }) });
      if (!(await section.getAttribute("open"))) {
        // Empty-string open attributes are also open; use DOM state explicitly.
        if (!(await section.evaluate((el) => (el as HTMLDetailsElement).open)))
          await section.locator("summary").click();
      }
      return section;
    };
    const factions = await openCategory("种族");
    await factions
      .getByRole("checkbox", { name: "禁用 哲学家", exact: true })
      .check();
    const natives = await openCategory("家园地形");
    await natives
      .getByRole("checkbox", { name: "禁用 森林", exact: true })
      .check();
    await expect(natives.locator("input:not(:checked)")).toHaveCount(6);
    for (const input of await natives.locator("input:not(:checked)").all())
      await expect(input).toBeDisabled();
    await (
      await openCategory("宫殿能力")
    )
      .getByRole("checkbox", { name: "禁用 SH9", exact: true })
      .check();
    const bonuses = await openCategory("奖励板");
    for (const code of ["BON10", "BON9", "BON-P3"])
      await bonuses
        .getByRole("checkbox", { name: `禁用 ${code}`, exact: true })
        .check();
    await host.getByLabel("房间人数", { exact: true }).selectOption("5");
    await expect(host.getByRole("alert")).toContainText(
      "奖励板还需解除 1 项禁用",
    );
    await expect(
      host.getByRole("button", { name: "保存设置", exact: true }),
    ).toBeDisabled();
    await bonuses
      .getByRole("checkbox", { name: "禁用 BON-P3", exact: true })
      .uncheck();
    await bonuses
      .getByRole("checkbox", { name: "禁用 BON9", exact: true })
      .uncheck();
    await host.getByLabel("房间人数", { exact: true }).selectOption("3");
    await host.screenshot({
      path: "work/acceptance/draft-bans-mobile-editor.png",
      fullPage: true,
    });
    expect(
      await host.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await host.getByRole("button", { name: "保存设置", exact: true }).click();
    for (const page of pages) {
      await expect(
        page.getByRole("button", { name: "准备就绪", exact: true }),
      ).toBeVisible({ timeout: 10000 });
      for (const text of ["哲学家", "森林", "SH9", "BON10"])
        await expect(
          page.getByLabel("当前轮抽禁用", { exact: true }),
        ).toContainText(text);
    }
    await host.reload();
    await expect(
      host.getByLabel("当前轮抽禁用", { exact: true }),
    ).toContainText("SH9");
    // Cancelling edits never publishes local changes.
    await host.getByRole("button", { name: "设置轮抽禁用" }).click();
    await host.getByRole("button", { name: "清空禁用" }).click();
    await host.getByRole("button", { name: "取消修改" }).click();
    await expect(
      host.getByLabel("当前轮抽禁用", { exact: true }),
    ).toContainText("SH9");
    await guest.screenshot({
      path: "work/acceptance/draft-bans-desktop-summary.png",
      fullPage: true,
    });
    for (const page of pages)
      await page.getByRole("button", { name: "准备就绪", exact: true }).click();
    await expect(
      host.getByRole("button", { name: "开始对局", exact: true }),
    ).toBeEnabled();
    await host.getByRole("button", { name: "开始对局", exact: true }).click();
    for (const page of pages)
      await expect(page).toHaveURL(/#\/game\//, { timeout: 10000 });
    const gameId = host.url().split("/game/")[1];
    const read = async () =>
      (await host.request.get(`${baseURL}/api/games/${gameId}`)).json();
    const initial = await read();
    const bans = {
      faction: ["philosophers"],
      native: ["forest"],
      palace: ["flight"],
      bonus: ["coins"],
    };
    expect(initial.settings.draftBans).toEqual(bans);
    for (const [category, [id]] of Object.entries(bans)) {
      expect(initial.state.setup.draft.pools[category]).not.toContain(id);
      await expect(
        host.locator(
          `.setup-option[data-category="${category}"][data-option="${id}"]`,
        ),
      ).toHaveCount(0);
    }
    for (let i = 0; i < 12; i++) {
      const game = await read();
      const page = pages[Number(game.state.activeSeat.slice(1)) - 1];
      await page
        .locator(".snake-draft .setup-option:not(:disabled)")
        .first()
        .click();
      await page.getByRole("button", { name: "确认提交", exact: true }).click();
      await expect.poll(async () => (await read()).state.revision).toBe(i + 1);
    }
    const final = await read();
    expect(final.state.phase).toBe("placement");
    const record = await (
      await host.request.get(`${baseURL}/api/games/${gameId}/replay`)
    ).json();
    expect(replayRecord(record).state).toEqual(final.state);
    expect(errors).toEqual([]);
  } catch (error) {
    for (const [i, page] of pages.entries())
      await page
        .screenshot({
          path: `work/acceptance/draft-bans-failure-${i}.png`,
          fullPage: true,
        })
        .catch(() => {});
    throw error;
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});
