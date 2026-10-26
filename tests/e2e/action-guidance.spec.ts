import { test, expect, type Page } from "@playwright/test";
import { actionState } from "../../packages/rules/test/fixtures/actions";
import { sampleSetup } from "../../packages/rules/test/fixtures/setup";
import { createGame } from "../../packages/rules/src/state";
import { applyAction } from "../../packages/rules/src/engine";
import type { GameState } from "../../packages/rules/src/types";

async function open(page: Page, state: GameState) {
  await page.addInitScript(
    (s) => localStorage.setItem("boardgame-demo-v1", JSON.stringify(s)),
    state,
  );
  await page.goto("/#/demo");
}
test("partial terraforming offers only the shortest path and does not build on intermediate terrain", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const s = actionState();
  s.board.buildings = { B4: { seat: "p1", kind: "workshop" } };
  s.players.p1.resources.tools = 10;
  await open(page, s);
  await page.getByRole("button", { name: /^A4 / }).click();
  await page
    .getByRole("region", { name: "地块操作" })
    .getByRole("button", { name: /^详细设置/ })
    .click();
  await expect(page.getByRole("button", { name: /^A4 / })).toHaveAttribute(
    "data-available",
    "true",
  );
  expect(
    await page
      .getByLabel("地形改造目标")
      .locator("option")
      .evaluateAll((nodes) => nodes.map((n) => (n as HTMLOptionElement).value)),
  ).toEqual(["lake", "forest"]);
  await page.getByLabel("地形改造目标").selectOption("lake");
  await expect(page.getByLabel("同时建造工坊")).not.toBeChecked();
  await expect(page.getByLabel("同时建造工坊")).toBeDisabled();
  await expect(page.locator(".action-quote").first()).toContainText(
    "工具 10 → 7",
  );
  await page
    .getByRole("button", { name: "改造与建造", exact: true })
    .click();
  await page.getByRole("button", { name: "确认提交", exact: true }).click();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("boardgame-demo-v1")!),
  );
  expect(saved.board.terrain.A4).toBe("lake");
  expect(saved.board.buildings.A4).toBeUndefined();
  await expect(page.locator(".free-actions")).toHaveAttribute("open", "");
  await expect(
    page.getByRole("button", { name: "结束回合", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".action-tabs")).toHaveCount(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: info.outputPath("after-main-action-mobile.png"),
    fullPage: true,
  });
});

test("unreachable construction is disabled before preview; free conversions are available from construction", async ({
  page,
}) => {
  const s = actionState();
  s.players.p1.resources.power = [0, 0, 12];
  await open(page, s);
  await page.getByRole("button", { name: /^I13 / }).click();
  await expect(
    page.getByRole("button", { name: "改造与建造", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".action-quote.unavailable").first()).toContainText(
    "不在你的可达范围",
  );
  await page.locator(".free-actions summary").click();
  await expect(page.getByLabel("转换方式").locator("option")).toHaveCount(7);
  await page.getByLabel("转换方式").selectOption("1");
  await page.getByRole("button", { name: "转换资源", exact: true }).click();
  await expect(page.locator(".preview-changes")).toContainText("3 → 4");
  await page.getByRole("button", { name: "确认提交", exact: true }).click();
  await expect(page.locator(".action-tabs")).toBeVisible();
});

test("Omar can choose a tower for the first starting placement", async ({
  page,
}) => {
  let s = createGame({
    ...sampleSetup(),
    offers: [
      { native: "forest", faction: "omar", bonus: "coins" },
      { native: "lake", faction: "blessed", bonus: "power" },
      { native: "mountain", faction: "monks", bonus: "guild" },
    ],
  });
  for (const offer of [2, 1, 0]) {
    const result = applyAction(s, s.activeSeat, { kind: "chooseSetup", offer });
    if (!result.ok) throw Error(result.error.code);
    s = result.state;
  }
  await open(page, s);
  await page.getByLabel("起始建筑").selectOption("tower");
  await page.getByRole("button", { name: /^A1 / }).click();
  await page.getByRole("button", { name: "执行行动", exact: true }).click();
  await expect(page.locator(".preview-changes")).toContainText("灯塔");
  await page.getByRole("button", { name: "确认提交", exact: true }).click();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("boardgame-demo-v1")!),
  );
  expect(saved.board.buildings.A1).toEqual({
    seat: "p1",
    kind: "tower",
    neutral: true,
  });
});

test("Moles can select land-spanning public bridges", async ({ page }) => {
  const s = actionState();
  s.players.p1.faction = "moles";
  s.board.buildings = { B4: { seat: "p1", kind: "workshop" } };
  s.players.p1.resources.power = [0, 0, 12];
  await open(page, s);
  await page.getByRole("button", { name: "公共行动", exact: true }).click();
  await page.getByLabel("公共能量动作").selectOption("bridge");
  await page.getByLabel("桥梁位置").selectOption("A3,B4");
  await page.getByRole("button", { name: "执行公共行动", exact: true }).click();
  await page.getByRole("button", { name: "确认提交", exact: true }).click();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("boardgame-demo-v1")!),
  );
  expect(saved.board.bridges).toContainEqual({ seat: "p1", a: "A3", b: "B4" });
});

