import { reviewContext } from "./review-context";
import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { replayRecord } from "../../packages/rules/src/replay";
import { seedAccount } from "./account-fixture";

test("creation summary and lobby cards expose pace and rules at mobile width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const credentials = {
    username: "room" + randomUUID().replaceAll("-", "").slice(0, 12),
    password: "room-summary-test",
  };
  await seedAccount(credentials);
  const login = await page.request.post("/api/auth/login", {
    data: credentials,
    headers: { Origin: "http://127.0.0.1:5174" },
  });
  expect(login.ok()).toBe(true);
  await page.goto("/");
  await page.getByLabel("房间人数", { exact: true }).selectOption("5");
  await page
    .getByLabel("开局方式", { exact: true })
    .selectOption("snake-forward");
  await expect(page.getByLabel("房间人数", { exact: true })).toHaveValue("5");
  await expect(
    page.getByRole("group", { name: "时间", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("初始时间", { exact: true })).toHaveValue("72");
  await expect(page.getByLabel("每步加时", { exact: true })).toHaveValue("24");
  await expect(page.getByLabel("时间上限", { exact: true })).toHaveValue("72");
  await expect(page.getByLabel("异步时间", { exact: true })).toHaveCount(0);
  await page.getByLabel("初始时间", { exact: true }).selectOption("120");
  await expect(page.getByLabel("时间上限", { exact: true })).toHaveValue("120");
  await expect(page.getByLabel("开房设置摘要")).toContainText(
    "初始 5 天 · 每步 +1 天 · 上限 5 天",
  );
  await expect(page.getByLabel("开局方式").locator("option")).toHaveText([
    "顺蛇轮抽",
    "逆蛇轮抽",
  ]);
  await page.getByText("高级设置", { exact: true }).click();
  await page
    .getByLabel("已提交行动的撤回", { exact: true })
    .selectOption("disabled");
  await expect(page.getByLabel("战绩统计", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "创建房间", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "等待大家落座" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "cellman", exact: true }).click();
  const card = page
    .locator(".room-list-card")
    .filter({ hasText: credentials.username });
  await expect(card).toContainText(
    "公开房间 · 5 人 · 初始 5 天 · 每步 +1 天 · 上限 5 天",
  );
  await expect(card).toContainText("顺蛇轮抽 · 禁止撤回 · 完局计入战绩");
  await expect(card).toContainText("1 / 5 人");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "work/acceptance/room-lobby-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(card).toBeVisible();
  await page.screenshot({
    path: "work/acceptance/room-lobby-desktop.png",
    fullPage: true,
  });
});

