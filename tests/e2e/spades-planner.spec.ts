import { hexLabel } from "../../apps/web/src/map-coordinates";
import { test, expect, type Page } from "@playwright/test";
import { auditState } from "../../packages/rules/test/fixtures/content-audit";
import { applyAction } from "../../packages/rules/src/engine";
import { replayRecord } from "../../packages/rules/src/replay";
import { queueChoice } from "../../packages/rules/src/responses";
import type { GameState } from "../../packages/rules/src/types";

const saved = (p: Page): Promise<GameState> =>
  p.evaluate(() => JSON.parse(localStorage.getItem("boardgame-demo-v1")!));
const hex = (p: Page, id: string) =>
  p.locator(`[data-hex="${id}"]`).click();
const editor = (p: Page) => p.locator("#table-action-editor");
async function open(p: Page, s = auditState(), planning = false) {
  s.players.p1.resources.power = [0, 0, 12];
  await p.addInitScript(
    ({ s, planning }) => {
      if (sessionStorage.getItem("spades-test-initialized")) return;
      localStorage.clear();
      sessionStorage.setItem("spades-test-initialized", "yes");
      localStorage.setItem("boardgame-demo-v1", JSON.stringify(s));
      localStorage.setItem("cellman-turn-planning", planning ? "on" : "off");
      localStorage.setItem("cellman-step-review", "off");
      localStorage.setItem("cellman-conversion-prompt", "never");
    },
    { s, planning },
  );
  await p.goto("/#/demo");
  return s;
}
async function start(p: Page, id = "spades") {
  await p.locator(`[data-table-action="power:${id}"]`).click();
  await editor(p)
    .getByRole("button", { name: "到地图选择目标", exact: true })
    .click();
}
async function verifyReplay(p: Page) {
  const record = await p.evaluate(() =>
    JSON.parse(localStorage.getItem("boardgame-demo-record")!),
  );
  expect(replayRecord(record).state).toEqual(await saved(p));
}
for (const width of [1440, 390])
  test(`${width}px split two spades, retain surplus, build and pay once`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const s = await open(page);
    await start(page);
    await hex(page, "C5");
    await expect(editor(page)).toContainText("剩余 1 铲会保留");
    expect(await saved(page)).toEqual(s);
    await editor(page)
      .getByRole("button", { name: "使用铲子", exact: true })
      .click();
    await expect.poll(async () => (await saved(page)).revision).toBe(1);
    const first = await saved(page);
    expect(first.board.terrain.C5).toBe("forest");
    expect(first.board.buildings.C5).toBeUndefined();
    expect(first.players.p1.resources.power).toEqual([6, 0, 6]);
    const surplus = first.pending.find((c) => c.kind === "spades")!;
    const build = first.pending.find((c) => c.kind === "buildWorkshop")!;
    expect(build.dependsOn).toEqual([surplus.id]);
    await page.reload();
    expect(await saved(page)).toEqual(first);
    await expect(page.locator(`[data-choice-id="${build.id}"]`)).toHaveCount(0);
    const panel = page.locator(`[data-choice-id="${surplus.id}"]`);
    await hex(page, "B5");
    await expect(panel.getByLabel("在第一个地块建造工坊")).toHaveCount(0);
    await panel.screenshot({
      path: info.outputPath(`spades-surplus-${width}.png`),
    });
    await panel.getByRole("button", { name: "使用铲子", exact: true }).click();
    await expect.poll(async () => (await saved(page)).revision).toBe(2);
    const afterTerrain = await saved(page);
    expect(afterTerrain.board.terrain).toMatchObject({
      C5: "forest",
      B5: "forest",
    });
    expect(afterTerrain.players.p1.resources.tools).toBe(
      s.players.p1.resources.tools,
    );
    expect(afterTerrain.players.p1.resources.coins).toBe(
      s.players.p1.resources.coins,
    );
    expect(afterTerrain.players.p1.resources.power).toEqual([6, 0, 6]);
    const buildHex = width === 390 ? "B5" : "C5";
    await page.reload();
    expect(await saved(page)).toEqual(afterTerrain);
    if (width === 390) await hex(page, buildHex);
    else
      await page
        .locator(`[data-choice-id="${build.id}"]`)
        .getByRole("button", {
          name: `${hexLabel(buildHex)} 建造工坊`,
          exact: true,
        })
        .click();
    await page.getByRole("button", { name: "返回修改", exact: true }).click();
    expect(await saved(page)).toEqual(afterTerrain);
    await hex(page, buildHex);
    await page.getByRole("button", { name: "确认提交", exact: true }).click();
    await expect.poll(async () => (await saved(page)).revision).toBe(3);
    const afterBuild = await saved(page);
    expect(afterBuild.board.buildings[buildHex].kind).toBe("workshop");
    expect(
      afterBuild.board.buildings[buildHex === "C5" ? "B5" : "C5"],
    ).toBeUndefined();
    expect(afterBuild.players.p1.resources.tools).toBe(
      s.players.p1.resources.tools - 1,
    );
    expect(afterBuild.players.p1.resources.coins).toBe(
      s.players.p1.resources.coins - 2,
    );
    expect(afterBuild.players.p1.resources.power).toEqual([6, 0, 6]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await verifyReplay(page);
  });