test("innovation payment shows colours and supplies a valid editable combination", async ({
  page,
}, info) => {
  const s = actionState();
  s.players.p1.resources.books = [2, 2, 2, 0];
  await open(page, s);
  await page.getByRole("button", { name: "研究", exact: true }).click();
  await page
    .getByRole("button", { name: "填入一组可用书籍", exact: true })
    .click();
  await expect(page.getByLabel("支付黄书")).toHaveValue("2");
  await expect(
    page.getByRole("button", { name: "开发革新", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "开发革新", exact: true }).click();
  await expect(page.locator(".preview-changes")).toContainText("15 → 10");
  await page.screenshot({
    path: info.outputPath("innovation-payment.png"),
    fullPage: true,
  });
});

test("a public spade can terraform and build directly without a separate add-target step", async ({
  page,
}) => {
  const s = actionState();
  s.board.buildings = { B4: { seat: "p1", kind: "workshop" } };
  s.players.p1.resources.power = [0, 0, 12];
  await open(page, s);
  await page.getByRole("button", { name: "公共行动", exact: true }).click();
  await page.getByLabel("公共能量动作").selectOption("spade");
  await page.getByRole("button", { name: /^C5 / }).click();
  await page.getByLabel("在第一个地块建造工坊").check();
  await page.getByRole("button", { name: "使用铲子", exact: true }).click();
  await expect(page.locator(".preview-changes")).toContainText("3 → 2");
  await page.getByRole("button", { name: "确认提交", exact: true }).click();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("boardgame-demo-v1")!),
  );
  expect(saved.board.buildings.C5).toEqual({ seat: "p1", kind: "workshop" });
  expect(saved.players.p1.resources.power).toEqual([4, 0, 8]);
});

test("a pending bonus spade lets its owner convert power to the missing building tool", async ({
  page,
}) => {
  const s = actionState();
  s.board.buildings = { B4: { seat: "p1", kind: "workshop" } };
  s.players.p1.bonus = "spade-bonus";
  s.players.p1.resources.tools = 0;
  s.players.p1.resources.power = [0, 0, 3];
  const result = applyAction(s, "p1", {
    kind: "special",
    source: "bonus:spade-bonus",
  });
  if (!result.ok) throw Error(result.error.code);
  await open(page, result.state);
  await page.getByRole("button", { name: /^C5 / }).click();
  await page.getByLabel("在第一个地块建造工坊").check();
  await expect(
    page.getByRole("button", { name: "使用铲子", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("转换方式").selectOption("1");
  await page.getByRole("button", { name: "转换资源", exact: true }).click();
  await page.getByRole("button", { name: "确认提交", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "使用铲子", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "使用铲子", exact: true }).click();
  await page.getByRole("button", { name: "确认提交", exact: true }).click();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("boardgame-demo-v1")!),
  );
  expect(saved.board.buildings.C5).toEqual({ seat: "p1", kind: "workshop" });
  expect(saved.players.p1.resources.tools).toBe(0);
  expect(saved.activeSeat).toBe("p1");
});

test("science spades cannot silently buy missing spades", async ({ page }) => {
  const s = actionState();
  s.phase = "science";
  s.passOrder = [...s.turnOrder];
  s.board.buildings = { B6: { seat: "p1", kind: "workshop" } };
  s.pending = [
    {
      id: "science-spade",
      seat: "p1",
      kind: "spades",
      amount: 1,
      options: ["terraform", "discard"],
      source: "round-science",
      continuation: { kind: "resume-turn" },
      canBuild: false,
      canBuySpades: false,
    },
  ];
  await open(page, s);
  await page.getByRole("button", { name: /^C7 / }).click();
  await expect(page.locator(".free-actions")).toHaveCount(0);
  await expect(page.getByLabel("在第一个地块建造工坊")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "使用铲子", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("combobox", { name: "改造目标", exact: true })
    .selectOption("lake");
  await expect(
    page.getByRole("button", { name: "使用铲子", exact: true }),
  ).toBeEnabled();
});

test("illusionists see the discounted power price before selecting an action", async ({
  page,
}) => {
  const s = actionState();
  s.players.p1.faction = "illusionists";
  s.players.p1.resources.power = [0, 0, 3];
  await open(page, s);
  await page.getByRole("button", { name: "公共行动", exact: true }).click();
  await expect(
    page.getByLabel("公共能量动作").locator('option[value="coins"]'),
  ).toHaveText("3 能量 → 7 金币");
  await expect(
    page.getByRole("button", { name: "执行公共行动", exact: true }),
  ).toBeEnabled();
});
