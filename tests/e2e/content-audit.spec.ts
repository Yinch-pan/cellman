import { test, expect, type Page } from "@playwright/test";
import {
  auditState,
  auditDraft,
} from "../../packages/rules/test/fixtures/content-audit";
import {
  applyAction,
  getAvailableChoices,
} from "../../packages/rules/src/engine";
import { palaces, factions, bonusIds } from "../../packages/rules/src/content";
import { officialLarge, terrainCycle } from "../../packages/rules/src/map";
import { replayRecord } from "../../packages/rules/src/replay";
import { palaceCodes, bonusCodes } from "../../apps/web/src/i18n/tile-codes";
import { label } from "../../apps/web/src/api";
import { specialOptions } from "../../apps/web/src/i18n/presentation";
import type { GameState, GameAction } from "../../packages/rules/src/types";

async function open(page: Page, state: GameState, planning = false) {
  await page.addInitScript(
    ({ state, planning }) => {
      localStorage.clear();
      localStorage.setItem("cellman-step-review", "on");
      localStorage.setItem("boardgame-demo-v1", JSON.stringify(state));
      localStorage.setItem("cellman-turn-planning", planning ? "on" : "off");
      localStorage.setItem("cellman-conversion-prompt", "never");
    },
    { state, planning },
  );
  await page.goto("/#/demo");
}
const saved = (page: Page): Promise<GameState> =>
  page.evaluate(() => JSON.parse(localStorage.getItem("boardgame-demo-v1")!));
const click = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true }).click();
const hex = (page: Page, id: string) =>
  page.getByRole("button", { name: new RegExp(`^${id} `) }).click();
async function confirm(page: Page, planning = false) {
  await click(page, planning ? "确认步骤" : "确认提交");
}

