import { reviewContext } from "./review-context";
import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { seedAccount } from "./account-fixture";
import { replayRecord } from "../../packages/rules/src/replay";
for (const direction of ["forward", "reverse"] as const)
  test(`three players complete ${direction} snake draft with independent picks and refresh`, async ({
    browser,
  }) => {
    test.setTimeout(120000);
    const origin = `http://127.0.0.1:${process.env.E2E_WEB_PORT ?? "5174"}`,
      contexts = await Promise.all(
        [0, 1, 2].map(() =>
          reviewContext(browser, { viewport: { width: 1440, height: 1000 } }),
        ),
      ),
      pages = await Promise.all(contexts.map((c) => c.newPage()));
    const csrf: string[] = [],
      errors: string[] = [];
    async function post(i: number, path: string, data: unknown) {
      const r = await pages[i].request.post(origin + "/api" + path, {
        data,
        headers: { Origin: origin, "X-CSRF-Token": csrf[i] ?? "" },
      });
      expect(r.ok(), await r.text()).toBe(true);
      return r.json();
    }
    try {
      for (let i = 0; i < 3; i++) {
        pages[i].on("pageerror", (e) => errors.push(e.message));
        const credentials = {
          username: "snake" + randomUUID().replaceAll("-", "").slice(0, 12),
          password: "snake-draft-browser",
        };
        await seedAccount(credentials);
        csrf[i] = (await post(i, "/auth/login", credentials)).csrf;
      }
      const room = await post(0, "/rooms", {
        visibility: "public",
        seats: 3,
        setupMode: `snake-${direction}`,
        settings: {
          seatOrder: "seated",
          time: { mode: "paced", movesPerDay: 4, activeStartUtc: 2 },
        },
      });
      for (let i = 1; i < 3; i++) await post(i, `/rooms/${room.id}/join`, {});
      for (let i = 0; i < 3; i++)
        await post(i, `/rooms/${room.id}/ready`, { ready: true });
      const { gameId } = await post(0, `/rooms/${room.id}/start`, {});
      for (const p of pages) await p.goto(origin + "/#/game/" + gameId);
      const categories = ["奖励板", "宫殿能力", "地形", "种族"];
      for (let pick = 0; pick < 12; pick++) {
        const round = Math.floor(pick / 3),
          reverse = (round % 2 === 0) === (direction === "reverse"),
          i = reverse ? 2 - (pick % 3) : pick % 3,
          p = pages[i];
        await expect(
          p.getByText(`局面版本 ${pick}`, { exact: true }),
        ).toBeVisible();
        await expect(
          p.getByRole("heading", {
            name: new RegExp(`第 ${round + 1} / 4 轮`),
          }),
        ).toBeVisible();
        await p
          .getByRole("region", { name: categories[round], exact: true })
          .locator(".setup-option:not(:disabled)")
          .first()
          .click();
        await p.getByRole("button", { name: "确认提交", exact: true }).click();
        await expect(
          p.getByText(`局面版本 ${pick + 1}`, { exact: true }),
        ).toBeVisible();
        if (pick === 4) {
          await p.reload();
          await expect(p.getByLabel("开局轮抽")).toContainText("已选择");
          await p.screenshot({
            path: `work/acceptance/snake-${direction}-draft.png`,
            fullPage: true,
          });
        }
      }
      const current = await (
        await pages[0].request.get(origin + "/api/games/" + gameId)
      ).json();
      expect(current.state.phase).toBe("placement");
      for (const p of Object.values(current.state.players) as any[]) {
        expect(p.draftPalace).toBeTruthy();
        expect(p.palace).toBeNull();
      }
      const replay = await (
        await pages[0].request.get(origin + "/api/games/" + gameId + "/replay")
      ).json();
      expect(replayRecord(replay).state).toEqual(current.state);
      expect(errors).toEqual([]);
    } finally {
      await Promise.all(contexts.map((c) => c.close()));
    }
  });
