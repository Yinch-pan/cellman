import { hexLabel } from "../../apps/web/src/map-coordinates";
import { test, expect, type Page } from "@playwright/test";
import { auditState } from "../../packages/rules/test/fixtures/content-audit";
import { innovations } from "../../packages/rules/src/content";
import { competencyIds } from "../../packages/rules/src/catalog";
import { competencyOptions } from "../../packages/rules/src/actions/competency";
import { queueChoice } from "../../packages/rules/src/responses";
import {
  applyAction,
  getAvailableChoices,
} from "../../packages/rules/src/engine";
import { replayRecord } from "../../packages/rules/src/replay";
import { bridgeSites } from "../../packages/rules/src/map";
import { label } from "../../apps/web/src/api";
import { specialOptions } from "../../apps/web/src/i18n/presentation";
import type { GameState, GameAction } from "../../packages/rules/src/types";

// Fixtures set up an isolated situation only. All tested actions are real clicks;
// state inspection and replay are read-only assertions, never a submit shortcut.
const bookIds = [
  "power",
  "science",
  "coins",
  "upgrade",
  "guild-score",
  "spades",
];
const bookCost: Record<string, number> = {
  power: 1,
  science: 1,
  coins: 2,
  upgrade: 2,
  "guild-score": 2,
  spades: 3,
};
function fixture() {
  const s = auditState();
  s.players.p1.resources.books = [5, 5, 5, 5];
  s.players.p1.resources.power = [0, 0, 12];
  s.shared.bookActions = [...bookIds];
  return s;
}
async function open(
  page: Page,
  state: GameState,
  review = false,
  planning = false,
) {
  await page.addInitScript(
    ({ state, review, planning }) => {
      localStorage.clear();
      localStorage.setItem("boardgame-demo-v1", JSON.stringify(state));
      localStorage.setItem("cellman-step-review", review ? "on" : "off");
      localStorage.setItem("cellman-turn-planning", planning ? "on" : "off");
      localStorage.setItem("cellman-conversion-prompt", "never");
    },
    { state, review, planning },
  );
  await page.goto("/#/demo");
}
const saved = (page: Page): Promise<GameState> =>
  page.evaluate(() => JSON.parse(localStorage.getItem("boardgame-demo-v1")!));
const click = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true }).click();
const hex = (page: Page, id: string) =>
  page.getByRole("button", { name: new RegExp(`^${hexLabel(id)} `) }).click();