async function move(page: Page, state: GameState, a: GameAction) {
  switch (a.kind) {
    case "draftPick":
      await page
        .locator(
          `.setup-option[data-category="${a.category}"][data-option="${a.option}"]`,
        )
        .click();
      break;
    case "place":
      await hex(page, a.hex);
      if (
        a.building &&
        (await page.getByLabel("起始建筑", { exact: true }).count())
      )
        await page
          .getByLabel("起始建筑", { exact: true })
          .selectOption(a.building);
      await click(page, "执行行动");
      break;
    case "upgrade":
      await click(page, "建设");
      await hex(page, a.hex);
      await page
        .getByRole("region", { name: "地块操作" })
        .getByRole("button", {
          name: new RegExp(
            `^升级为${label(a.to)}${a.to === "palace" ? " · " + palaceCodes[state.players.p1.draftPalace!] : ""}`,
          ),
        })
        .click();
      break;
    case "terraform":
      await click(page, "建设");
      await hex(page, a.hex);
      await page
        .getByRole("region", { name: "地块操作" })
        .getByRole("button", { name: /^(改造并)?建造工坊/ })
        .click();
      break;
    case "special": {
      await click(page, "公共行动");
      if (a.hex) await hex(page, a.hex);
      if (a.track !== undefined)
        await page
          .getByRole("combobox", { name: "科学目标", exact: true })
          .selectOption(String(a.track));
      const name = specialOptions(state.players.p1).find(
        (o) => o.id === a.source,
      )!.label;
      await page
        .locator(".action-panel")
        .getByRole("button", { name, exact: true })
        .click();
      break;
    }
    case "riverCity":
      await click(page, "公共行动");
      await hex(page, a.hex);
      await click(page, "连接所选河流格建城（附加操作）");
      break;
    case "endTurn":
      await click(page, "结束回合");
      break;
    case "pass":
      await click(page, "轮次");
      if (state.round < 6)
        await page
          .locator(".bonus-market")
          .getByRole("button", {
            name: new RegExp(`^${bonusCodes[a.bonus!]} `),
          })
          .click();
      await click(page, "结束本轮");
      break;
    case "respond": {
      const c = state.pending.find((c) => c.id === a.choiceId)!;
      const panel = page.locator(`[data-choice-id="${c.id}"]`);
      if (c.kind === "competency") {
        await click(page, `领取 ${label("competency:" + a.option)}`);
        break;
      }
      if (
        ["freeGuild", "freeWorkshop", "neutral"].includes(c.kind) &&
        a.option !== "discard"
      ) {
        await hex(page, a.option);
        await panel
          .getByRole("button", { name: "放置 " + a.option, exact: true })
          .click();
      } else if (c.kind === "bridge" && a.option !== "discard") {
        await panel.getByLabel("免费桥位置").selectOption(a.option);
        await panel.getByRole("button", { name: "建桥", exact: true }).click();
      } else if (c.kind === "spades" && a.terraform) {
        await hex(page, a.terraform.hex);
        await panel
          .getByRole("combobox")
          .last()
          .selectOption(a.terraform.terrain);
        if (a.terraform.build) await panel.getByRole("checkbox").check();
        await panel
          .getByRole("button", { name: "使用铲子", exact: true })
          .click();
      } else {
        const name =
          c.kind === "key"
            ? a.option === "use"
              ? "使用钥匙并继续"
              : "保留钥匙，停在 7 级"
            : a.option === "discard"
              ? c.kind === "bridge"
                ? "放弃剩余桥梁"
                : c.kind === "spades"
                  ? "放弃剩余铲子"
                  : "放弃剩余收益"
              : a.option === "decline"
                ? "放弃"
                : a.option === "build"
                  ? "建造工坊"
                  : /^[0-3]$/.test(a.option)
                    ? ["银行 / 黄", "法学 / 蓝", "工程 / 棕", "医学 / 白"][
                        Number(a.option)
                      ]
                    : label(
                        ["competency", "city"].includes(c.kind)
                          ? `${c.kind}:${a.option}`
                          : a.option,
                      );
        await panel
          .locator(".choice-buttons")
          .getByRole("button", {
            name,
            exact: !["competency", "city"].includes(c.kind),
          })
          .click();
      }
      break;
    }
    default:
      throw Error(`Missing UI move ${a.kind}`);
  }
  await confirm(page);
  const n = await saved(page);
  expect(n.revision).toBe(state.revision + 1);
  return n;
}
async function drain(page: Page, state: GameState) {
  let s = state,
    guard = 0;
  while (s.pending.length && guard++ < 40) {
    const c = getAvailableChoices(s)[0];
    let a: GameAction;
    if (
      c.kind === "spades" &&
      (c.source === "setup-desert" || c.source === "lizards")
    ) {
      const target = Object.keys(officialLarge.hexes).find(
        (hex) =>
          applyAction(s, c.seat, {
            kind: "respond",
            choiceId: c.id,
            option: "terraform",
            terraform: { hex, terrain: s.players[c.seat].native, build: false },
          }).ok,
      )!;
      a = {
        kind: "respond",
        choiceId: c.id,
        option: "terraform",
        terraform: {
          hex: target,
          terrain: s.players[c.seat].native,
          build: false,
        },
      };
    } else if (
      c.kind === "spades" &&
      c.canBuild !== false &&
      !s.board.buildings.C5
    )
      a = {
        kind: "respond",
        choiceId: c.id,
        option: "terraform",
        terraform: { hex: "C5", terrain: "forest", build: true },
      };
    else if (c.kind === "bridge") {
      const option =
        c.options.find(
          (option) =>
            option !== "discard" &&
            applyAction(s, c.seat, { kind: "respond", choiceId: c.id, option })
              .ok,
        ) ?? "discard";
      a = { kind: "respond", choiceId: c.id, option };
    } else if (
      c.kind === "freeGuild" ||
      c.kind === "freeWorkshop" ||
      c.kind === "neutral"
    ) {
      const option =
        c.options.find(
          (option) =>
            option !== "discard" &&
            applyAction(s, c.seat, { kind: "respond", choiceId: c.id, option })
              .ok,
        ) ?? "discard";
      a = { kind: "respond", choiceId: c.id, option };
    } else
      a = {
        kind: "respond",
        choiceId: c.id,
        option:
          c.kind === "competency"
            ? "immediate-resources"
            : c.kind === "city"
              ? "coins"
              : c.kind === "key"
                ? "use"
                : c.kind === "leech"
                  ? "decline"
                  : c.kind === "spades"
                    ? "discard"
                    : "0",
      };
    s = await move(page, s, a);
  }
  expect(s.pending).toEqual([]);
  return s;
}
async function replay(page: Page, s: GameState) {
  const record = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("boardgame-demo-record")!),
  );
  expect(replayRecord(record).state).toEqual(s);
}
test.beforeEach(async ({ page }) => {
  page.setDefaultTimeout(10000);
  page.on("pageerror", (error) => {
    throw error;
  });
});