test("four clients edit and confirm room options, then retain server clocks and locked settings", async ({
  browser,
}) => {
  test.setTimeout(180000);
  const origin =
    process.env.CELLMAN_ACCEPTANCE_ORIGIN ?? "http://127.0.0.1:5174";
  const contexts = await Promise.all(
    [0, 1, 2, 3].map((i) =>
      reviewContext(browser, {
        viewport:
          i === 0 ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
      }),
    ),
  );
  const pages = await Promise.all(contexts.map((c) => c.newPage())),
    csrf: string[] = [],
    errors: string[] = [];
  for (const p of pages) p.setDefaultTimeout(15000);
  const manifest: {
    users: { id: string; username: string }[];
    roomId: string | null;
    gameId: string | null;
  } = { users: [], roomId: null, gameId: null };
  mkdirSync("work/acceptance", { recursive: true });
  const evidence = process.env.CELLMAN_ACCEPTANCE_ORIGIN
    ? "release04"
    : "local-settings";
  const save = () =>
    writeFileSync(
      `work/acceptance/${evidence}-manifest.json`,
      JSON.stringify(manifest, null, 2),
    );
  async function post(i: number, path: string, data: unknown) {
    const send = () =>
      pages[i].request.post(origin + "/api" + path, {
        data,
        headers: { Origin: origin, "X-CSRF-Token": csrf[i] ?? "" },
      });
    let r = await send();
    if (r.status() === 429) {
      await delay((Number(r.headers()["retry-after"]) || 60) * 1000);
      r = await send();
    }
    expect(r.ok(), await r.text()).toBe(true);
    return r.json();
  }
  async function read() {
    return (
      await pages[0].request.get(origin + "/api/games/" + manifest.gameId)
    ).json();
  }
  try {
    for (let i = 0; i < 4; i++) {
      pages[i].on("pageerror", (e) => errors.push(e.message));
      const credentials = {
        username: `release${Date.now().toString(36)}${i}`,
        password: randomUUID() + randomUUID(),
      };
      const account = await seedAccount(credentials);
      manifest.users.push({
        id: account.userId,
        username: credentials.username,
      });
      save();
      csrf[i] = (await post(i, "/auth/login", credentials)).csrf;
    }
    const host = pages[0];
    await host.goto(origin + "/");
    await expect(host.getByLabel("房间人数", { exact: true })).toBeVisible();
    await expect(host.getByLabel("开局方式", { exact: true })).toBeVisible();
    await expect(host.getByLabel("首轮行动顺序", { exact: true })).toBeHidden();
    await expect(host.getByLabel("初始时间", { exact: true })).toHaveValue(
      "72",
    );
    await host.getByLabel("房间可见性").selectOption("private");
    await expect(host.getByLabel("开房设置摘要")).toContainText(
      "仅凭邀请加入 · 3 人 · 初始 3 天 · 每步 +1 天 · 上限 3 天",
    );
    await expect(host.getByLabel("开房设置摘要")).toContainText("完局计入战绩");
    await host.screenshot({
      path: "work/acceptance/room-creation-mobile.png",
      fullPage: true,
    });
    await host.getByRole("button", { name: "创建房间", exact: true }).click();
    await expect(
      host.getByRole("heading", { name: "等待大家落座" }),
    ).toBeVisible();
    const roomUrl = host.url();
    manifest.roomId = roomUrl.split("/room/")[1].split("?")[0];
    save();
    const inviteToken = new URLSearchParams(roomUrl.split("?")[1]).get(
      "invite",
    );
    for (let i = 1; i < 3; i++)
      await post(i, `/rooms/${manifest.roomId}/join`, { inviteToken });
    for (const p of pages.slice(0, 3)) await p.goto(roomUrl);
    for (const p of pages.slice(0, 3)) {
      await expect(p.locator(".seat.occupied")).toHaveCount(3);
      await p.getByRole("button", { name: "准备就绪", exact: true }).click();
      await expect(
        p.getByRole("button", { name: "取消准备", exact: true }),
      ).toBeVisible();
    }
    await expect(
      host.getByRole("button", { name: "开始对局", exact: true }),
    ).toBeEnabled();
    await expect(
      pages[1].getByRole("button", { name: "修改设置" }),
    ).toHaveCount(0);
    await host.getByRole("button", { name: "修改设置" }).click();
    await host.getByLabel("房间人数", { exact: true }).selectOption("4");
    await host.getByLabel("时间上限", { exact: true }).selectOption("48");
    await expect(host.getByLabel("初始时间", { exact: true })).toHaveValue(
      "48",
    );
    await host.getByLabel("每步加时", { exact: true }).selectOption("12");
    await host.getByText("高级设置", { exact: true }).click();
    await host
      .getByLabel("已提交行动的撤回", { exact: true })
      .selectOption("disabled");
    await host
      .getByLabel("首轮行动顺序", { exact: true })
      .selectOption("seated");
    await expect(host.getByLabel("战绩统计", { exact: true })).toHaveCount(0);
    await host.screenshot({
      path: `work/acceptance/${evidence}-mobile-edit.png`,
      fullPage: true,
    });
    expect(
      await host.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await host.getByRole("button", { name: "保存设置", exact: true }).click();
    for (const p of pages.slice(0, 3)) {
      await expect(
        p.getByRole("button", { name: "准备就绪", exact: true }),
      ).toBeVisible({ timeout: 10000 });
      await expect(p.getByLabel("当前房间设置")).toContainText(
        "初始 2 天 · 每步 +12 小时 · 上限 2 天",
      );
    }
    await host.getByRole("button", { name: "修改设置" }).click();
    await host.getByLabel("初始时间", { exact: true }).selectOption("24");
    await pages[3].goto(roomUrl);
    await pages[3].getByRole("button", { name: "加入这个房间" }).click();
    await expect(
      host.getByRole("button", { name: "载入最新设置" }),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      host.getByRole("button", { name: "保存设置", exact: true }),
    ).toBeDisabled();
    await host.getByRole("button", { name: "载入最新设置" }).click();
    await expect(host.getByLabel("初始时间", { exact: true })).toHaveValue(
      "48",
    );
    await host.getByRole("button", { name: "取消修改" }).click();
    for (const p of pages) {
      await p.reload();
      await p.getByRole("button", { name: "准备就绪", exact: true }).click();
    }
    await expect(
      host.getByRole("button", { name: "开始对局", exact: true }),
    ).toBeEnabled();
    await pages[1].screenshot({
      path: `work/acceptance/${evidence}-desktop-room.png`,
      fullPage: true,
    });
    await host.getByRole("button", { name: "开始对局", exact: true }).click();
    await expect(host).toHaveURL(/#\/game\//);
    manifest.gameId = host.url().split("/game/")[1];
    save();
    for (const p of pages) {
      await expect(p.locator(".player-clock")).toHaveCount(4);
      await expect(p.locator(".player-clock.running")).toHaveCount(1);
    }
    const before = await read();
    expect(before.state.activeSeat).toBe("p4");
    expect(before.settings.undo).toBe("disabled");
    expect(before.settings.countStats).toBe(true);
    await pages[3]
      .locator(
        '.snake-draft section[aria-label="种族"] .setup-option:not(:disabled)',
      )
      .first()
      .click();
    await pages[3]
      .getByRole("button", { name: "确认提交", exact: true })
      .click();
    for (const p of pages)
      await expect(p.getByText("局面版本 1", { exact: true })).toBeVisible();
    const after = await read();
    expect(after.clock.remaining.p4).toBe(48 * 3600000);
    expect(after.clock.remaining.p4).toBeGreaterThan(before.clock.remaining.p4);
    expect(after.clock.running).toEqual(["p3"]);
    await host.reload();
    await expect(host.locator(".player-clock.running")).toContainText(
      manifest.users[2].username,
    );
    await host.locator(".game-clock-panel summary").click();
    await expect(host.getByLabel("本局设置", { exact: true })).toContainText(
      "开局设置已锁定",
    );
    await expect(host.getByLabel("本局设置", { exact: true })).toContainText(
      "禁止撤回已提交行动",
    );
    await host.screenshot({
      path: `work/acceptance/${evidence}-mobile-clock.png`,
      fullPage: true,
    });
    expect(
      await host.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const record = await (
      await host.request.get(origin + `/api/games/${manifest.gameId}/replay`)
    ).json();
    expect(replayRecord(record).state).toEqual((await read()).state);
    const denied = await pages[3].request.post(
      origin + `/api/games/${manifest.gameId}/undo/request`,
      {
        data: {
          requestId: randomUUID(),
          expectedRevision: 1,
          targetRevision: 0,
          reason: "验收撤回限制",
        },
        headers: { Origin: origin, "X-CSRF-Token": csrf[3] },
      },
    );
    expect(denied.status()).toBe(409);
    expect((await denied.json()).error).toBe("UNDO_DISABLED");
    expect(errors).toEqual([]);
    writeFileSync(
      `work/acceptance/${evidence}-summary.json`,
      JSON.stringify(
        {
          passed: true,
          clients: 4,
          settings: after.settings,
          revision: 1,
          browserErrors: errors,
        },
        null,
        2,
      ),
    );
  } catch (e) {
    writeFileSync(
      `work/acceptance/${evidence}-failure.json`,
      JSON.stringify({ error: String(e), browserErrors: errors }),
    );
    for (let i = 0; i < pages.length; i++)
      await pages[i]
        .screenshot({
          path: `work/acceptance/${evidence}-failure-${i}.png`,
          fullPage: true,
        })
        .catch(() => {});
    throw e;
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});
