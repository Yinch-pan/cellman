import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { seedAccount } from "./account-fixture";
import { auditState } from "../../packages/rules/test/fixtures/content-audit";
import { finishPlacement } from "../../packages/rules/src/setup";
import { replayRecord } from "../../packages/rules/src/replay";

test("three players can undo monks FAV6, its spades and income after an earlier book undo", async ({
  browser,
  baseURL,
}, info) => {
  test.setTimeout(60000);
  const contexts = await Promise.all(
    [0, 1, 2].map(() =>
      browser.newContext({ viewport: { width: 390, height: 900 } }),
    ),
  );
  const pages = await Promise.all(contexts.map((c) => c.newPage()));
  const tokens: string[] = [];
  const post = async (i: number, path: string, data: unknown) => {
    const r = await pages[i].request.post(`${baseURL}/api${path}`, {
      data,
      headers: { Origin: baseURL!, "X-CSRF-Token": tokens[i] ?? "" },
    });
    expect(r.ok(), await r.text()).toBe(true);
    return r.json();
  };
  try {
    for (let i = 0; i < 3; i++) {
      const username = `monk${Date.now().toString(36)}${i}`,
        password = "local-monks-undo-test";
      await seedAccount({ username, password });
      tokens[i] = (await post(i, "/auth/login", { username, password })).csrf;
    }
    const room = await post(0, "/rooms", {
      visibility: "public",
      seats: 3,
      setupMode: "standard",
    });
    for (let i = 1; i < 3; i++) await post(i, `/rooms/${room.id}/join`, {});
    for (let i = 0; i < 3; i++)
      await post(i, `/rooms/${room.id}/ready`, { ready: true });
    const { gameId } = await post(0, `/rooms/${room.id}/start`, {});
    const initial = auditState();
    initial.setup.id = gameId;
    initial.players.p1.faction = "monks";
    initial.players.p1.bonus = "bridge-bonus";
    initial.board.buildings.B4.kind = "university";
    finishPlacement(initial);
    // Seed only an isolated opening. Subsequent actions use the normal API and undo uses actual UI.
    if (
      !/^e2e_[a-f0-9]{32}$/.test(process.env.E2E_SCHEMA ?? "") ||
      !process.env.TEST_DATABASE_URL ||
      process.env.TEST_DATABASE_URL === process.env.DATABASE_URL
    )
      throw Error("Isolated DB required");
    const db = new Pool({
      connectionString: process.env.TEST_DATABASE_URL,
      options: `-c search_path=${process.env.E2E_SCHEMA}`,
    });
    try {
      await db.query(
        "UPDATE games SET initial_state=$1,state=$1,revision=0 WHERE id=$2",
        [JSON.stringify(initial), gameId],
      );
    } finally {
      await db.end();
    }
    const read = async () =>
      (
        await (
          await pages[0].request.get(`${baseURL}/api/games/${gameId}`)
        ).json()
      ).state;
    const move = async (action: unknown) =>
      post(0, `/games/${gameId}/commands`, {
        commandId: randomUUID(),
        expectedRevision: (await read()).revision,
        action,
      });
    await move({
      kind: "respond",
      choiceId: initial.pending[0].id,
      option: "two-spades",
    });
    const spade = (await read()).pending.find((c: any) => c.kind === "spades");
    await move({
      kind: "respond",
      choiceId: spade.id,
      option: "terraform",
      terraform: { hex: "A4", terrain: "forest", build: false },
    });
    const book = (await read()).pending.find((c: any) => c.kind === "book");
    await move({ kind: "respond", choiceId: book.id, option: "0" });
    const requestId = randomUUID();
    await post(0, `/games/${gameId}/undo/request`, {
      requestId,
      expectedRevision: 3,
      targetRevision: 2,
      reason: "只撤回拿书",
    });
    for (let i = 1; i < 3; i++)
      await post(i, `/games/${gameId}/undo/vote`, {
        requestId,
        decision: "approve",
      });
    await move({ kind: "respond", choiceId: book.id, option: "1" });
    await Promise.all(pages.map((p) => p.goto(`${baseURL}/#/game/${gameId}`)));
    const host = pages[0];
    await host.locator(".history-panel > summary").click();
    await expect(host.locator('.history-row[data-revision="1"]')).toContainText(
      "领取科技板 FAV6 · 获得 2 铲",
    );
    await expect(host.locator('.history-row[data-revision="2"]')).toContainText(
      "使用铲子改造 A3",
    );
    await expect(host.locator('.history-row[data-revision="5"]')).toContainText(
      "领取 1 本法学书",
    );
    // Even when the latest book entry was clicked, explicitly choose the FAV origin.
    await host
      .locator('.history-row[data-revision="5"]')
      .getByRole("button", { name: "撤回此步及后续行动", exact: true })
      .click();
    await host
      .getByRole("combobox", { name: "撤回起点", exact: true })
      .selectOption("0");
    await expect(host.locator(".undo-target-summary")).toContainText(
      "领取科技板 FAV6",
    );
    await host.getByLabel("悔棋原因").fill("重新选择开局科技板");
    await host.getByRole("button", { name: "预览恢复后的局面" }).click();
    await expect(
      host.getByRole("button", { name: /^领取 FAV6/ }),
    ).toBeVisible();
    await host.getByRole("button", { name: "返回当前对局" }).click();
    await host.locator(".undo-form").scrollIntoViewIfNeeded();
    await host.screenshot({ path: info.outputPath("monks-fav6-undo.png") });
    await host.getByRole("button", { name: "发送悔棋申请" }).click();
    for (let i = 1; i < 3; i++)
      await pages[i]
        .getByRole("button", { name: "同意悔棋", exact: true })
        .click();
    await expect.poll(async () => (await read()).revision).toBe(6);
    const restored = await read();
    expect({ ...restored, revision: 0 }).toEqual(initial);
    await expect(
      host.getByRole("button", { name: /^领取 FAV6/ }),
    ).toBeEnabled();
    const record = await (
      await host.request.get(`${baseURL}/api/games/${gameId}/replay`)
    ).json();
    expect(replayRecord(record).state).toEqual(restored);
    await host.reload();
    await expect(
      host.getByRole("button", { name: /^领取 FAV6/ }),
    ).toBeEnabled();
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});
