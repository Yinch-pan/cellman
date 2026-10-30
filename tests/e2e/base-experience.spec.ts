import { hexLabel, bridgeLabel } from "../../apps/web/src/map-coordinates";
import { test, expect, type Page } from "@playwright/test";
import { actionState } from "../../packages/rules/test/fixtures/actions";
import { snakeSetup } from "../../packages/rules/src/setup";
import { createGame } from "../../packages/rules/src/state";
import { applyAction } from "../../packages/rules/src/engine";
import { finishGame } from "../../packages/rules/src/scoring";
import { replayRecord } from "../../packages/rules/src/replay";
import type { GameState } from "../../packages/rules/src/types";

async function open(page: Page, state: GameState) {
  await page.addInitScript((s) => {
    localStorage.setItem("boardgame-demo-v1", JSON.stringify(s));
    localStorage.setItem("cellman-turn-planning", "off");
  }, state);
  await page.goto("/#/demo");
}

test("draft uses board cards and a result matrix, with cancellable selection on mobile", async ({
  page,
}, info) => {
  const state = createGame(
    snakeSetup(
      "draft-ui",
      [1, 2, 3].map((id) => ({ id: String(id), name: `玩家${id}` })),
      "forward",
      () => 0.41,
    ),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, state);
  await expect(page.getByRole("region", { name: "当前行动" })).toContainText(
    "选择一块",
  );
  await expect(
    page.getByText("尚未选择地块", { exact: true }),
  ).not.toBeVisible();
  await expect(page.getByRole("table", { name: "轮抽结果" })).toBeVisible();
  const first = page
    .locator('.setup-option[data-category="native"]:not(:disabled)')
    .first();
  await first.click();
  await expect(first).toHaveAttribute("aria-pressed", "true");
  await expect(
    page
      .getByRole("region", { name: "当前行动" })
      .getByRole("button", { name: "确认提交", exact: true }),
  ).toBeInViewport();
  await page.getByRole("button", { name: "返回修改", exact: true }).click();
  await expect(first).toHaveAttribute("aria-pressed", "false");
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("boardgame-demo-v1")!).revision,
    ),
  ).toBe(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: info.outputPath("draft-mobile.png"),
    fullPage: true,
  });
});

test("desktop reverse draft keeps confirmation above the pool through the final pick", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/#/demo");
  await page
    .getByLabel("本地开局方式", { exact: true })
    .selectOption("reverse");
  await page.getByRole("button", { name: "新开随机对局", exact: true }).click();
  const before = await page.locator(".table-play-area").boundingBox();
  const rail = await page.locator(".table-player-rail").boundingBox();
  expect(rail!.x).toBeGreaterThanOrEqual(before!.x + before!.width);
  for (let pick = 0; pick < 12; pick++) {
    await page.locator(".setup-option:not(:disabled)").first().click();
    const confirm = page
      .getByRole("region", { name: "当前行动" })
      .getByRole("button", { name: "确认提交", exact: true });
    await expect(confirm).toBeInViewport();
    if (pick === 11) {
      await page.screenshot({
        path: info.outputPath("last-draft-confirmation.png"),
      });
    }
    await confirm.click();
    await expect(page.locator("#table-preview")).toHaveCount(0);
    expect(
      await page.evaluate(
        () => JSON.parse(localStorage.getItem("boardgame-demo-v1")!).revision,
      ),
    ).toBe(pick + 1);
  }
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("boardgame-demo-v1")!),
  );
  expect(saved.phase).not.toBe("draft");
  expect(
    Object.values(saved.draftPicks).every(
      (p) => Object.keys(p as object).length === 4,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("desktop-after-draft.png"),
    fullPage: true,
  });
});

test("passing warns about unused specials and cancelling preserves the round", async ({
  page,
}, info) => {
  const state = actionState();
  state.players.p1.bonus = "spade-bonus";
  await open(page, state);
  await page.getByRole("button", { name: "轮次", exact: true }).click();
  await page.getByRole("button", { name: "结束本轮", exact: true }).click();
  await expect(page.locator(".pass-review")).toContainText(
    "尚未使用的特殊行动",
  );
  await expect(page.locator(".pass-review")).toContainText("BON5");
  await page.locator(".preview-panel").screenshot({
    path: info.outputPath("pass-confirmation.png"),
  });
  await page.getByRole("button", { name: "返回修改", exact: true }).click();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("boardgame-demo-v1")!).players.p1
          .passed,
    ),
  ).toBe(false);
  await page.screenshot({
    path: info.outputPath("bonus-market.png"),
    fullPage: true,
  });
});