async function choosePayment(page: Page, fill = true) {
  const editor = page.locator("#table-action-editor");
  await editor
    .getByRole("button", { name: "继续选择支付书籍", exact: true })
    .click();
  if (fill)
    await editor
      .getByRole("button", { name: "填入一组可用书籍", exact: true })
      .click();
}
async function replay(page: Page) {
  const record = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("boardgame-demo-record")!),
  );
  expect(replayRecord(record).state).toEqual(await saved(page));
}
async function expectRevision(page: Page, revision: number) {
  await expect.poll(async () => (await saved(page)).revision).toBe(revision);
}
async function drain(page: Page) {
  for (let guard = 0; guard < 40; guard++) {
    const s = await saved(page);
    if (!s.pending.length) return;
    const c = getAvailableChoices(s)[0];
    expect(c, "pending choice must be reachable").toBeTruthy();
    const panel = page.locator(`[data-choice-id="${c.id}"]`);
    let action: GameAction;
    if (c.kind === "spades") {
      action = {
        kind: "respond",
        choiceId: c.id,
        option: "terraform",
        terraform: {
          hex: "C5",
          terrain: "forest",
          build: false,
          deferBuild: c.canBuild !== false,
        },
      };
      expect(applyAction(s, c.seat, action).ok).toBe(true);
      if (c.source === "book-action") {
        await page
          .locator("#table-action-editor")
          .getByRole("button", { name: /到地图选择目标|更换目标/ })
          .click();
        await hex(page, "C5");
        await page
          .locator("#table-action-editor")
          .getByRole("button", { name: "使用铲子", exact: true })
          .click();
      } else {
        await hex(page, "C5");
        await panel
          .getByRole("button", { name: "使用铲子", exact: true })
          .click();
      }
      const discard = page.getByRole("button", {
        name: /^确认放弃剩余 \d+ 铲并完成改造$/,
      });
      if (await discard.isVisible()) await discard.click();
    } else if (["neutral", "freeGuild", "freeWorkshop"].includes(c.kind)) {
      const option = c.options.find(
        (option) =>
          option !== "discard" &&
          applyAction(s, c.seat, { kind: "respond", choiceId: c.id, option })
            .ok,
      )!;
      expect(option).toBeTruthy();
      action = { kind: "respond", choiceId: c.id, option };
      await hex(page, option);
      await panel
        .getByRole("button", { name: `放置 ${hexLabel(option)}`, exact: true })
        .click();
    } else {
      const option =
        c.kind === "buildWorkshop"
          ? "discard"
          : c.kind === "leech"
            ? "decline"
            : c.kind === "key"
              ? "use"
              : c.kind === "city"
                ? "coins"
                : c.kind === "competency"
                  ? "immediate-resources"
                  : "0";
      action = { kind: "respond", choiceId: c.id, option };
      if (c.kind === "competency")
        await click(page, `领取 ${label("competency:" + option)}`);
      else {
        const name =
          c.kind === "buildWorkshop"
            ? "不建造"
            : c.kind === "leech"
              ? "放弃"
              : c.kind === "key"
                ? "使用钥匙并继续"
                : c.kind === "city"
                  ? label("city:" + option)
                  : "银行 / 黄";
        await panel
          .locator(".choice-buttons")
          .getByRole("button", { name, exact: c.kind !== "city" })
          .click();
        if (c.kind === "city") {
          action.cityHex = Object.keys(s.board.buildings).find(
            (id) => s.board.buildings[id].cityId === c.source,
          )!;
          await hex(page, action.cityHex);
          await page
            .locator("#table-preview")
            .getByRole("button", { name: "确认提交", exact: true })
            .click();
        }
        if (c.kind === "book")
          await panel
            .getByRole("button", { name: "确认提交", exact: true })
            .click();
        if (c.kind === "buildWorkshop")
          await page
            .locator("#table-preview")
            .getByRole("button", { name: "确认提交", exact: true })
            .click();
      }
    }
    const expected = applyAction(s, c.seat, action);
    expect(expected.ok).toBe(true);
    await expectRevision(page, s.revision + 1);
    if (expected.ok)
      expect(await saved(page)).toEqual({
        ...expected.state,
        revision: s.revision + 1,
      });
  }
  throw Error("Pending choices did not finish");
}
test.beforeEach(async ({ page }) => {
  page.setDefaultTimeout(10000);
  page.on("pageerror", (error) => {
    throw error;
  });
});

for (const id of ["scholar", "tools", "coins", "bridge", "spade", "spades"])
  test(`public power ${id}: board click pays once and applies effect`, async ({
    page,
  }) => {
    const s = fixture();
    let action: GameAction = { kind: "powerAction", id };
    if (id === "bridge") {
      const pair = bridgeSites.find(
        ([a, b]) => applyAction(s, "p1", { kind: "powerAction", id, a, b }).ok,
      )!;
      expect(pair).toBeTruthy();
      action = { kind: "powerAction", id, a: pair[0], b: pair[1] };
    }
    if (id === "spade" || id === "spades")
      action = {
        kind: "powerAction",
        id,
        hex: "C5",
        terrain: "forest",
        build: false,
        deferBuild: true,
        additional: [],
      };
    const expected = applyAction(s, "p1", action);
    expect(expected.ok).toBe(true);
    await open(page, s);
    await page.locator(`[data-table-action="power:${id}"]`).click();
    const editor = page.locator("#table-action-editor");
    if (id === "bridge" && action.kind === "powerAction") {
      await editor
        .getByRole("combobox")
        .selectOption(`${action.a},${action.b}`);
      await editor
        .getByRole("button", { name: "执行此行动", exact: true })
        .click();
    } else if (id === "spade" || id === "spades") {
      await editor
        .getByRole("button", { name: "到地图选择目标", exact: true })
        .click();
      await hex(page, "C5");
      await expect(editor.getByLabel("在第一个地块建造工坊")).toHaveCount(0);
      await editor
        .getByRole("button", { name: "使用铲子", exact: true })
        .click();
      const discard = page.getByRole("button", {
        name: /^确认放弃剩余 \d+ 铲并完成改造$/,
      });
      if (await discard.isVisible()) await discard.click();
    }
    await expectRevision(page, 1);
    if (expected.ok)
      expect(await saved(page)).toEqual({
        ...expected.state,
        revision: s.revision + 1,
      });
    await expect(
      page.locator(`[data-table-action="power:${id}"]`),
    ).toBeDisabled();
    await replay(page);
  });

