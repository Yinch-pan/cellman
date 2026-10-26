import { reviewContext } from "./review-context";
import { test, expect, type Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { setTimeout as think } from "node:timers/promises";
import { chooseMove } from "../../packages/rules/test/fixtures/players";
import { replayGame } from "../../packages/rules/src/replay";
import type { GameAction, GameState } from "../../packages/rules/src/types";
import { label } from "../../apps/web/src/api";
import { seedAccount } from "./account-fixture";

async function previewMove(page: Page, state: GameState, action: GameAction) {
  const click = (name: string) =>
    page.getByRole("button", { name, exact: true }).click();
  const hex = (id: string) =>
    page.getByRole("button", { name: new RegExp(`^${id} `) }).click();
  switch (action.kind) {
    case "draftPick":
      await page
        .locator(
          `.setup-option[data-category="${action.category}"][data-option="${action.option}"]`,
        )
        .click();
      break;
    case "chooseSetup":
      await page.locator(".setup-option").nth(action.offer).click();
      break;
    case "place":
      await hex(action.hex);
      if (
        action.building &&
        (await page.getByLabel("起始建筑", { exact: true }).count())
      )
        await page
          .getByLabel("起始建筑", { exact: true })
          .selectOption(action.building);
      await click("执行行动");
      break;
    case "endTurn":
      await click("结束回合");
      break;
    case "pass":
      await click("轮次");
      if (state.round < 6)
        await page.getByLabel("下一轮奖励").selectOption(action.bonus!);
      await click("结束本轮");
      break;
    case "terraform":
      await click("建设");
      await hex(action.hex);
      await page
        .getByRole("region", { name: "地块操作" })
        .getByRole("button", { name: /^(改造并)?建造工坊/ })
        .click();
      break;
    case "upgrade":
      await click("建设");
      await hex(action.hex);
      await page
        .getByRole("region", { name: "地块操作" })
        .getByRole("button", {
          name: new RegExp(
            `^升级为${label(action.to)}${action.to === "palace" ? " · " + label("palace:" + action.palace) : ""}`,
          ),
        })
        .click();
      break;
    case "scholar":
      await click("研究");
      await page.getByLabel("派遣学者").selectOption(String(action.track));
      await page
        .getByLabel("学者位置")
        .selectOption(action.slot === null ? "return" : String(action.slot));
      await click("派遣学者");
      break;
    case "advance":
      await click("研究");
      await click(action.track === "sailing" ? "推进航海" : "推进改造");
      break;
    case "powerAction":
      await click("公共行动");
      await page.getByLabel("公共能量动作").selectOption(action.id);
      await click("执行公共行动");
      break;
    case "innovation":
      await click("研究");
      await page.getByLabel("获得革新").selectOption(action.id);
      for (let i = 0; i < 4; i++)
        await page
          .getByLabel(["支付黄书", "支付蓝书", "支付棕书", "支付白书"][i])
          .fill(String(action.books[i]));
      await click("开发革新");
      break;
    case "bookAction":
      await click("公共行动");
      await page
        .getByLabel("书籍公共动作", { exact: true })
        .selectOption(action.id);
      if (action.id === "science")
        await page
          .getByRole("combobox", { name: "书籍行动科学", exact: true })
          .selectOption(String(action.track));
      if (action.hex) await hex(action.hex);
      for (let i = 0; i < 4; i++)
        await page
          .getByLabel(
            ["公共动作黄书", "公共动作蓝书", "公共动作棕书", "公共动作白书"][i],
          )
          .fill(String(action.books[i]));
      await click("执行书籍行动");
      break;
    case "respond": {
      const c = state.pending.find((c) => c.id === action.choiceId)!;
      const choicePanel = page.locator(`[data-choice-id="${c.id}"]`);
      if (c.kind === "competency") {
        await click(`领取 ${label("competency:" + action.option)}`);
        break;
      }
      if (
        ["neutral", "freeGuild", "freeWorkshop"].includes(c.kind) &&
        action.option !== "discard"
      ) {
        await hex(action.option);
        await choicePanel
          .getByRole("button", {
            name: "放置 " + action.option,
            exact: true,
          })
          .click();
      } else if (c.kind === "bridge" && action.option !== "discard") {
        await choicePanel.getByLabel("免费桥位置").selectOption(action.option);
        await choicePanel
          .getByRole("button", { name: "建桥", exact: true })
          .click();
      } else {
        const name =
          c.kind === "key"
            ? action.option === "use"
              ? "使用钥匙并继续"
              : "保留钥匙，停在 7 级"
            : action.option === "accept"
              ? "接受"
              : action.option === "decline"
                ? "放弃"
                : action.option === "discard"
                  ? c.kind === "bridge"
                    ? "放弃剩余桥梁"
                    : c.kind === "spades"
                      ? "放弃剩余铲子"
                      : "放弃剩余收益"
                  : ["0", "1", "2", "3"].includes(action.option)
                    ? ["银行 / 黄", "法学 / 蓝", "工程 / 棕", "医学 / 白"][
                        Number(action.option)
                      ]
                    : label(
                        ["competency", "city"].includes(c.kind)
                          ? `${c.kind}:${action.option}`
                          : action.option,
                      );
        await choicePanel
          .locator(".choice-buttons")
          .getByRole("button", {
            name,
            exact: !["competency", "city"].includes(c.kind),
          })
          .first()
          .click();
      }
      break;
    }
    default:
      throw Error(`UI driver needs ${action.kind}`);
  }
}

for (const setupMode of ["snake-forward", "snake-reverse"] as const)
  test(`four independent players complete a ${setupMode} six-round game through the UI`, async ({
    browser,
  }, testInfo) => {
    test.setTimeout(600000);
    const contexts = await Promise.all(
      [0, 1, 2, 3].map((i) =>
        reviewContext(browser, {
          viewport:
            i === 3
              ? { width: 390, height: 844 }
              : { width: 1440, height: 1000 },
        }),
      ),
    );
    const pages = await Promise.all(contexts.map((c) => c.newPage()));
    await Promise.all(
      contexts.map((c) =>
        c.addInitScript(() =>
          localStorage.setItem("cellman-turn-planning", "off"),
        ),
      ),
    );
    const snapshots: (GameState | undefined)[] = [];
    const errors: string[] = [];
    const counts: Record<string, number> = {};
    const timings: {
      revision: number;
      kind: string;
      previewMs: number;
      syncMs: number;
    }[] = [];
    const captured = new Set<string>();
    const stamp = Date.now().toString(36);
    let gameId = "";
    pages.forEach((page, i) => {
      page.setDefaultTimeout(15000);
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("response", async (r) => {
        if (r.status() >= 500 || r.status() === 429)
          errors.push(`${r.status()} ${r.url()}`);
        if (gameId && r.url().endsWith("/api/games/" + gameId) && r.ok()) {
          try {
            const data = await r.json();
            if (!snapshots[i] || data.state.revision >= snapshots[i]!.revision)
              snapshots[i] = data.state;
          } catch {
            /* A page may close while a response body arrives. */
          }
        }
      });
    });
    try {
      for (let i = 0; i < 4; i++) {
        await seedAccount({
          username: `four${stamp}${i}`,
          password: "four-player-test-password",
        });
        await pages[i].goto("/");
        await pages[i]
          .getByLabel("用户名或已验证邮箱")
          .fill(`four${stamp}${i}`);
        await pages[i]
          .getByLabel("密码", { exact: true })
          .fill("four-player-test-password");
        await pages[i]
          .getByRole("button", { name: "登录", exact: true })
          .click();
        await expect(
          pages[i].getByRole("heading", { name: "游戏大厅", exact: true }),
        ).toBeVisible();
      }
      await pages[0].getByLabel("开局方式").selectOption(setupMode);
      await pages[0].getByLabel("房间人数").selectOption("4");
      await pages[0]
        .getByRole("button", { name: "创建房间", exact: true })
        .click();
      await expect(pages[0].getByText("等待大家落座")).toBeVisible();
      for (let i = 1; i < 4; i++) {
        await pages[i].goto(pages[0].url());
        await pages[i]
          .getByRole("button", { name: "加入这个房间", exact: true })
          .click();
        await expect(
          pages[i].getByRole("button", { name: "准备就绪", exact: true }),
        ).toBeVisible();
      }
      // Membership changes deliberately invalidate readiness and its revision.
      // Every client must see the complete roster before acknowledging settings.
      await Promise.all(pages.map((p) => p.reload()));
      for (const page of pages) {
        await expect(
          page.getByRole("heading", { name: `four${stamp}3`, exact: true }),
        ).toBeVisible();
        await page
          .getByRole("button", { name: "准备就绪", exact: true })
          .click();
        await expect(
          page.getByRole("button", { name: "取消准备", exact: true }),
        ).toBeVisible();
      }
      await expect(
        pages[0].getByRole("button", { name: "开始对局", exact: true }),
      ).toBeEnabled();
      // Capture the ID before clients follow their room polling redirect.
      const started = pages[0].waitForResponse(
        (r) => r.url().endsWith("/start") && r.ok(),
      );
      await pages[0]
        .getByRole("button", { name: "开始对局", exact: true })
        .click();
      gameId = (await (await started).json()).gameId;
      for (const page of pages)
        await expect(page).toHaveURL(new RegExp(`/game/${gameId}$`));
      // Also covers refreshing after room startup and restoring the logged-in seat.
      await Promise.all(pages.map((p) => p.reload()));
      await expect.poll(() => snapshots.filter(Boolean).length).toBe(4);
      for (
        let step = 0;
        step < 700 && snapshots[0]!.status !== "finished";
        step++
      ) {
        const state = snapshots[0]!;
        // Deliberate player pacing: exercise the real production rate limits
        // instead of disabling them for a bot that can click dozens of moves/sec.
        await think(1000);
        if (step % 25 === 0)
          console.log(
            `Four-player UI: revision ${state.revision}, round ${state.round}, ${state.phase}`,
          );
        const { seat, action } = chooseMove(state);
        const page = pages[Number(seat.slice(1)) - 1];
        await expect(
          page.getByText(`局面版本 ${state.revision}`, { exact: true }),
        ).toBeVisible();
        const previewStarted = Date.now();
        const [preview] = await Promise.all([
          page.waitForResponse((r) => r.url().endsWith("/preview"), {
            timeout: 15000,
          }),
          previewMove(page, state, action),
        ]);
        expect(
          preview.status(),
          `${JSON.stringify(action)}: ${await preview.text()}`,
        ).toBe(200);
        const previewMs = Date.now() - previewStarted;
        if (
          !captured.has(action.kind) &&
          [
            "draftPick",
            "upgrade",
            "terraform",
            "scholar",
            "innovation",
            "pass",
          ].includes(action.kind)
        ) {
          captured.add(action.kind);
          await page.screenshot({
            path: testInfo.outputPath(`preview-${action.kind}.png`),
            fullPage: true,
          });
        }
        const syncStarted = Date.now();
        await page
          .getByRole("button", { name: "确认提交", exact: true })
          .click();
        for (const p of pages)
          await expect(
            p.getByText(`局面版本 ${state.revision + 1}`, { exact: true }),
          ).toBeVisible();
        await expect
          .poll(() =>
            snapshots.every((s) => s?.revision === state.revision + 1),
          )
          .toBe(true);
        for (const s of snapshots) expect(s).toEqual(snapshots[0]);
        timings.push({
          revision: state.revision + 1,
          kind: action.kind,
          previewMs,
          syncMs: Date.now() - syncStarted,
        });
        counts[action.kind] = (counts[action.kind] ?? 0) + 1;
        expect(errors).toEqual([]);
        if (step === 16) {
          await pages[3].screenshot({
            path: testInfo.outputPath("four-player-mobile.png"),
            fullPage: true,
          });
          await contexts[3].setOffline(true);
          await contexts[3].setOffline(false);
          await pages[3].reload();
          await expect(
            pages[3].getByText(`局面版本 ${state.revision + 1}`, {
              exact: true,
            }),
          ).toBeVisible();
        }
      }
      expect(snapshots[0]!.status).toBe("finished");
      for (const page of pages)
        await expect(
          page.getByRole("heading", { name: "终局成绩" }),
        ).toBeVisible();
      await pages[0].screenshot({
        path: testInfo.outputPath("four-player-finished.png"),
        fullPage: true,
      });
      await pages[0].locator(".history-panel > summary").click();
      const download = pages[0].waitForEvent("download");
      await pages[0]
        .getByRole("button", { name: "导出对局记录", exact: true })
        .click();
      const replayPath = testInfo.outputPath("four-player-replay.json");
      await (await download).saveAs(replayPath);
      const record = JSON.parse(readFileSync(replayPath, "utf8"));
      expect(replayGame(record.initial, record.commands).state).toEqual(
        snapshots[0],
      );
      for (const kind of ["upgrade", "terraform", "scholar", "respond", "pass"])
        expect(counts[kind], kind).toBeGreaterThan(0);
      const summary = JSON.stringify(
        {
          counts,
          gameId,
          setupMode,
          timingNote:
            "previewMs includes UI navigation and input; syncMs includes confirmation and all four clients. Local automation timings, not production latency.",
          timings,
          revision: snapshots[0]!.revision,
          scores: snapshots[0]!.scores,
        },
        null,
        2,
      );
      writeFileSync(testInfo.outputPath("playthrough-summary.json"), summary);
      await testInfo.attach("playthrough-summary", {
        body: summary,
        contentType: "application/json",
      });
      expect(errors).toEqual([]);
    } catch (error) {
      writeFileSync(
        testInfo.outputPath("failure-state.json"),
        JSON.stringify(snapshots[0] ?? null, null, 2),
      );
      for (let i = 0; i < pages.length; i++)
        writeFileSync(
          testInfo.outputPath(`failure-${i}.txt`),
          await pages[i].locator("body").innerText(),
        );
      throw error;
    } finally {
      await Promise.all(contexts.map((c) => c.close()));
    }
  });
