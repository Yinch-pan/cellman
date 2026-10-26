import { reviewContext } from "./review-context";
import { test, expect } from "@playwright/test";
import { replayRecord } from "../../packages/rules/src/replay";
import { actionState } from "../../packages/rules/test/fixtures/actions";
import { readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { seedAccount } from "./account-fixture";
test("same-screen undo survives refresh and resource statistics do not double count", async ({
  page,
}) => {
  const state = actionState();
  const record = {
    initial: state,
    commands: [
      {
        revision: 1,
        seat: "p1",
        action: {
          kind: "convert" as const,
          from: "tool" as const,
          to: "coin" as const,
          count: 1,
        },
      },
    ],
    revision: 1,
  };
  const next = replayRecord(record).state;
  await page.addInitScript(
    ({ next, record }) => {
      if (!localStorage.getItem("boardgame-demo-v1")) {
        localStorage.setItem("boardgame-demo-v1", JSON.stringify(next));
        localStorage.setItem("boardgame-demo-record", JSON.stringify(record));
      }
    },
    { next, record },
  );
  await page.goto("/#/demo");
  await page.locator(".history-panel > summary").click();
  await page.getByRole("button", { name: "撤回此步及后续行动" }).click();
  await page.getByLabel("悔棋原因").fill("同屏确认");
  await page.getByRole("button", { name: "确认同屏撤回" }).click();
  await expect(page.getByText("局面版本 2", { exact: true })).toBeVisible();
  await page.reload();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("boardgame-demo-v1")!),
  );
  expect(saved).toEqual({ ...state, revision: 2 });
  await page.getByText("本局数据统计", { exact: true }).click();
  await expect(page.locator(".statistics-panel")).toContainText(
    "有效行动 0 条",
  );
});