for (const width of [1440, 390]) {
  for (const id of bookIds)
    test(`${width}px public book ${id}: local payment, cancel, execute and follow-up`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 900 });
      const s = fixture();
      if (id === "power") s.players.p1.resources.power = [0, 12, 0];
      if (id === "guild-score") s.board.buildings.B4.kind = "guild";
      await open(page, s);
      const tile = page.locator(`[data-table-action="book:${id}"]`);
      await tile.click();
      const editor = page.locator("#table-book-actions #table-action-editor");
      await expect(editor).toBeVisible();
      await editor
        .getByRole("button", { name: "取消操作", exact: true })
        .click();
      expect(await saved(page)).toEqual(s);
      await expect(tile).toBeFocused();
      await tile.click();
      if (id === "coins") await choosePayment(page);
      if (id === "upgrade") {
        const payment = await editor
          .locator('input[type="number"]')
          .evaluateAll((nodes) =>
            nodes.map((n) => (n as HTMLInputElement).value),
          );
        await editor
          .getByRole("button", { name: "到地图选择目标", exact: true })
          .click();
        await hex(page, "B4");
        await expect(page.locator(".map-context-panel")).toHaveCount(0);
        expect(
          await editor
            .locator('input[type="number"]')
            .evaluateAll((nodes) =>
              nodes.map((n) => (n as HTMLInputElement).value),
            ),
        ).toEqual(payment);
      }
      if (id === "science")
        await editor.getByRole("combobox").selectOption("2");
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      if (id === "coins")
        await editor.screenshot({
          path: info.outputPath(`book-payment-${width}.png`),
        });
      await editor
        .getByRole("button", { name: "执行此行动", exact: true })
        .click();
      await expectRevision(page, s.revision + 1);
      let n = await saved(page);
      expect(n.players.p1.resources.books.reduce((a, b) => a + b)).toBe(
        20 - bookCost[id],
      );
      expect(n.shared.usedActions).toContain(`book:${id}`);
      if (id === "coins") expect(n.players.p1.resources.coins).toBe(36);
      if (id === "power")
        expect(n.players.p1.resources.power).toEqual([0, 7, 5]);
      if (id === "science") expect(n.players.p1.science[2]).toBe(2);
      if (id === "upgrade") expect(n.board.buildings.B4.kind).toBe("guild");
      if (id === "guild-score")
        expect(n.players.p1.vp).toBe(s.players.p1.vp + 2);
      await drain(page);
      n = await saved(page);
      if (id === "spades") expect(n.board.terrain.C5).toBe("forest");
      expect(n.players.p1.resources.books.reduce((a, b) => a + b)).toBe(
        20 - bookCost[id],
      );
      await expect(tile).toBeDisabled();
      await replay(page);
    });
}

for (const id of Object.keys(innovations))
  test(`innovation ${id}: acquire from market and finish immediate choices`, async ({
    page,
  }) => {
    const s = fixture();
    s.setup.innovations = [id];
    s.setup.innovationCosts = { [id]: [2, 0, 0, 0] };
    s.shared.innovations = [id];
    await open(page, s);
    await page.locator(`[data-table-action="innovation:${id}"]`).click();
    await page
      .getByRole("button", { name: "继续选择支付书籍", exact: true })
      .click();
    await page
      .locator("#table-innovations #table-action-editor")
      .getByRole("button", { name: "填入一组可用书籍", exact: true })
      .click();
    await page
      .locator("#table-innovations #table-action-editor")
      .getByRole("button", { name: "执行此行动", exact: true })
      .click();
    await expectRevision(page, s.revision + 1);
    const n = await saved(page);
    expect(n.players.p1.innovations).toEqual([id]);
    expect(n.players.p1.resources.coins).toBe(25);
    expect(n.shared.innovations).not.toContain(id);
    await drain(page);
    expect((await saved(page)).pending).toEqual([]);
    await replay(page);
  });

