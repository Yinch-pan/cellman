import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { seedAccount } from "./account-fixture";
import { replayRecord } from "../../packages/rules/src/replay";

test("three clients can wait or expel, see locked stats, end the casual game; inactive games close on refresh", async ({
  browser,
}) => {
  test.setTimeout(120000);
  const origin = `http://127.0.0.1:${process.env.E2E_WEB_PORT ?? "5174"}`;
  if (
    !process.env.TEST_DATABASE_URL ||
    process.env.TEST_DATABASE_URL === process.env.DATABASE_URL ||
    !/^e2e_[a-f0-9]{32}$/.test(process.env.E2E_SCHEMA ?? "")
  )
    throw Error("Isolated DB required");
  const db = new Pool({
    connectionString: process.env.TEST_DATABASE_URL,
    options: `-c search_path=${process.env.E2E_SCHEMA}`,
  });
  const contexts = await Promise.all(
    [0, 1, 2].map(() =>
      browser.newContext({ viewport: { width: 1440, height: 1000 } }),
    ),
  );
  const pages = await Promise.all(contexts.map((c) => c.newPage())),
    csrf: string[] = [],
    names: string[] = [],
    errors: string[] = [];
  async function post(i: number, path: string, data: unknown) {
    const r = await pages[i].request.post("/api" + path, {
      data,
      headers: { Origin: origin, "X-CSRF-Token": csrf[i] ?? "" },
    });
    expect(r.ok(), await r.text()).toBe(true);
    return r.json();
  }
  async function game() {
    const room = await post(0, "/rooms", {
      visibility: "private",
      seats: 3,
      setupMode: "snake-forward",
      settings: {
        time: { mode: "paced", movesPerDay: 2 },
        seatOrder: "seated",
      },
    });
    for (const i of [1, 2])
      await post(i, `/rooms/${room.id}/join`, {
        inviteToken: room.inviteToken,
      });
    for (const i of [0, 1, 2])
      await post(i, `/rooms/${room.id}/ready`, { ready: true });
    return (await post(0, `/rooms/${room.id}/start`, {})).gameId as string;
  }
  try {
    for (let i = 0; i < 3; i++) {
      pages[i].on("pageerror", (e) => errors.push(e.message));
      const input = {
        username: "life" + randomUUID().replaceAll("-", "").slice(0, 12),
        password: "browser-lifecycle-test",
      };
      names.push(input.username);
      await seedAccount(input);
      csrf[i] = (await post(i, "/auth/login", input)).csrf;
    }
    const id = await game();
    for (const page of pages) await page.goto(`/#/game/${id}`);
    await expect(pages[1].getByLabel("计时与本局设置")).toContainText(
      "连续 10 天",
    );
    await expect(
      pages[1].getByRole("button", { name: /移除超时玩家/ }),
    ).toHaveCount(0);
    await db.query(
      "UPDATE games SET clock=jsonb_set(clock,'{at}',to_jsonb($2::bigint)) WHERE id=$1",
      [id, Date.now() - 25 * 3600000],
    );
    await pages[1].reload();
    const remove = pages[1].getByRole("button", {
      name: `移除超时玩家 ${names[0]}`,
      exact: true,
    });
    await remove.click();
    await expect(pages[1].getByRole("alert")).toContainText("不能通过悔棋撤销");
    await pages[1].getByRole("button", { name: "取消，继续等待" }).click();
    await expect(remove).toBeEnabled();
    await pages[1].setViewportSize({ width: 390, height: 844 });
    await remove.click();
    await pages[1]
      .getByRole("alert")
      .screenshot({ path: "work/acceptance/timeout-confirm-mobile.png" });
    expect(
      await pages[1].evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await pages[1]
      .getByRole("button", { name: "确认移除", exact: true })
      .click();
    for (const page of pages)
      await expect(
        page.getByText("超时弃局 · 战绩已结算", { exact: true }),
      ).toBeVisible();
    await expect(
      pages[0].getByRole("button", { name: "结束余局", exact: true }),
    ).toHaveCount(0);
    await pages[1].setViewportSize({ width: 1440, height: 1000 });
    await pages[1]
      .getByLabel("计时与本局设置")
      .screenshot({ path: "work/acceptance/timeout-result.png" });
    const replay = await (
      await pages[1].request.get(`/api/games/${id}/replay`)
    ).json();
    const data = await (await pages[1].request.get(`/api/games/${id}`)).json();
    expect(replayRecord(replay).state).toEqual(data.state);
    await pages[1]
      .getByRole("button", { name: "结束余局", exact: true })
      .click();
    await pages[1]
      .getByRole("button", { name: "确认结束余局", exact: true })
      .click();
    await expect(
      pages[1].getByRole("heading", { name: "对局记录", exact: true }),
    ).toBeVisible();
    await pages[0].goto("/#/stats");
    await expect(pages[0].getByText(/被移除弃局\s*1\s*局/)).toBeVisible();
    await pages[0].getByText("最近完成的对局（最多 100 局）").click();
    await expect(
      pages[0].getByRole("link", { name: /超时弃局 · 被移除 · 末名/ }),
    ).toBeVisible();
    const inactive = await game();
    await db.query(
      "UPDATE games SET last_activity_at=now()-interval '10 days 1 second' WHERE id=$1",
      [inactive],
    );
    await pages[2].goto(`/#/game/${inactive}`);
    await expect(
      pages[2].getByText("连续 10 天无人操作 · 对局已结束", { exact: true }),
    ).toBeVisible();
    await pages[2]
      .getByLabel("计时与本局设置")
      .screenshot({ path: "work/acceptance/inactivity-result.png" });
    expect(errors).toEqual([]);
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
    await db.end();
  }
});
