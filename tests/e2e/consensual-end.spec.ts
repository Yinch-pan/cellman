import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { reviewContext } from "./review-context";
import { seedAccount } from "./account-fixture";

test("three real players can reject, withdraw, reconnect and unanimously end without scores", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(150000);
  const contexts = await Promise.all(
    [0, 1, 2].map((i) =>
      reviewContext(browser, {
        viewport:
          i === 0 ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
      }),
    ),
  );
  const pages = await Promise.all(contexts.map((c) => c.newPage()));
  const errors: string[] = [];
  mkdirSync("work/acceptance", { recursive: true });
  try {
    for (const [i, page] of pages.entries()) {
      page.setDefaultTimeout(10000);
      page.on("pageerror", (e) => errors.push(e.message));
      const credentials = {
        username: `end${Date.now().toString(36)}${i}`,
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
    const host = pages[0];
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
      await page.reload();
      await page.getByRole("button", { name: "准备就绪", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "取消准备", exact: true }),
      ).toBeVisible();
    }
    await expect(
      host.getByRole("button", { name: "开始对局", exact: true }),
    ).toBeEnabled();
    await host.getByRole("button", { name: "开始对局", exact: true }).click();
    for (const page of pages) await expect(page).toHaveURL(/#\/game\//);
    const gameId = host.url().split("/game/")[1];
    const read = async () =>
      (await host.request.get(`${baseURL}/api/games/${gameId}`)).json();
    const propose = async (i: number, reason: string) => {
      const panel = pages[i].getByRole("region", {
        name: "协商结束对局",
        exact: true,
      });
      await panel.locator(".end-game-propose summary").click();
      await panel.getByLabel("提议原因（选填，最多 200 字）").fill(reason);
      await panel
        .getByRole("button", { name: "发起提议并同意", exact: true })
        .click();
      for (const page of pages)
        await expect(page.locator(".end-game-vote")).toContainText(
          "已同意 1 / 3 人",
        );
    };
    await propose(0, "测试拒绝后继续");
    await pages[1]
      .getByRole("button", { name: "拒绝，继续对局", exact: true })
      .click();
    for (const page of pages)
      await expect(page.locator(".end-game-vote")).toHaveCount(0);
    expect((await read()).state.status).not.toBe("finished");
    await propose(1, "测试发起人撤回");
    await pages[1]
      .getByRole("button", { name: "撤回结束提议", exact: true })
      .click();
    for (const page of pages)
      await expect(page.locator(".end-game-vote")).toHaveCount(0);
    await propose(2, "大家协商结束，保留日志");
    await host.reload();
    await expect(host.locator(".end-game-vote")).toContainText(
      "大家协商结束，保留日志",
    );
    await host
      .locator(".end-game-vote")
      .evaluate((el) =>
        window.scrollTo(
          0,
          window.scrollY + el.getBoundingClientRect().top - 100,
        ),
      );
    await host
      .locator(".end-game-vote")
      .screenshot({ path: "work/acceptance/consensual-end-mobile.png" });
    expect(
      await host.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await host
      .getByRole("button", { name: "同意结束本局", exact: true })
      .click();
    for (const page of pages)
      await expect(page.locator(".end-game-vote")).toContainText(
        "已同意 2 / 3 人",
      );
    expect((await read()).state.status).not.toBe("finished");
    await pages[1].reload();
    await expect(pages[1].locator(".end-game-vote")).toContainText(
      "已同意 2 / 3 人",
    );
    await pages[1]
      .locator(".end-game-vote")
      .screenshot({ path: "work/acceptance/consensual-end-desktop.png" });
    await pages[1]
      .getByRole("button", { name: "同意结束本局", exact: true })
      .click();
    for (const page of pages) {
      await expect(
        page.getByText("协商结束 · 不判胜负", { exact: true }),
      ).toBeVisible();
      await expect(page.locator(".end-game-vote")).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "发起提议并同意", exact: true }),
      ).toHaveCount(0);
    }
    const result = await read();
    expect(result.state.matchResult.reason).toBe("consensus");
    expect(result.state.revision).toBe(1);
    expect(result.state.scores).toEqual([]);
    expect(result.clock.running).toEqual([]);
    expect(result.endRequests.map((r: any) => r.status)).toEqual([
      "applied",
      "cancelled",
      "rejected",
    ]);
    await host.locator(".end-game-history summary").click();
    await expect(host.locator(".end-game-history")).toContainText(
      "全员同意，本局已协商结束",
    );
    await host
      .locator(".end-game-panel")
      .screenshot({ path: "work/acceptance/consensual-end-history.png" });
    await host.reload();
    await expect(
      host.getByText("协商结束 · 不判胜负", { exact: true }),
    ).toBeVisible();
    // Finished games leave the home and active lists but remain reachable in history.
    await host.goto(baseURL!);
    await expect(host.getByRole("heading", { name: "游戏大厅" })).toBeVisible();
    const activeList = host.getByRole("region", {
      name: "我的对局",
      exact: true,
    });
    await expect(activeList.locator(`[data-game-id="${gameId}"]`)).toHaveCount(
      0,
    );
    await expect(activeList).toContainText("暂无进行中的对局");
    await activeList
      .getByRole("link", { name: "查看历史记录", exact: true })
      .click();
    await expect(
      host.getByRole("heading", { name: "历史记录", exact: true }),
    ).toBeVisible();
    const historic = host.locator(
      `.game-history-page [data-game-id="${gameId}"]`,
    );
    await expect(historic).toContainText("协商结束 · 不判胜负");
    expect(await host.locator(".site-header").evaluate((header) => {
      const brand = header.querySelector(".brand")!.getBoundingClientRect();
      const nav = header.querySelector("nav")!.getBoundingClientRect();
      return nav.top >= brand.bottom && nav.right <= innerWidth;
    })).toBe(true);
    await host.screenshot({
      path: "work/acceptance/game-history-mobile.png",
      fullPage: true,
    });
    await host.reload();
    await expect(historic).toBeVisible();
    await historic.click();
    await expect(
      host.getByText("协商结束 · 不判胜负", { exact: true }),
    ).toBeVisible();
    await host.getByRole("link", { name: "我的对局", exact: true }).click();
    await expect(
      host.getByRole("heading", { name: "我的对局", exact: true, level: 1 }),
    ).toBeVisible();
    await expect(host.locator(`[data-game-id="${gameId}"]`)).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});
