import { test, expect, type Page } from "@playwright/test";
import { actionState } from "../../packages/rules/test/fixtures/actions";
import type { GameState } from "../../packages/rules/src/types";
async function open(page: Page, s: GameState) {
  await page.addInitScript(() => {
    localStorage.setItem("cellman-turn-planning", "on");
    localStorage.setItem("cellman-conversion-prompt", "never");
  });
  await page.goto("/");
  await page.evaluate((s) => {
    localStorage.setItem("boardgame-demo-v1", JSON.stringify(s));
    localStorage.removeItem("boardgame-demo-record");
  }, s);
  await page.goto("/#/demo");
}
test("private turn draft survives reload, supports undo and publishes exactly once", async ({
  page,
}) => {
  const s = actionState();
  s.players.p1.resources.power = [0, 0, 12];
  await open(page, s);
  await page
    .getByRole("button", { name: "能量板：7 金币", exact: true })
    .click();
  await page.getByRole("button", { name: "确认步骤", exact: true }).click();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("boardgame-demo-v1")!).players.p1
          .resources.coins,
    ),
  ).toBe(15);
  await expect(
    page.getByRole("button", { name: "提交回合", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "撤销上一步", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "提交回合", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "能量板：7 金币", exact: true })
    .click();
  await page.getByRole("button", { name: "确认步骤", exact: true }).click();
  await page.reload();
  await expect(
    page.getByText("本回合试走 · 1 步", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "提交回合", exact: true }).click();
  await page.getByRole("button", { name: "确认提交", exact: true }).click();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("boardgame-demo-v1")!),
  );
  expect(saved.revision).toBe(1);
  expect(saved.activeSeat).toBe("p2");
  expect(saved.players.p1.resources.coins).toBe(22);
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("boardgame-demo-record")!).commands[0]
          .action.kind,
    ),
  ).toBe("turn");
});

test("book action tiles show their own exact costs and effects", async ({
  page,
}) => {
  const s = actionState();
  s.shared.bookActions = ["spades", "guild-score", "upgrade"];
  await open(page, s);
  await expect(
    page.getByRole("button", { name: /书籍行动 · 3 本书 → 3 铲/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /书籍行动 · 2 本书 → 每公会 2 分/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /书籍行动 · 2 本书 → 免费升级公会/ }),
  ).toBeVisible();
});
test("board spade -> terrain -> conversion -> construction -> atomic publication", async ({
  page,
}, info) => {
  const s = actionState();
  s.board.buildings = { B4: { seat: "p1", kind: "workshop" } };
  s.players.p1.resources.tools = 0;
  s.players.p1.resources.power = [0, 0, 8];
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, s);
  await page.getByRole("button", { name: "能量板：1 铲", exact: true }).click();
  await page.getByRole("button", { name: /^C5 / }).click();
  // Selecting the target while an action is chosen must retain that action.
  await page.getByRole("button", { name: "使用铲子", exact: true }).click();
  await page.getByRole("button", { name: "确认步骤", exact: true }).click();
  await expect(page.getByText(/C5 已完成改造/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "建造工坊", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("转换方式").selectOption("1");
  await page.getByRole("button", { name: "转换资源", exact: true }).click();
  await page.getByRole("button", { name: "确认步骤", exact: true }).click();
  await page.getByRole("button", { name: "建造工坊", exact: true }).click();
  await page.getByRole("button", { name: "确认步骤", exact: true }).click();
  await page.getByRole("button", { name: "提交回合", exact: true }).click();
  await page.getByRole("button", { name: "确认提交", exact: true }).click();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("boardgame-demo-v1")!),
  );
  expect(saved.board.buildings.C5).toEqual({ seat: "p1", kind: "workshop" });
  expect(saved.players.p1.resources).toMatchObject({
    tools: 0,
    coins: 13,
    power: [7, 0, 1],
  });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: info.outputPath("turn-mobile.png"),
    fullPage: true,
  });
});
test("interactive tutorial completes all eight real-rule steps and can reset", async ({
  page,
}) => {
  await page.goto("/#/tutorial");
  const buttons = [
    "预览起始放置",
    "点击奖励铲",
    "预览地形改造",
    "预览资源转换",
    "预览建造",
    "预览结束回合",
    "接受 2 能量，支付 1 分",
    "预览结束本轮",
  ];
  for (let i = 0; i < buttons.length; i++) {
    if (i === 0) await page.getByRole("button", { name: /^B4 / }).click();
    if (i === 2) await page.getByRole("button", { name: /^C5 / }).click();
    await page.getByRole("button", { name: buttons[i], exact: true }).click();
    await page
      .getByRole("button", { name: "确认教学步骤", exact: true })
      .click();
  }
  await expect(page.getByRole("heading", { name: "练习完成" })).toBeVisible();
  await expect(page.getByText(/第 2 轮 ·/)).toBeVisible();
  await page.getByRole("button", { name: "重新开始教学", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "选择起始位置" }),
  ).toBeVisible();
});
