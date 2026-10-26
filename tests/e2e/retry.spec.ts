import { reviewContext } from "./review-context";
import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { seedAccount } from "./account-fixture";
for (const failure of ["abort", "gateway"])
  test(`lost ${failure} response after commit retries the same command without a second write`, async ({
    browser,
  }) => {
    test.setTimeout(180000);
    const contexts = await Promise.all(
      [0, 1, 2].map(() =>
        reviewContext(browser, {
          baseURL: `http://127.0.0.1:${process.env.E2E_WEB_PORT ?? "5174"}`,
        }),
      ),
    );
    const sessions: { csrf: string }[] = [];
    for (let i = 0; i < 3; i++) {
      const username = "retry" + randomUUID().replaceAll("-", "").slice(0, 12);
      const body = { username, password: "retry-test-password" };
      const headers = {
        origin: `http://127.0.0.1:${process.env.E2E_WEB_PORT ?? "5174"}`,
      };
      await seedAccount(body);
      const login = () =>
        contexts[i].request.post("/api/auth/login", {
          data: body,
          headers,
        });
      let response = await login();
      if (response.status() === 429) {
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            (Number(response.headers()["retry-after"]) || 60) * 1000,
          ),
        );
        response = await login();
      }
      expect(response.ok(), await response.text()).toBe(true);
      sessions.push(await response.json());
    }
    const post = (i: number, path: string, data: any) =>
      contexts[i].request.post("/api" + path, {
        data,
        headers: {
          origin: `http://127.0.0.1:${process.env.E2E_WEB_PORT ?? "5174"}`,
          "x-csrf-token": sessions[i].csrf,
        },
      });
    const room = await (
      await post(0, "/rooms", {
        visibility: "public",
        seats: 3,
        setupMode: "training",
      })
    ).json();
    for (let i = 1; i < 3; i++)
      await post(i, "/rooms/" + room.id + "/join", {});
    for (let i = 0; i < 3; i++)
      await post(i, "/rooms/" + room.id + "/ready", { ready: true });
    const { gameId } = await (
      await post(0, "/rooms/" + room.id + "/start", {})
    ).json();
    const page = await contexts[0].newPage();
    await page.goto("/#/game/" + gameId);
    const oldSnapshot = await (
      await contexts[0].request.get("/api/games/" + gameId)
    ).json();
    await page.getByRole("button", { name: "A1 森林" }).click();
    await page.getByRole("button", { name: "执行行动", exact: true }).click();
    if (failure === "abort") {
      const secondRoom = await (
        await post(0, "/rooms", {
          visibility: "public",
          seats: 3,
          setupMode: "training",
        })
      ).json();
      for (let i = 1; i < 3; i++)
        await post(i, "/rooms/" + secondRoom.id + "/join", {});
      for (let i = 0; i < 3; i++)
        await post(i, "/rooms/" + secondRoom.id + "/ready", { ready: true });
      const second = await (
        await post(0, "/rooms/" + secondRoom.id + "/start", {})
      ).json();
      const secondLoaded = page.waitForResponse((r) =>
        r.url().endsWith("/api/games/" + second.gameId),
      );
      await page.evaluate((id) => {
        location.hash = "/game/" + id;
      }, second.gameId);
      await secondLoaded;
      await expect(
        page.getByRole("button", { name: "确认提交", exact: true }),
      ).toHaveCount(0);
      await page.evaluate((id) => {
        location.hash = "/game/" + id;
      }, gameId);
      await page.getByRole("button", { name: "A1 森林" }).click();
      await page.getByRole("button", { name: "执行行动", exact: true }).click();
    }
    let attempts = 0;
    const ids: string[] = [];
    await page.route("**/api/games/*/commands", async (route) => {
      attempts++;
      ids.push(route.request().postDataJSON().commandId);
      if (attempts === 1) {
        await route.fetch();
        if (failure === "abort") await route.abort("failed");
        else
          await route.fulfill({
            status: 502,
            contentType: "text/plain",
            body: "Bad Gateway",
          });
      } else await route.continue();
    });
    await page.getByRole("button", { name: "确认提交", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "安全重试提交" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "安全重试提交" }).click();
    await expect(page.getByText("局面版本 1", { exact: true })).toBeVisible();
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(ids[1]);
    const history = await (
      await contexts[0].request.get("/api/games/" + gameId + "/history")
    ).json();
    expect(history).toHaveLength(1);
    if (failure === "gateway") {
      await page.route(
        "**/api/games/" + gameId,
        (route) => route.fulfill({ json: oldSnapshot }),
        { times: 1 },
      );
      const delayed = page.waitForResponse((r) =>
        r.url().endsWith("/api/games/" + gameId),
      );
      await page.evaluate(() =>
        window.dispatchEvent(new Event("visibilitychange")),
      );
      await (await delayed).finished();
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      await expect(page.getByText("局面版本 1", { exact: true })).toBeVisible();
    }
    for (const c of contexts) await c.close();
  });