for (const id of Object.keys(palaces))
  test(`${palaceCodes[id]}: construct, resolve every immediate reward, then continue`, async ({
    page,
  }, info) => {
    let s = auditState();
    s.players.p1.draftPalace = id;
    s.board.buildings.B4.kind = "guild";
    if (id === "engineering-palace")
      s.board.buildings.B1 = { seat: "p1", kind: "workshop" };
    await open(page, s);
    s = await move(page, s, { kind: "upgrade", hex: "B4", to: "palace" });
    expect(s.players.p1.palace).toBe(id);
    s = await drain(page, s);
    if (id === "engineering-palace") {
      expect(s.board.bridges).toHaveLength(2);
      expect(s.board.buildings.C5.kind).toBe("workshop");
      expect(s.players.p1.resources.books.reduce((a, b) => a + b)).toBe(2);
    }
    if (id === "remote-guild")
      expect(
        Object.values(s.board.buildings).filter(
          (b) => b.kind === "guild" && b.seat === "p1",
        ),
      ).toHaveLength(1);
    if (id === "competency-palace")
      expect(s.players.p1.competencies).toEqual(["immediate-resources"]);
    if (id === "city-palace") expect(s.players.p1.keys).toBe(1);
    if (id === "power-books")
      expect(s.players.p1.resources.books.reduce((a, b) => a + b)).toBe(2);
    if (id === "river-city") expect(s.players.p1.sailing).toBe(2);
    s = await move(page, s, { kind: "endTurn" });
    expect(s.activeSeat).toBe("p2");
    await replay(page, s);
    if (id === "engineering-palace")
      await page.screenshot({ path: info.outputPath("SH15-all-rewards.png") });
  });

for (const source of [
  "palace:tools-special",
  "palace:spades-special",
  "palace:downgrade-special",
  "palace:upgrade-special",
  "palace:science-special",
  "palace:guild-special",
  "bonus:spade-bonus",
  "bonus:bridge-bonus",
  "bonus:science-bonus",
  "faction:philosophers",
  "faction:psychics",
  "faction:moles",
])
  test(`${source}: player activates ability and completes its choices`, async ({
    page,
  }) => {
    let s = auditState();
    const [category, id] = source.split(":");
    if (category === "palace") s.players.p1.palace = id;
    if (category === "bonus") s.players.p1.bonus = id;
    if (category === "faction") s.players.p1.faction = id;
    if (id === "downgrade-special") s.board.buildings.B4.kind = "school";
    if (id === "moles" || id === "bridge-bonus")
      s.board.buildings.B1 = { seat: "p1", kind: "workshop" };
    await open(page, s);
    s = await move(page, s, {
      kind: "special",
      source,
      hex: ["upgrade-special", "downgrade-special"].includes(id)
        ? "B4"
        : undefined,
      track: ["science-special", "science-bonus"].includes(id) ? 2 : undefined,
    });
    s = await drain(page, s);
    if (id === "psychics") {
      expect(s.players.p1.primaryDone).toBe(false);
      await click(page, "能量板：7 金币");
      await confirm(page);
      s = await saved(page);
    }
    if (id === "tools-special") expect(s.players.p1.resources.tools).toBe(22);
    if (id === "science-special") expect(s.players.p1.science[2]).toBe(2);
    if (id === "science-bonus") expect(s.players.p1.science[2]).toBe(1);
    if (["moles", "bridge-bonus"].includes(id))
      expect(s.board.bridges).toHaveLength(1);
    if (["upgrade-special", "downgrade-special"].includes(id))
      expect(s.board.buildings.B4.kind).toBe("guild");
    if (["spades-special", "spade-bonus"].includes(id))
      expect(s.board.buildings.C5.kind).toBe("workshop");
    if (id !== "moles") expect(s.players.p1.usedSpecials).toContain(source);
    s = await move(page, s, { kind: "endTurn" });
    await replay(page, s);
  });