test("two spades on one hex and extra-tool costs are explicit", async ({
  page,
}) => {
  await open(page);
  await start(page);
  await hex(page, "A5");
  await expect(editor(page).locator(".spades-budget")).toContainText(
    "还需支付 3 工具",
  );
  await editor(page)
    .getByRole("combobox", { name: "改造目标", exact: true })
    .selectOption("lake");
  await expect(editor(page).locator(".spades-budget")).not.toContainText(
    "工具",
  );
  await expect(editor(page).locator(".spades-budget")).toContainText(
    "剩余 0 铲",
  );
  await editor(page)
    .getByRole("button", { name: "使用铲子", exact: true })
    .click();
  await expect
    .poll(async () => (await saved(page)).board.terrain.A5)
    .toBe("lake");
  expect((await saved(page)).players.p1.resources.tools).toBe(20);
  await verifyReplay(page);
});
test("discarding paid surplus requires confirmation and preserves the first terrain", async ({
  page,
}) => {
  await open(page);
  await start(page);
  await hex(page, "C5");
  await editor(page)
    .getByRole("button", { name: "使用铲子", exact: true })
    .click();
  await expect.poll(async () => (await saved(page)).revision).toBe(1);
  const first = await saved(page);
  const c = first.pending.find((c) => c.kind === "spades")!;
  const panel = page.locator(`[data-choice-id="${c.id}"]`);
  await panel
    .getByRole("button", { name: "放弃剩余铲子", exact: true })
    .click();
  await page.getByRole("button", { name: "返回修改", exact: true }).click();
  expect(await saved(page)).toEqual(first);
  await panel
    .getByRole("button", { name: "放弃剩余铲子", exact: true })
    .click();
  await page.getByRole("button", { name: "确认提交", exact: true }).click();
  await expect.poll(async () => (await saved(page)).revision).toBe(2);
  const after = await saved(page);
  expect(after.board.terrain.C5).toBe("forest");
  expect(after.players.p1.resources.power).toEqual([6, 0, 6]);
  expect(after.pending.map((c) => c.kind)).toEqual(["buildWorkshop"]);
  await verifyReplay(page);
});
test("an incomplete first terrain cannot split; unreachable targets cannot submit", async ({
  page,
}) => {
  await open(page);
  await start(page);
  await hex(page, "A4");
  await editor(page)
    .getByRole("combobox", { name: "改造目标", exact: true })
    .selectOption("lake");
  await expect(editor(page)).toContainText("须先把上一块改造成家园地形");
  await expect(
    editor(page).getByRole("button", { name: "保留此块，继续分配剩余 1 铲" }),
  ).toBeDisabled();
  await hex(page, "I13");
  await expect(
    editor(page).getByRole("button", { name: "使用铲子", exact: true }),
  ).toBeDisabled();
  expect((await saved(page)).revision).toBe(0);
});
test("science spades may split partial transformations without building or buying", async ({
  page,
}) => {
  const s = auditState();
  s.phase = "science";
  s.passOrder = [...s.turnOrder];
  s.pending = [
    {
      id: "science-spades",
      seat: "p1",
      kind: "spades",
      amount: 2,
      options: ["terraform", "discard"],
      source: "round-science",
      continuation: { kind: "resume-turn" },
      canBuild: false,
      canBuySpades: false,
    },
  ];
  await open(page, s);
  await hex(page, "A5");
  const panel = page.locator('[data-choice-id="science-spades"]');
  await expect(
    panel.getByRole("button", { name: "使用铲子", exact: true }),
  ).toBeDisabled();
  await panel
    .getByRole("combobox", { name: "改造目标", exact: true })
    .selectOption("swamp");
  await panel
    .getByRole("button", { name: "保留此块，继续分配剩余 1 铲" })
    .click();
  await hex(page, "A4");
  await panel
    .getByRole("combobox", { name: "改造目标", exact: true })
    .selectOption("lake");
  await expect(panel.getByLabel("在第一个地块建造工坊")).toHaveCount(0);
  await panel.getByRole("button", { name: "使用铲子", exact: true }).click();
  await expect.poll(async () => (await saved(page)).revision).toBe(1);
  const n = await saved(page);
  expect(n.board.terrain).toMatchObject({ A5: "swamp", A4: "lake" });
  expect(n.board.buildings).toEqual(s.board.buildings);
  await verifyReplay(page);
});