test("four browsers approve, reject and cancel undo; history stays read-only and replay agrees", async ({
  browser,
}, info) => {
  test.setTimeout(120000);
  const contexts = await Promise.all(
    [0, 1, 2, 3].map((i) =>
      reviewContext(browser, {
        viewport:
          i === 0 ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
      }),
    ),
  );
  const pages = await Promise.all(contexts.map((c) => c.newPage()));
  const csrf: string[] = [];
  const errors: string[] = [];
  const origin = `http://127.0.0.1:${process.env.E2E_WEB_PORT ?? "5174"}`;
  async function post(i: number, path: string, data: unknown) {
    const send = () =>
      pages[i].request.post(origin + "/api" + path, {
        data,
        headers: { Origin: origin, "X-CSRF-Token": csrf[i] ?? "" },
      });
    let r = await send();
    // The full suite shares one local IP. Honor the real authentication limit
    // instead of disabling it for tests or manufacturing another client IP.
    if (r.status() === 429 && path.startsWith("/auth/")) {
      await delay(
        Math.min(60, Math.max(1, Number(r.headers()["retry-after"]) || 60)) *
          1000,
      );
      r = await send();
    }
    expect(r.ok(), await r.text()).toBeTruthy();
    return r.json();
  }
  try {
    for (const [i, page] of pages.entries()) {
      page.on("pageerror", (e) => errors.push(e.message));
      const username = `review${Date.now().toString(36)}${i}`;
      await seedAccount({
        username,
        password: "browser-review-password",
      });
      csrf[i] = (
        await post(i, "/auth/login", {
          username,
          password: "browser-review-password",
        })
      ).csrf;
    }
    const room = await post(0, "/rooms", {
      visibility: "public",
      seats: 4,
      setupMode: "standard",
    });
    for (let i = 1; i < 4; i++) await post(i, `/rooms/${room.id}/join`, {});
    for (let i = 0; i < 4; i++)
      await post(i, `/rooms/${room.id}/ready`, { ready: true });
    const { gameId } = await post(0, `/rooms/${room.id}/start`, {});
    const initial = (
      await (await pages[0].request.get(`${origin}/api/games/${gameId}`)).json()
    ).state;
    await Promise.all(pages.map((p) => p.goto(`${origin}/#/game/${gameId}`)));
    const first = Number(initial.activeSeat.slice(1)) - 1;
    await pages[first].locator(".setup-option").first().click();
    await pages[first]
      .getByRole("button", { name: "确认提交", exact: true })
      .click();
    const secondState = (
      await (await pages[0].request.get(`${origin}/api/games/${gameId}`)).json()
    ).state;
    const second = Number(secondState.activeSeat.slice(1)) - 1;
    await expect(
      pages[second].getByText("局面版本 1", { exact: true }),
    ).toBeVisible();
    await pages[second].locator(".setup-option").nth(1).click();
    await pages[second]
      .getByRole("button", { name: "确认提交", exact: true })
      .click();
    for (const p of pages)
      await expect(p.getByText("局面版本 2", { exact: true })).toBeVisible();
    const author = pages[first];
    await author.locator(".history-panel > summary").click();
    await author
      .getByRole("button", { name: "撤回此步及后续行动", exact: true })
      .click();
    await author
      .getByLabel("悔棋原因")
      .fill("选错了组合，需要一起恢复后续选择");
    await author.getByRole("button", { name: "预览恢复后的局面" }).click();
    await expect(author.locator(".history-notice")).toContainText("#0");
    await expect(author.locator(".setup-option").first()).toBeDisabled();
    await author.getByRole("button", { name: "返回当前对局" }).click();
    await author.getByRole("button", { name: "发送悔棋申请" }).click();
    for (const p of pages)
      await expect(p.locator(".undo-notice")).toContainText("对局暂停");
    await expect(pages[second].locator(".setup-option").first()).toBeDisabled();
    for (let i = 0; i < 4; i++)
      if (i !== first)
        await pages[i]
          .getByRole("button", { name: "同意悔棋", exact: true })
          .click();
    for (const p of pages) {
      await expect(p.getByText("局面版本 3", { exact: true })).toBeVisible();
      await expect(p.locator(".undo-notice")).toHaveCount(0);
    }
    const record = await (
      await pages[0].request.get(`${origin}/api/games/${gameId}/replay`)
    ).json();
    expect(replayRecord(record).state).toEqual({ ...initial, revision: 3 });
    await expect(
      author.getByText("已撤销", { exact: false }).first(),
    ).toBeVisible();
    await author.getByText("本局数据统计", { exact: true }).click();
    await expect(author.locator(".statistics-panel")).toContainText(
      "有效行动 0 条",
    );
    // A withdrawn action is still viewable without changing live state.
    await author
      .locator(".history-row")
      .filter({ hasText: "#1" })
      .getByRole("button", { name: "查看此时局面" })
      .click();
    await expect(author.locator(".history-notice")).toContainText("#1");
    await author.getByRole("button", { name: "下一步", exact: true }).click();
    await expect(author.locator(".history-notice")).toContainText("#2");
    await author.getByRole("button", { name: "上一步", exact: true }).click();
    await expect(author.locator(".history-notice")).toContainText("#1");
    await author.getByRole("button", { name: "返回当前对局" }).click();
    await author.locator(".setup-option").nth(2).click();
    await author.getByRole("button", { name: "确认提交", exact: true }).click();
    await expect(author.getByText("局面版本 4", { exact: true })).toBeVisible();
    for (const decision of ["reject", "cancel"]) {
      await author
        .getByRole("button", { name: "撤回此步及后续行动", exact: true })
        .click();
      await author.getByLabel("悔棋原因").fill("测试取消或拒绝");
      await author.getByRole("button", { name: "发送悔棋申请" }).click();
      await expect(author.locator(".undo-notice")).toBeVisible();
      if (decision === "cancel")
        await author.getByRole("button", { name: "取消申请" }).click();
      else
        await pages[(first + 1) % 4]
          .getByRole("button", { name: "拒绝悔棋" })
          .click();
      await expect(author.locator(".undo-notice")).toHaveCount(0);
    }
    await author.reload();
    await expect(author.getByText("局面版本 4", { exact: true })).toBeVisible();
    await author.locator(".history-panel > summary").click();
    const downloading = author.waitForEvent("download");
    await author
      .getByRole("button", { name: "导出对局记录", exact: true })
      .click();
    const downloaded = await downloading;
    const exported = JSON.parse(
      readFileSync((await downloaded.path())!, "utf8"),
    );
    expect(replayRecord(exported).state).toEqual(
      (
        await (
          await pages[0].request.get(`${origin}/api/games/${gameId}`)
        ).json()
      ).state,
    );
    await pages[0].getByText("本局数据统计", { exact: true }).click();
    expect(
      await pages[0].evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
    await pages[0].screenshot({
      path: info.outputPath("review-mobile.png"),
      fullPage: true,
    });
    await author.getByRole("link", { name: "战绩统计", exact: true }).click();
    await expect(
      author.getByRole("heading", { name: "战绩与统计" }),
    ).toBeVisible();
    await expect(author.getByText("还没有已完成的对局。")).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});