for (const [faction, native] of [
  ...Object.keys(factions).map((f) => [f, "forest"] as const),
  ...terrainCycle
    .filter((t) => t !== "forest")
    .map((t) => ["blessed", t] as const),
])
  test(`${faction}/${native}: user drafts, places and resolves starting ability`, async ({
    page,
  }) => {
    test.setTimeout(90000);
    let s = auditDraft(faction, native);
    await open(page, s);
    while (s.phase === "draft") {
      const seat = s.activeSeat;
      const category = (["faction", "native", "palace", "bonus"] as const).find(
        (c) => !s.draftPicks![seat][c],
      )!;
      // Reserve the requested homeland for player 1 even when pick order reverses.
      const options = s.setup.draft!.pools[category];
      const option = options.find(
        (o) =>
          (seat === "p1" || o !== options[0]) &&
          !Object.values(s.draftPicks!).some((p) => p[category] === o),
      )!;
      s = await move(page, s, { kind: "draftPick", category, option });
    }
    let guard = 0;
    while (s.phase !== "actions" && guard++ < 40) {
      if (s.pending.length) s = await drain(page, s);
      else {
        const hex = Object.values(officialLarge.hexes).find(
          (h) =>
            h.terrain === s.players[s.activeSeat].native &&
            !s.board.buildings[h.id],
        )!.id;
        s = await move(page, s, { kind: "place", hex });
      }
    }
    s = await drain(page, s);
    expect(s.phase).toBe("actions");
    expect(s.players.p1.faction).toBe(faction);
    expect(s.players.p1.native).toBe(native);
    if (native === "desert")
      expect(Object.keys(s.board.terrain)).toHaveLength(1);
    if (native === "wasteland")
      expect(s.players.p1.resources.books).toEqual([1, 0, 0, 0]);
    if (native === "swamp") expect(s.players.p1.resources.scholars).toBe(1);
    if (native === "lake") expect(s.players.p1.sailing).toBe(1);
    const buildings = Object.values(s.board.buildings)
      .filter((b) => b.seat === "p1")
      .map((b) => b.kind)
      .sort();
    expect(buildings).toEqual(
      faction === "monks"
        ? ["university"]
        : faction === "omar"
          ? ["tower", "workshop", "workshop"]
          : ["workshop", "workshop"],
    );
    if (["inventors", "monks"].includes(faction))
      expect(s.players.p1.competencies).toEqual(["immediate-resources"]);
    if (faction === "lizards")
      expect(s.players.p1.science).toEqual([3, 1, 1, 1]);
    await replay(page, s);
  });

for (const bonus of bonusIds)
  test(`${bonus}: income arrives through actual round transition`, async ({
    page,
  }) => {
    let s = auditState();
    s.players.p1.bonus = "river";
    s.players.p2.bonus = "coins";
    s.players.p3.bonus = "coins";
    s.shared.bonusCoins[bonus] = 0;
    if (bonus === "river") s.players.p1.bonus = "power";
    if (bonus === "coins") s.players.p2.bonus = s.players.p3.bonus = "guild";
    s.players.p2.passed = s.players.p3.passed = true;
    s.passOrder = ["p2", "p3"];
    await open(page, s);
    s = await move(page, s, { kind: "pass", bonus });
    s = await drain(page, s);
    expect(s.round).toBe(2);
    expect(s.players.p1.bonus).toBe(bonus);
    const income: Record<string, number[]> = {
      coins: [6, 0, 0, 0, 0],
      power: [2, 0, 0, 4, 0],
      guild: [0, 0, 0, 3, 0],
      scholar: [0, 0, 1, 0, 0],
      school: [4, 0, 0, 0, 0],
      bigbuilding: [0, 1, 0, 0, 0],
      river: [0, 0, 0, 0, 0],
      "spade-bonus": [0, 0, 0, 0, 1],
      "bridge-bonus": [0, 0, 0, 0, 1],
      "science-bonus": [0, 2, 0, 0, 0],
    };
    const [coins, tools, scholars, power, books] = income[bonus];
    expect(s.players.p1.resources).toEqual({
      coins: 30 + coins,
      tools: 21 + tools,
      scholars: 3 + scholars,
      power: [0, 12 - power, power],
      books: [books, 0, 0, 0],
    });
    await replay(page, s);
  });