for (const source of ["public", "reward"] as const)
  test(`${source} spade in quick mode keeps a separate building decision without construction resources`, async ({
    page,
  }, info) => {
    const state = auditState();
    state.players.p1.resources.tools = 0;
    state.players.p1.resources.coins = 0;
    if (source === "reward") {
      state.players.p1.primaryDone = true;
      queueChoice(state, "p1", "spades", 1, ["terraform", "discard"], "palace");
    }
    await page.setViewportSize({ width: 390, height: 900 });
    await open(page, state);
    if (source === "public") await start(page, "spade");
    await hex(page, "C5");
    const form =
      source === "public"
        ? editor(page)
        : page.locator(`[data-choice-id="${state.pending[0].id}"]`);
    await expect(form.getByLabel("在第一个地块建造工坊")).toHaveCount(0);
    await form.getByRole("button", { name: "使用铲子", exact: true }).click();
    await expect.poll(async () => (await saved(page)).revision).toBe(1);
    const terrain = await saved(page);
    expect(terrain.board.terrain.C5).toBe("forest");
    expect(terrain.board.buildings.C5).toBeUndefined();
    expect(terrain.players.p1.resources.tools).toBe(0);
    expect(terrain.players.p1.resources.coins).toBe(0);
    const choice = terrain.pending.find((c) => c.kind === "buildWorkshop")!;
    const panel = page.locator(`[data-choice-id="${choice.id}"]`);
    await expect(
      panel.getByRole("button", { name: "建造工坊", exact: true }),
    ).toBeDisabled();
    await panel.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: info.outputPath(`separate-build-${source}-390.png`),
    });
    await panel.getByRole("button", { name: "不建造", exact: true }).click();
    await page
      .locator("#table-preview")
      .getByRole("button", { name: "确认提交", exact: true })
      .click();
    const declined = await saved(page);
    expect(declined.revision).toBe(2);
    expect(declined.board.terrain.C5).toBe("forest");
    expect(declined.board.buildings.C5).toBeUndefined();
    expect(declined.pending).toEqual([]);
    await verifyReplay(page);
  });
