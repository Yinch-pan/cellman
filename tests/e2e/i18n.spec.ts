import { test, expect } from "@playwright/test";
import { actionState } from "../../packages/rules/test/fixtures/actions";
import { snakeSetup } from "../../packages/rules/src/setup";
import { createGame } from "../../packages/rules/src/state";

test("draft shows stable codes and submits semantic IDs", async ({
  page,
}, info) => {
  const s = createGame(
    snakeSetup(
      "i18n-draft",
      [1, 2, 3].map((id) => ({ id: String(id), name: `玩家${id}` })),
      "forward",
      () => 0.41,
    ),
  );
  await page.addInitScript(
    (state) => localStorage.setItem("boardgame-demo-v1", JSON.stringify(state)),
    s,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/demo");
  await expect(page.getByRole("table", { name: "轮抽结果" })).toBeVisible();
  for (const category of ["palace", "bonus"]) {
    const titles = await page
      .locator(`.setup-option[data-category="${category}"] strong`)
      .allTextContents();
    expect(titles.length).toBeGreaterThan(0);
    for (const title of titles)
      expect(title).toMatch(
        category === "palace" ? /^SH(?:\d+|-X1)$/ : /^BON(?:-P)?\d+$/,
      );
  }
  const option = page
    .locator('.setup-option[data-category="bonus"]:not(:disabled)')
    .first();
  const id = await option.getAttribute("data-option");
  await option.click();
  await page.getByRole("button", { name: "确认提交", exact: true }).click();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("boardgame-demo-v1")!),
  );
  expect(saved.draftPicks[s.activeSeat].bonus).toBe(id);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: info.outputPath("tile-codes-mobile.png"),
    fullPage: true,
  });
});

test("FAV code survives market reordering with its effect and original command", async ({
  page,
}, info) => {
  const s = actionState();
  s.players.p1.name = "商会魔力玩家";
  s.shared.competencies.reverse();
  s.pending = [
    {
      id: "i18n-fav",
      seat: "p1",
      kind: "competency",
      amount: 1,
      options: ["border-score"],
      source: "palace",
      continuation: { kind: "resume-turn" },
    },
  ];
  await page.addInitScript(
    (state) => localStorage.setItem("boardgame-demo-v1", JSON.stringify(state)),
    s,
  );
  await page.goto("/#/demo");
  const card = page
    .locator(".competency-card")
    .filter({
      has: page.getByRole("button", { name: "领取 FAV10", exact: true }),
    });
  const choice = card.getByRole("button", { name: "领取 FAV10", exact: true });
  await expect(card).toContainText("边缘");
  await expect(
    page.getByText("商会魔力玩家（你）", { exact: true }),
  ).toBeVisible();
  await choice.click();
  await page.getByRole("button", { name: "确认提交", exact: true }).click();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("boardgame-demo-v1")!),
  );
  expect(saved.players.p1.competencies).toContain("border-score");
  expect(saved.players.p1.name).toBe("商会魔力玩家");
  await page.screenshot({
    path: info.outputPath("fav-code.png"),
    fullPage: true,
  });
});