for (const id of competencyIds)
  test(`FAV ${id}: acquire from supply, apply gains and resolve choices`, async ({
    page,
  }) => {
    const s = fixture();
    queueChoice(
      s,
      "p1",
      "competency",
      1,
      competencyOptions(s, s.players.p1),
      "school",
    );
    const choice = s.pending[0];
    const expected = applyAction(s, "p1", {
      kind: "respond",
      choiceId: choice.id,
      option: id,
    });
    expect(expected.ok).toBe(true);
    await open(page, s);
    await click(page, `领取 ${label("competency:" + id)}`);
    await expectRevision(page, s.revision + 1);
    if (expected.ok)
      expect(await saved(page)).toEqual({
        ...expected.state,
        revision: s.revision + 1,
      });
    await drain(page);
    await replay(page);
  });

test("inline detailed confirmation stays local and can be cancelled", async ({
  page,
}, info) => {
  const s = fixture();
  await open(page, s, true);
  await page.locator('[data-table-action="book:coins"]').click();
  await choosePayment(page);
  const editor = page.locator("#table-action-editor");
  await editor.getByRole("button", { name: "执行此行动", exact: true }).click();
  await expect(editor.locator(".preview-panel")).toBeVisible();
  await expect(page.locator(".action-panel .preview-panel")).toHaveCount(0);
  await editor.screenshot({ path: info.outputPath("inline-confirmation.png") });
  await editor.getByRole("button", { name: "返回修改", exact: true }).click();
  expect(await saved(page)).toEqual(s);
  await editor.getByRole("button", { name: "执行此行动", exact: true }).click();
  await editor.getByRole("button", { name: "确认提交", exact: true }).click();
  await expectRevision(page, 1);
});

test("invalid payment, Escape and map cancellation preserve the real state", async ({
  page,
}) => {
  const s = fixture();
  await open(page, s);
  await page.locator('[data-table-action="book:coins"]').click();
  await choosePayment(page, false);
  const editor = page.locator("#table-action-editor");
  for (const input of await editor.locator('input[type="number"]').all())
    await input.fill("0");
  await expect(
    editor.getByRole("button", { name: "执行此行动", exact: true }),
  ).toBeDisabled();
  await editor.press("Escape");
  await expect(editor).toHaveCount(0);
  expect(await saved(page)).toEqual(s);
  await page.locator('[data-table-action="book:upgrade"]').click();
  await editor
    .getByRole("button", { name: "到地图选择目标", exact: true })
    .click();
  await page
    .locator(".table-map-prompt")
    .getByRole("button", { name: "取消操作", exact: true })
    .click();
  await expect(editor).toHaveCount(0);
  expect(await saved(page)).toEqual(s);
});

test("direct map selection retains the chosen public action and mobile shortcut returns to its editor", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, fixture());
  await page.locator('[data-table-action="book:upgrade"]').click();
  // Users can also reach the map by scrolling or by the fixed map shortcut.
  const nav = page.getByRole("navigation", { name: "对局快捷导航" });
  await nav.getByRole("button", { name: "地图", exact: true }).click();
  await hex(page, "B4");
  const editor = page.locator("#table-action-editor");
  await expect(editor).toContainText(`已选地块：${hexLabel("B4")}`);
  await expect(page.locator(".map-context-panel")).toHaveCount(0);
  await nav.getByRole("button", { name: "地图", exact: true }).click();
  await nav.getByRole("button", { name: "操作", exact: true }).click();
  await expect(editor).toBeInViewport();
  await editor
    .getByRole("button", { name: "执行此行动", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath("inline-operation-mobile.png"),
  });
  await editor.getByRole("button", { name: "执行此行动", exact: true }).click();
  await expectRevision(page, 1);
  expect((await saved(page)).board.buildings.B4.kind).toBe("guild");
});