for (const travel of ["tunnel", "flight"] as const)
  test(`${travel}: default planning can terraform, build and publish once`, async ({
    page,
  }, info) => {
    let s = auditState();
    s.board.buildings = { A1: { seat: "p1", kind: "workshop" } };
    s.board.terrain.A3 = "mountain";
    if (travel === "tunnel") s.players.p1.faction = "moles";
    else s.players.p1.palace = "flight";
    if (travel === "flight")
      await page.setViewportSize({ width: 390, height: 844 });
    await open(page, s, true);
    await hex(page, "A3");
    await page
      .getByRole("region", { name: "地块操作" })
      .getByRole("button", { name: /^详细设置/ })
      .click();
    await page
      .getByRole("combobox", { name: "抵达方式", exact: true })
      .selectOption(travel);
    await click(page, "改造与建造");
    await confirm(page, true);
    await expect(
      page.getByRole("button", { name: "建造工坊", exact: true }),
    ).toBeEnabled();
    await click(page, "建造工坊");
    await confirm(page, true);
    expect((await saved(page)).board.buildings.A3).toBeUndefined();
    await click(page, "提交回合");
    await confirm(page);
    s = await saved(page);
    expect(s.revision).toBe(1);
    expect(s.board.buildings.A3.kind).toBe("workshop");
    expect(s.players.p1.vp).toBe(25);
    expect(s.players.p1.resources).toMatchObject({
      coins: 28,
      tools: travel === "tunnel" ? 15 : 16,
      scholars: travel === "flight" ? 2 : 3,
    });
    await replay(page, s);
    await page.screenshot({ path: info.outputPath(`${travel}-built.png`) });
  });

for (const faction of ["felines", "lizards"])
  test(`${faction}: city reward is fully usable from the map`, async ({
    page,
  }) => {
    let s = auditState();
    s.players.p1.faction = faction;
    s.board.buildings = {
      A4: { seat: "p1", kind: "workshop" },
      A5: { seat: "p1", kind: "guild" },
      A6: { seat: "p1", kind: "school" },
      B5: { seat: "p1", kind: "workshop" },
    };
    await open(page, s);
    s = await move(page, s, { kind: "upgrade", hex: "A4", to: "guild" });
    s = await drain(page, s);
    expect(s.players.p1.keys).toBe(1);
    if (faction === "felines") {
      expect(s.players.p1.science).toEqual([3, 0, 0, 0]);
      expect(s.players.p1.resources.books).toEqual([1, 0, 0, 0]);
    } else
      expect(
        Object.values(s.board.buildings).filter((b) => b.seat === "p1"),
      ).toHaveLength(5);
    s = await move(page, s, { kind: "endTurn" });
    await replay(page, s);
  });

test("SH14: player selects a river and completes the city reward", async ({
  page,
}) => {
  let s = auditState();
  s.players.p1.palace = "river-city";
  s.board.buildings = {
    A1: { seat: "p1", kind: "palace" },
    B1: { seat: "p1", kind: "workshop" },
    A3: { seat: "p1", kind: "guild" },
    A4: { seat: "p1", kind: "workshop" },
  };
  await open(page, s);
  s = await move(page, s, { kind: "riverCity", hex: "A2" });
  s = await drain(page, s);
  expect(s.players.p1.keys).toBe(1);
  expect(s.board.cityLinks).toEqual([{ seat: "p1", river: "A2" }]);
  await replay(page, s);
});