test("pending bridge can be selected directly on the map and confirmed once", async ({
  page,
}, info) => {
  const s = actionState();
  s.players.p1.bonus = "bridge-bonus";
  s.board.buildings = { B4: { seat: "p1", kind: "workshop" } };
  const result = applyAction(s, "p1", {
    kind: "special",
    source: "bonus:bridge-bonus",
  });
  if (!result.ok) throw Error(result.error.code);
  const state = result.state,
    choice = state.pending.find((c) => c.kind === "bridge")!;
  const pair = choice.options.find(
    (option) =>
      option !== "discard" &&
      applyAction(state, "p1", { kind: "respond", choiceId: choice.id, option })
        .ok,
  )!;
  expect(pair).toBeTruthy();
  await open(page, state);
  await expect(page.getByRole("region", { name: "待处理事项" })).toContainText(
    "选择桥梁位置",
  );
  await page
    .locator(".bridge-target")
    .filter({ has: page.locator("title", { hasText: bridgeLabel(pair) }) })
    .click();
  await page.getByRole("button", { name: "确认提交", exact: true }).click();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("boardgame-demo-v1")!).board.bridges
          .length,
    ),
  ).toBe(1);
  await page.screenshot({
    path: info.outputPath("bridge-built.png"),
    fullPage: true,
  });
});

for (const width of [1440, 390])
  test(`city rewards explain their score and show the affected buildings at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const s = actionState();
    s.board.buildings.A1.cityId = "city:test";
    s.pending = [
      {
        id: "city-choice",
        seat: "p1",
        kind: "city",
        amount: 1,
        options: ["coins", "scholar"],
        source: "city:test",
        continuation: { kind: "resume-turn" },
      },
    ];
    await open(page, s);
    await expect(page.locator(".action-panel")).toContainText("城市建筑群：A1");
    await expect(
      page.getByRole("button", { name: new RegExp(`^${hexLabel("A1")} `) }),
    ).toHaveAttribute("data-available", "true");
    const reward = page
      .locator(".choice-buttons")
      .getByRole("button", { name: /8 分 · 1 学者 · 1 钥匙/ });
    await reward.click();
    await expect(
      page.getByRole("status").filter({ hasText: "城市建筑群中选择" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => JSON.parse(localStorage.getItem("boardgame-demo-v1")!).revision,
      ),
    ).toBe(s.revision);
    await page
      .getByRole("status")
      .filter({ hasText: "城市建筑群中选择" })
      .getByRole("button")
      .click();
    expect(
      await page.evaluate(() =>
        JSON.parse(localStorage.getItem("boardgame-demo-v1")!),
      ),
    ).toEqual(s);
    await reward.click();
    await page.getByRole("button", { name: /^A1 / }).click();
    await page
      .getByRole("button", { name: "确认提交", exact: true })
      .dblclick();
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("boardgame-demo-v1")!),
    );
    expect(saved.players.p1.keys).toBe(1);
    expect(saved.board.buildings.A1.cityTile).toBe("scholar");
    expect(saved.players.p1.vp).toBe(s.players.p1.vp + 8);
    const record = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("boardgame-demo-record")!),
    );
    expect(replayRecord(record).state).toEqual(saved);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath("city-reward.png"),
      fullPage: true,
    });
  });

test("book action and special ability science targets stay independent", async ({
  page,
}) => {
  const state = actionState();
  state.shared.bookActions = ["science", "coins"];
  state.players.p1.bonus = "science-bonus";
  state.players.p1.resources.books = [1, 0, 0, 0];
  await open(page, state);
  await page.getByRole("button", { name: "公共行动", exact: true }).click();
  await page.getByLabel("科学目标").selectOption("2");
  await page.getByLabel("书籍行动科学", { exact: true }).selectOption("3");
  await page.getByLabel("公共动作黄书").fill("1");
  await page.getByRole("button", { name: "执行书籍行动", exact: true }).click();
  await page.getByRole("button", { name: "确认提交", exact: true }).click();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("boardgame-demo-v1")!),
  );
  expect(saved.players.p1.science[3]).toBe(state.players.p1.science[3] + 2);
  expect(saved.players.p1.science[2]).toBe(state.players.p1.science[2]);
  expect(saved.players.p1.usedSpecials).toEqual([]);
});

test("final scores show ranking and auditable resource conversion on mobile", async ({
  page,
}, info) => {
  const s = actionState();
  s.round = 6;
  s.players.p1.resources = {
    coins: 9,
    tools: 3,
    scholars: 1,
    books: [2, 0, 0, 0],
    power: [0, 5, 3],
  };
  finishGame(s);
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, s);
  await expect(page.getByRole("heading", { name: "终局成绩" })).toBeVisible();
  await expect(page.locator(".final-scores")).toContainText(
    "＝20，每 5 换 1 分，余 0",
  );
  await expect(page.getByLabel("下一轮奖励", { exact: true })).toHaveCount(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: info.outputPath("final-mobile.png"),
    fullPage: true,
  });
});