const conversionPairs = [
  ["power", "coin"],
  ["power", "tool"],
  ["power", "scholar"],
  ["power", "book"],
  ["scholar", "tool"],
  ["tool", "coin"],
  ["book", "coin"],
] as const;
for (const [index, [from, to]] of conversionPairs.entries())
  for (const color of from === "book" || to === "book"
    ? ([0, 1, 2, 3] as const)
    : ([0] as const)) {
    test(`branch conversion ${from}-${to} colour ${color}: exact resources, maximum and no main action consumed`, async ({
      page,
    }) => {
      const s = fixture();
      const action: GameAction = { kind: "convert", from, to, color, count: 1 };
      const expected = applyAction(s, "p1", action);
      expect(expected.ok).toBe(true);
      await open(page, s);
      await page.locator(".free-actions summary").click();
      const form = page.locator(".free-actions");
      await form.getByLabel("转换方式").selectOption(String(index));
      if (from === "book" || to === "book")
        await form.getByRole("combobox").last().selectOption(String(color));
      const number = form.getByRole("spinbutton");
      await number.fill("999");
      await expect(
        form.getByRole("button", { name: "转换资源", exact: true }),
      ).toBeDisabled();
      await number.fill("1");
      await form.getByRole("button", { name: "转换资源", exact: true }).click();
      await expectRevision(page, 1);
      if (expected.ok)
        expect(await saved(page)).toEqual({ ...expected.state, revision: 1 });
      expect((await saved(page)).players.p1.primaryDone).toBe(false);
      await replay(page);
    });
  }

test("branch burn moves power once and stops when the second bowl cannot pay", async ({
  page,
}) => {
  const s = fixture();
  s.players.p1.resources.power = [0, 2, 0];
  await open(page, s);
  await page.locator(".free-actions summary").click();
  const button = page
    .locator(".free-actions")
    .getByRole("button", { name: /燃烧/ });
  await button.click();
  await expectRevision(page, 1);
  expect((await saved(page)).players.p1.resources.power).toEqual([0, 0, 1]);
  await expect(button).toBeDisabled();
  await replay(page);
});

for (const source of [
  "innovation:deus-ex-machina",
  "innovation:professors",
  "competency:power-special",
  "annex",
])
  test(`branch special ${source}: active use after acquiring the tile`, async ({
    page,
  }) => {
    const s = fixture();
    s.players.p1.resources.power = [0, 12, 0];
    if (source.startsWith("innovation:"))
      s.players.p1.innovations = [source.split(":")[1]];
    if (source.startsWith("competency:"))
      s.players.p1.competencies = ["power-special"];
    if (source === "annex") s.players.p1.annexes = 2;
    const action: GameAction = {
      kind: "special",
      source,
      ...(source === "annex" ? { hex: "B4" } : {}),
    };
    const expected = applyAction(s, "p1", action);
    expect(expected.ok).toBe(true);
    await open(page, s);
    const name = specialOptions(s.players.p1).find(
      (o) => o.id === source,
    )!.label;
    if (source === "annex") {
      await click(page, "公共行动");
      await hex(page, "B4");
      await page
        .locator(".action-panel")
        .getByRole("button", { name, exact: true })
        .click();
    } else
      await page
        .locator(".board-actions")
        .getByRole("button", { name, exact: true })
        .click();
    await expectRevision(page, 1);
    if (expected.ok)
      expect(await saved(page)).toEqual({ ...expected.state, revision: 1 });
    await drain(page);
    if (source === "annex")
      expect((await saved(page)).board.buildings.B4.annex).toBe(true);
    await replay(page);
  });

for (const track of [0, 1, 2, 3] as const)
  for (const slot of [0, 1, 2, 3, null])
    test(`branch scholar ${track}/${slot}: board slot advances correct discipline`, async ({
      page,
    }) => {
      const s = fixture();
      const expected = applyAction(s, "p1", { kind: "scholar", track, slot });
      expect(expected.ok).toBe(true);
      await open(page, s);
      await page
        .locator(".scholar-board > div")
        .nth(track)
        .getByRole("button")
        .nth(slot ?? 4)
        .click();
      await expectRevision(page, 1);
      if (expected.ok)
        expect(await saved(page)).toEqual({ ...expected.state, revision: 1 });
      await replay(page);
    });

