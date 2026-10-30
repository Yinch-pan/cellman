import { reviewContext } from "./review-context";
import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { chooseMove } from "../../packages/rules/test/fixtures/players";
import { replayRecord } from "../../packages/rules/src/replay";
import { seedAccount } from "./account-fixture";
import { label } from "../../apps/web/src/api";
test("four clients see no private draft, then receive one atomic turn and identical replay", async ({
  browser,
}) => {
  test.setTimeout(180000);
  const origin = `http://127.0.0.1:${process.env.E2E_WEB_PORT ?? "5174"}`;
  const contexts = await Promise.all(
    [0, 1, 2, 3].map(() => reviewContext(browser)),
  );
  await Promise.all(
    contexts.map((c) =>
      c.addInitScript(() => {
        localStorage.setItem("cellman-turn-planning", "on");
        localStorage.setItem("cellman-conversion-prompt", "never");
      }),
    ),
  );
  const pages = await Promise.all(contexts.map((c) => c.newPage()));
  const csrf: string[] = [];
  async function post(i: number, path: string, data: unknown) {
    const send = () =>
      pages[i].request.post(origin + "/api" + path, {
        data,
        headers: { Origin: origin, "X-CSRF-Token": csrf[i] ?? "" },
      });
    let r = await send();
    if (r.status() === 429) {
      await delay(
        Math.min(60, Math.max(1, Number(r.headers()["retry-after"]) || 60)) *
          1000,
      );
      r = await send();
    }
    expect(r.ok(), await r.text()).toBe(true);
    return r.json();
  }
  try {
    for (let i = 0; i < 4; i++) {
      const credentials = {
        username: `draft${Date.now().toString(36)}${i}`,
        password: randomUUID(),
      };
      await seedAccount(credentials);
      csrf[i] = (await post(i, "/auth/login", credentials)).csrf;
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
    const read = async () =>
      (
        await (
          await pages[0].request.get(`${origin}/api/games/${gameId}`)
        ).json()
      ).state;
    let state = await read();
    for (
      let n = 0;
      n < 40 && (state.phase !== "actions" || state.pending.length);
      n++
    ) {
      const move = chooseMove(state);
      await post(Number(move.seat.slice(1)) - 1, `/games/${gameId}/commands`, {
        commandId: randomUUID(),
        expectedRevision: state.revision,
        action: move.action,
      });
      state = await read();
    }
    expect(state.phase).toBe("actions");
    expect(state.pending).toHaveLength(0);
    await Promise.all(pages.map((p) => p.goto(`${origin}/#/game/${gameId}`)));
    const actor = pages[Number(state.activeSeat.slice(1)) - 1];
    await actor.locator(".free-actions > summary").click();
    // Use the option by visible text if its numeric order changes.
    const options = await actor
      .getByLabel("转换方式")
      .locator("option")
      .allTextContents();
    const tool = options.findIndex(
      (t) => t.includes("工具") && t.includes("金币"),
    );
    expect(tool).toBeGreaterThanOrEqual(0);
    await actor.getByLabel("转换方式").selectOption(String(tool));
    await actor.getByRole("button", { name: "转换资源", exact: true }).click();
    await actor.getByRole("button", { name: "确认步骤", exact: true }).click();
    expect(await read()).toEqual(state);
    for (const p of pages)
      await expect(
        p.getByText(`局面版本 ${state.revision}`, { exact: true }),
      ).toBeVisible();
    for (const p of pages.filter((p) => p !== actor))
      await expect(p.getByText(/本回合试走/)).toHaveCount(0);
    await actor.reload();
    await expect(
      actor.getByText("本回合试走 · 1 步", { exact: true }),
    ).toBeVisible();
    await actor.getByRole("button", { name: "轮次", exact: true }).click();
    const bonus = state.setup.bonusPool.find(
      (id: string) =>
        !Object.values(state.players).some((p: any) => p.bonus === id),
    );
    await actor.getByRole("button", { name: "结束本轮", exact: true }).click();
    await actor.getByRole("button", { name: "确认步骤", exact: true }).click();
    await actor
      .locator("[data-choice-id]")
      .getByRole("button", { name: new RegExp("^" + label("bonus:" + bonus)) })
      .click();
    await actor.getByRole("button", { name: "完成换轮", exact: true }).click();
    expect(await read()).toEqual(state);
    await actor.getByRole("button", { name: "提交回合", exact: true }).click();
    await actor.getByRole("button", { name: "确认提交", exact: true }).click();
    for (const p of pages)
      await expect(
        p.getByText(`局面版本 ${state.revision + 1}`, { exact: true }),
      ).toBeVisible();
    const next = await read();
    expect(next.players[state.activeSeat].resources.tools).toBe(
      state.players[state.activeSeat].resources.tools - 1,
    );
    const record = await (
      await pages[0].request.get(`${origin}/api/games/${gameId}/replay`)
    ).json();
    expect(replayRecord(record).state).toEqual(next);
    expect(record.commands.at(-1).action.kind).toBe("turn");
    // The periodic refresh must update clock/undo state without downloading an
    // unchanged history page again. No fake server state or disabled limiter.
    let historyReads = 0;
    pages[0].on("request", (request) => {
      if (request.url().includes(`/api/games/${gameId}/history`))
        historyReads++;
    });
    await pages[0].waitForResponse(
      (response) =>
        response.url() === `${origin}/api/games/${gameId}` &&
        response.status() === 200,
      { timeout: 35000 },
    );
    await pages[0].waitForTimeout(500);
    expect(historyReads).toBe(0);
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});