for (const [name, bonus, palaceId, expected] of [
  ["BON8", "school", null, 0],
  ["BON-P6", "bigbuilding", null, 8],
  ["SH7", "coins", "school-pass", 6],
] as const)
  test(`${name}: user passes and receives the described building reward`, async ({
    page,
  }) => {
    let s = auditState();
    s.players.p1.bonus = bonus;
    s.players.p1.palace = palaceId;
    s.board.buildings = {
      A1: { seat: "p1", kind: bonus === "bigbuilding" ? "palace" : "school" },
      B4: {
        seat: "p1",
        kind: bonus === "bigbuilding" ? "university" : "school",
      },
    };
    await open(page, s);
    s = await move(page, s, { kind: "pass", bonus: "scholar" });
    s = await drain(page, s);
    expect(s.players.p1.vp).toBe(20 + expected);
    if (bonus === "school") expect(s.players.p1.science).toEqual([2, 0, 0, 0]);
    await replay(page, s);
  });

test("building combines SH12, navigators and BON-P7 without losing or duplicating points", async ({
  page,
}) => {
  let s = auditState();
  s.players.p1.palace = "workshop-score";
  s.players.p1.faction = "navigators";
  s.players.p1.bonus = "river";
  s.board.terrain.C5 = "forest";
  await open(page, s);
  s = await move(page, s, {
    kind: "terraform",
    hex: "C5",
    terrain: "forest",
    build: true,
  });
  expect(s.players.p1.vp).toBe(26);
  expect(s.players.p1.resources.coins).toBe(29);
  await replay(page, s);
});
test("upgrading combines SH13 and BON-P3", async ({ page }) => {
  let s = auditState();
  s.players.p1.palace = "guild-special";
  s.players.p1.bonus = "guild";
  await open(page, s);
  s = await move(page, s, { kind: "upgrade", hex: "B4", to: "guild" });
  expect(s.players.p1.vp).toBe(26);
  await replay(page, s);
});
test("SH8: six building power is enough to create and claim a city", async ({
  page,
}) => {
  let s = auditState();
  s.players.p1.palace = "city-discount";
  s.board.buildings = {
    A4: { seat: "p1", kind: "workshop" },
    A5: { seat: "p1", kind: "school" },
    A6: { seat: "p1", kind: "workshop" },
    B5: { seat: "p1", kind: "workshop" },
  };
  await open(page, s);
  s = await move(page, s, { kind: "upgrade", hex: "A4", to: "guild" });
  s = await drain(page, s);
  expect(s.players.p1.keys).toBe(1);
  await replay(page, s);
});
test("goblins: using a spade in map construction grants two coins", async ({
  page,
}) => {
  let s = auditState();
  s.players.p1.faction = "goblins";
  await open(page, s);
  s = await move(page, s, {
    kind: "terraform",
    hex: "C5",
    terrain: "forest",
    build: true,
  });
  expect(s.players.p1.resources.coins).toBe(30);
  await replay(page, s);
});
test("illusionists: public board displays the discount and awards the score", async ({
  page,
}) => {
  let s = auditState();
  s.players.p1.faction = "illusionists";
  s.players.p1.resources.power = [0, 0, 12];
  await open(page, s);
  await expect(
    page.getByRole("button", { name: "能量板：7 金币", exact: true }),
  ).toContainText("3");
  await click(page, "能量板：7 金币");
  await confirm(page);
  s = await saved(page);
  expect(s.players.p1.resources.power).toEqual([3, 0, 9]);
  expect(s.players.p1.vp).toBe(21);
  await replay(page, s);
});
test("BON-P4: dispatching a scholar awards two points", async ({ page }) => {
  let s = auditState();
  s.players.p1.bonus = "scholar";
  await open(page, s);
  await click(page, "银行学 槽1推进3");
  await confirm(page);
  s = await saved(page);
  expect(s.players.p1.vp).toBe(22);
  expect(s.players.p1.science[0]).toBe(3);
  await replay(page, s);
});
test("philosophers: selecting an ability grants its matching extra book", async ({
  page,
}) => {
  let s = auditState();
  s.players.p1.faction = "philosophers";
  s.board.buildings.B4.kind = "guild";
  await open(page, s);
  s = await move(page, s, { kind: "upgrade", hex: "B4", to: "school" });
  const cell = s.shared.competencies.find(
    (c) => c.id === "immediate-resources",
  )!;
  s = await drain(page, s);
  expect(s.players.p1.resources.books[cell.color]).toBe(cell.row + 1);
  await replay(page, s);
});