for (const option of ["use", "stop"] as const)
  test(`branch science key ${option}: explicit choice does not spend twice`, async ({
    page,
  }) => {
    const s = fixture();
    s.players.p1.science[0] = 7;
    s.players.p1.keys = 1;
    await open(page, s);
    await page
      .locator(".scholar-board > div")
      .first()
      .getByRole("button")
      .first()
      .click();
    await expectRevision(page, 1);
    await click(
      page,
      option === "use" ? "使用钥匙并继续" : "保留钥匙，停在 7 级",
    );
    await expectRevision(page, 2);
    const n = await saved(page);
    expect(n.players.p1.science[0]).toBe(option === "use" ? 10 : 7);
    expect(n.players.p1.keysUsed).toBe(option === "use" ? 1 : 0);
    await replay(page);
  });

for (const option of ["accept", "decline"] as const)
  test(`branch leech ${option}: response applies exact points and power`, async ({
    page,
  }) => {
    const s = fixture();
    s.players.p1.resources.power = [0, 12, 0];
    queueChoice(s, "p1", "leech", 2, ["accept", "decline"], "p2:B5");
    const expected = applyAction(s, "p1", {
      kind: "respond",
      choiceId: s.pending[0].id,
      option,
    });
    expect(expected.ok).toBe(true);
    await open(page, s);
    await page
      .locator(`[data-choice-id="${s.pending[0].id}"]`)
      .getByRole("button", {
        name: option === "accept" ? "接受" : "放弃",
        exact: true,
      })
      .click();
    await expectRevision(page, 1);
    if (expected.ok)
      expect(await saved(page)).toEqual({ ...expected.state, revision: 1 });
    await replay(page);
  });

for (const id of [
  "tools",
  "spades",
  "books",
  "coins",
  "science",
  "power",
  "scholar",
])
  test(`remaining city ${id}: choose tile and complete every reward`, async ({
    page,
  }) => {
    const s = fixture();
    s.players.p1.resources.power = [0, 12, 0];
    s.board.buildings.B4.cityId = "city:acceptance";
    queueChoice(s, "p1", "city", 1, [id], "city:acceptance");
    const expected = applyAction(s, "p1", {
      kind: "respond",
      choiceId: s.pending[0].id,
      option: id,
      cityHex: "B4",
    });
    expect(expected.ok).toBe(true);
    await open(page, s);
    await page
      .locator(`[data-choice-id="${s.pending[0].id}"] .choice-buttons`)
      .getByRole("button", { name: new RegExp(label("city:" + id)) })
      .click();
    await hex(page, "B4");
    await page
      .locator("#table-preview")
      .getByRole("button", { name: "确认提交", exact: true })
      .click();
    await expectRevision(page, 1);
    if (expected.ok)
      expect(await saved(page)).toEqual({ ...expected.state, revision: 1 });
    await drain(page);
    expect((await saved(page)).players.p1.keys).toBe(1);
    await replay(page);
  });

test("remaining inline trial double click, undo and publish produce only one payment", async ({
  page,
}) => {
  const s = fixture();
  await open(page, s, false, true);
  const tile = page.locator('[data-table-action="book:coins"]');
  await tile.click();
  await choosePayment(page);
  await page
    .locator("#table-action-editor")
    .getByRole("button", { name: "执行此行动", exact: true })
    .dblclick();
  await expect(
    page.getByText("本回合试走 · 1 步", { exact: true }),
  ).toBeVisible();
  expect((await saved(page)).players.p1.resources.coins).toBe(30);
  await click(page, "撤销上一步");
  await tile.click();
  await choosePayment(page);
  await page
    .locator("#table-action-editor")
    .getByRole("button", { name: "执行此行动", exact: true })
    .click();
  await click(page, "提交回合");
  await expectRevision(page, 1);
  const n = await saved(page);
  expect(n.players.p1.resources.coins).toBe(36);
  expect(n.players.p1.resources.books.reduce((a, b) => a + b)).toBe(18);
  expect(n.activeSeat).toBe("p2");
  await replay(page);
});

