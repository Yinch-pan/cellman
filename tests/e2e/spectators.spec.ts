import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { reviewContext } from "./review-context";
import { seedAccount } from "./account-fixture";

for (const visibility of ["public", "private"] as const)
  test(`${visibility}: shared game links support anonymous and signed-in spectators with live read-only boards`, async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(150000);
    const contexts = await Promise.all(
      [0, 1, 2, 3, 4].map((i) =>
        reviewContext(browser, {
          viewport:
            i === 4
              ? { width: 390, height: 844 }
              : { width: 1440, height: 1000 },
        }),
      ),
    );
    const pages = await Promise.all(contexts.map((c) => c.newPage()));
    const errors: string[] = [];
    mkdirSync("work/acceptance", { recursive: true });
    try {
      for (const [i, page] of pages.slice(0, 4).entries()) {
        page.setDefaultTimeout(10000);
        page.on("pageerror", (e) => errors.push(e.message));
        const credentials = {
          username: `watch${Date.now().toString(36)}${i}`,
          password: randomUUID(),
        };
        await seedAccount(credentials);
        await page.goto(baseURL!);
        await page.getByLabel("用户名或已验证邮箱").fill(credentials.username);
        await page
          .getByLabel("密码", { exact: true })
          .fill(credentials.password);
        await page.getByRole("button", { name: "登录", exact: true }).click();
        await expect(
          page.getByRole("heading", { name: "游戏大厅" }),
        ).toBeVisible();
      }
      const host = pages[0];
      await host
        .getByLabel("开局方式", { exact: true })
        .selectOption("snake-forward");
      await host.getByLabel("房间可见性").selectOption(visibility);
      await host.getByRole("button", { name: "创建房间", exact: true }).click();
      await expect(
        host.getByRole("heading", { name: "等待大家落座" }),
      ).toBeVisible();
      const roomUrl = host.url();
      for (const page of pages.slice(1, 3)) {
        await page.goto(roomUrl);
        await page
          .getByRole("button", { name: "加入这个房间", exact: true })
          .click();
        await expect(
          page.getByRole("button", { name: "准备就绪", exact: true }),
        ).toBeVisible();
      }
      for (const page of pages.slice(0, 3)) {
        await expect(page.locator(".seat.occupied")).toHaveCount(3);
        await page.reload();
        await page
          .getByRole("button", { name: "准备就绪", exact: true })
          .click();
        await expect(
          page.getByRole("button", { name: "取消准备", exact: true }),
        ).toBeVisible();
      }
      await expect(
        host.getByRole("button", { name: "开始对局", exact: true }),
      ).toBeEnabled();
      await host.getByRole("button", { name: "开始对局", exact: true }).click();
      for (const page of pages.slice(0, 3))
        await expect(page).toHaveURL(/#\/game\//);
      const gameId = host.url().split("/game/")[1];
      const viewers = pages.slice(3),
        guest = pages[4];
      for (const page of viewers) {
        page.setDefaultTimeout(10000);
        page.on("pageerror", (e) => errors.push(e.message));
        await page.goto(baseURL!);
        const list = page.getByRole("region", {
          name: "进行中的公开对局",
          exact: true,
        });
        await expect(list).toBeVisible();
        const entry = list.locator(`a[href="#/game/${gameId}"]`);
        if (visibility === "public") {
          await expect(entry).toBeVisible();
          await entry.click();
        } else {
          await expect(entry).toHaveCount(0);
          await page.goto(host.url());
        }
        await expect(
          page.getByRole("heading", { name: "观战模式", exact: true }),
        ).toBeVisible();
        await expect(
          page.getByText("实时同步中", { exact: true }),
        ).toBeVisible();
        await expect(page.locator(".setup-option:not(:disabled)")).toHaveCount(
          0,
        );
        await expect(page.locator(".end-game-propose")).toHaveCount(0);
      }
      const read = async () =>
        (await host.request.get(`${baseURL}/api/games/${gameId}`)).json();
      // A participant's shared link still opens the regular player controls.
      await expect(host.locator(".end-game-propose")).toBeVisible();
      for (let i = 0; i < 12; i++) {
        const snapshot = await read();
        const actor = pages[Number(snapshot.state.activeSeat.slice(1)) - 1];
        await expect(
          actor.getByText(`局面版本 ${i}`, { exact: true }),
        ).toBeVisible();
        await actor
          .locator(".snake-draft .setup-option:not(:disabled)")
          .first()
          .click();
        await actor
          .getByRole("button", { name: "确认提交", exact: true })
          .click();
        for (const page of viewers)
          await expect(
            page.getByText(`局面版本 ${i + 1}`, { exact: true }),
          ).toBeVisible();
      }
      for (const page of viewers) {
        await expect(page.locator(".chip-resources")).toHaveCount(3);
        await expect(
          page.locator(".board-actions button:not(:disabled)"),
        ).toHaveCount(0);
        await expect(page.locator(".watch-log")).toContainText("#12");
        await page.getByLabel("查看玩家面板").selectOption("p2");
        await expect(page.getByLabel("查看玩家面板")).toHaveValue("p2");
        const hex = page.locator('.map-frame [role="button"]').first();
        await hex.click();
        await expect(page.locator(".watch-map-detail")).toBeVisible();
        await expect(page.locator(".map-action-panel")).toHaveCount(0);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
      }
      await guest.reload();
      await expect(
        guest.getByText("局面版本 12", { exact: true }),
      ).toBeVisible();
      await expect(guest.locator(".watch-log")).toContainText("#12");
      await guest
        .locator(".spectator-banner")
        .screenshot({ path: `work/acceptance/watch-${visibility}-mobile.png` });
      await pages[3]
        .locator(".player-bar")
        .screenshot({
          path: `work/acceptance/watch-${visibility}-players.png`,
        });
      // Voting is available only in the three player sessions; viewers stay read-only.
      await host.locator(".end-game-propose summary").click();
      await host
        .getByRole("button", { name: "发起提议并同意", exact: true })
        .click();
      for (const page of viewers) {
        await expect(
          page.getByRole("button", { name: "同意结束本局", exact: true }),
        ).toHaveCount(0);
        await expect(
          page.getByRole("button", { name: "撤回结束提议", exact: true }),
        ).toHaveCount(0);
      }
      for (const page of pages.slice(1, 3))
        await page
          .getByRole("button", { name: "同意结束本局", exact: true })
          .click();
      for (const page of viewers) {
        await expect(
          page.getByText("局面版本 13", { exact: true }),
        ).toBeVisible();
        await expect(page.locator(".final-scores")).toContainText("不判胜负");
        await expect(page.locator(".watch-log")).toContainText(
          "全体玩家同意结束本局",
        );
      }
      await guest.goto(baseURL!);
      await expect(
        guest.locator(`.public-games a[href="#/game/${gameId}"]`),
      ).toHaveCount(0);
      await pages[3].reload();
      await expect(
        pages[3].getByRole("heading", { name: "观战模式", exact: true }),
      ).toBeVisible();
      expect((await read()).state.revision).toBe(13);
      expect(errors).toEqual([]);
    } finally {
      await Promise.all(contexts.map((c) => c.close()));
    }
  });