for (const [name, coins, power] of [
  ["blessed", 3, 0],
  ["omar", 2, 2],
  ["mountain", 2, 0],
] as const)
  test(`${name}: passive reward arrives at the next round`, async ({
    page,
  }) => {
    let s = auditState();
    s.players.p1.faction = name === "mountain" ? "inventors" : name;
    if (name === "mountain") s.players.p1.native = "mountain";
    s.players.p1.bonus = "river";
    s.players.p2.passed = s.players.p3.passed = true;
    s.passOrder = ["p2", "p3"];
    s.setup.roundTiles[0] = "school-bank";
    await open(page, s);
    s = await move(page, s, { kind: "pass", bonus: "bigbuilding" });
    s = await drain(page, s);
    expect(s.players.p1.resources.coins).toBe(30 + coins);
    expect(s.players.p1.resources.power).toEqual([0, 12 - power, power]);
    await replay(page, s);
  });
test("BON-P7: temporary sailing makes a remote native tile buildable", async ({
  page,
}) => {
  let s = auditState();
  s.players.p1.bonus = "river";
  s.board.buildings = { A1: { seat: "p1", kind: "workshop" } };
  s.board.terrain.A3 = "forest";
  await open(page, s);
  s = await move(page, s, {
    kind: "terraform",
    hex: "A3",
    terrain: "forest",
    build: true,
  });
  expect(s.board.buildings.A3.kind).toBe("workshop");
  expect(s.players.p1.sailing).toBe(0);
  await replay(page, s);
});
for (const native of ["lake", "plains"] as const)
  test(`${native}: homeland technology advantage is usable`, async ({
    page,
  }) => {
    let s = auditState();
    s.players.p1.native = native;
    if (native === "lake") s.players.p1.sailing = 3;
    await open(page, s);
    await page
      .locator(".board-actions")
      .getByRole("button", {
        name: native === "lake" ? /^航海 3/ : /^改造 0/,
      })
      .click();
    await confirm(page);
    s = await saved(page);
    s = await drain(page, s);
    if (native === "lake") {
      expect(s.players.p1.sailing).toBe(4);
      expect(s.players.p1.resources.books).toEqual([2, 0, 0, 0]);
    } else
      expect(s.players.p1.resources).toMatchObject({
        coins: 29,
        tools: 19,
        scholars: 2,
      });
    await replay(page, s);
  });
test("wasteland: second innovation can be bought with five books", async ({
  page,
}) => {
  let s = auditState();
  s.players.p1.native = "wasteland";
  s.players.p1.palace = "tools-special";
  s.players.p1.innovations = ["sewerage"];
  s.players.p1.resources.books = [2, 1, 1, 1];
  s.shared.innovations = ["libraries"];
  await open(page, s);
  await click(page, "研究");
  await page
    .getByRole("combobox", { name: "获得革新", exact: true })
    .selectOption("libraries");
  for (let i = 0; i < 4; i++)
    await page
      .getByLabel(["支付黄书", "支付蓝书", "支付棕书", "支付白书"][i])
      .fill(String([2, 1, 1, 1][i]));
  await click(page, "开发革新");
  await confirm(page);
  s = await saved(page);
  expect(s.players.p1.innovations).toContain("libraries");
  expect(s.players.p1.resources.books).toEqual([0, 0, 0, 0]);
  await replay(page, s);
});