test("remaining book spade discard requires confirmation and leaves the paid action consumed", async ({
  page,
}) => {
  await open(page, fixture());
  await page.locator('[data-table-action="book:spades"]').click();
  const editor = page.locator("#table-action-editor");
  await editor.getByRole("button", { name: "执行此行动", exact: true }).click();
  await expectRevision(page, 1);
  await editor.getByRole("button", { name: /放弃剩余铲子/ }).click();
  await expectRevision(page, 1);
  await editor.getByRole("button", { name: "返回修改", exact: true }).click();
  expect((await saved(page)).pending).toHaveLength(1);
  await editor.getByRole("button", { name: /放弃剩余铲子/ }).click();
  await editor.getByRole("button", { name: "确认提交", exact: true }).click();
  await expectRevision(page, 2);
  const n = await saved(page);
  expect(n.pending).toEqual([]);
  expect(n.players.p1.resources.books.reduce((a, b) => a + b)).toBe(17);
  expect(n.shared.usedActions).toContain("book:spades");
  await replay(page);
});

for (const width of [1440, 390])
  test(`remaining visual ${width}: science, income, tracks and FAV supply are readable`, async ({
    page,
  }, info) => {
    const s = fixture();
    await page.setViewportSize({ width, height: 900 });
    await open(page, s);
    await expect(page.locator(".player-technology")).toHaveCount(3);
    await expect(page.locator(".player-income-totals")).toHaveCount(3);
    await expect(page.locator(".competency-card")).toHaveCount(12);
    await expect(page.locator(".building-legend svg")).toHaveCount(7);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    for (const [name, selector] of [
      ["player", ".player-chip"],
      ["science", ".illustrated-science"],
      ["FAV", "#table-competencies"],
      ["buildings", ".building-legend"],
    ]) {
      await page.locator(selector).first().scrollIntoViewIfNeeded();
      await page
        .locator(selector)
        .first()
        .screenshot({ path: info.outputPath(`${name}-${width}.png`) });
    }
  });

test("closure map university upgrade pays once and opens FAV selection", async ({
  page,
}) => {
  const s = fixture();
  s.board.buildings.B4.kind = "school";
  await open(page, s);
  await hex(page, "B4");
  await page
    .getByRole("region", { name: "地块操作" })
    .getByRole("button", { name: /^升级为大学/ })
    .click();
  await expectRevision(page, 1);
  const n = await saved(page);
  expect(n.board.buildings.B4.kind).toBe("university");
  expect(n.players.p1.resources.coins).toBe(22);
  expect(n.players.p1.resources.tools).toBe(15);
  expect(n.pending.some((c) => c.kind === "competency")).toBe(true);
  await page
    .locator("#table-competencies")
    .getByRole("button", { name: /^领取 FAV/ })
    .first()
    .click();
  await drain(page);
  expect((await saved(page)).players.p1.competencies).toHaveLength(1);
  await replay(page);
});

test("closure auto leech preference updates without spending the main action", async ({
  page,
}) => {
  const s = fixture();
  s.players.p1.leechPolicy = { enabled: false, maxVpCost: 0 };
  await open(page, s);
  await page.getByText("自动蹭魔设置", { exact: true }).click();
  await page.getByLabel("启用自动接受").check();
  await expectRevision(page, 1);
  if (!(await page.getByLabel("最多支付分数").isVisible()))
    await page.getByText("自定义或手动处理", { exact: true }).click();
  await page.getByLabel("最多支付分数").fill("2");
  await page.getByLabel("最多支付分数").press("Tab");
  await expectRevision(page, 2);
  const n = await saved(page);
  expect(n.players.p1.leechPolicy).toEqual({ enabled: true, maxVpCost: 2 });
  expect(n.players.p1.resources).toEqual(s.players.p1.resources);
  expect(n.activeSeat).toBe("p1");
  await replay(page);
});

test("closure mobile science track scroll reaches keys, income and final level", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await open(page, fixture());
  const scroller = page.locator(".science-scroll");
  await scroller.focus();
  for (let i = 0; i < 20; i++) await page.keyboard.press("ArrowRight");
  await expect
    .poll(() => scroller.evaluate((el) => el.scrollLeft))
    .toBeGreaterThan(300);
  const row = page.locator('.science-row[data-discipline="0"]');
  await expect(row.locator('[data-level="8"]')).toBeInViewport();
  await expect(row.locator('[data-level="9"]')).toBeInViewport();
  await expect(row.locator('[data-level="12"]')).toBeInViewport();
  await page.screenshot({
    path: info.outputPath("science-mobile-scrolled.png"),
  });
  expect((await saved(page)).revision).toBe(0);
});
