import { hexLabel } from "../../apps/web/src/map-coordinates";
import { test, expect, type Page } from "@playwright/test";
import { actionState } from "../../packages/rules/test/fixtures/actions";

async function open(page: Page, planning: boolean) {
  const state = actionState();
  state.players.p1.resources.power = [0, 0, 12];
  state.players.p1.resources.scholars = 1;
  state.players.p1.science[1] = 7;
  state.players.p1.keys = 1;
  await page.addInitScript(
    ({ state, planning }) => {
      localStorage.setItem("boardgame-demo-v1", JSON.stringify(state));
      localStorage.removeItem("cellman-step-review");
      localStorage.setItem("cellman-turn-planning", planning ? "on" : "off");
      localStorage.setItem("cellman-conversion-prompt", "never");
    },
    { state, planning },
  );
  await page.goto("/#/demo");
}
const saved = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("boardgame-demo-v1")!));

test("default action adds a reversible step and publishes only at turn submission", async ({
  page,
}) => {
  await open(page, true);
  const action = page.getByRole("button", {
    name: "能量板：7 金币",
    exact: true,
  });
  await action.click();
  await expect(
    page.getByText("本回合试走 · 1 步", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "确认步骤", exact: true }),
  ).toHaveCount(0);
  expect((await saved(page)).players.p1.resources.coins).toBe(15);
  await page.getByRole("button", { name: "撤销上一步", exact: true }).click();
  await expect(action).toBeEnabled();
  await action.click();
  await page.getByRole("button", { name: "提交回合", exact: true }).click();
  await expect(page.getByText("局面版本 1", { exact: true })).toBeVisible();
  const after = await saved(page);
  expect(after.players.p1.resources.coins).toBe(22);
  expect(after.activeSeat).toBe("p2");
});

test("direct map upgrade commits once without an intermediate preview button", async ({
  page,
}) => {
  await open(page, false);
  await page.getByRole("button", { name: new RegExp(`^${hexLabel("A1")} `) }).click();
  const panel = page.getByRole("region", { name: "地块操作" });
  await panel.getByRole("button", { name: /^升级为公会/ }).click();
  await expect(page.getByText("局面版本 1", { exact: true })).toBeVisible();
  expect((await saved(page)).board.buildings.A1.kind).toBe("guild");
  await expect(
    page.getByRole("button", { name: "确认提交", exact: true }),
  ).toHaveCount(0);
});

test("science key decision is explicit and remains reversible before publication", async ({
  page,
}) => {
  await open(page, true);
  await page
    .getByRole("button", { name: "法学 槽1推进3", exact: true })
    .click();
  await page
    .getByRole("button", { name: "使用钥匙并继续", exact: true })
    .click();
  await expect(
    page.getByText("本回合试走 · 2 步", { exact: true }),
  ).toBeVisible();
  expect((await saved(page)).players.p1.keysUsed).toBe(0);
  await page.getByRole("button", { name: "撤销上一步", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "使用钥匙并继续", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "使用钥匙并继续", exact: true })
    .click();
  await page.getByRole("button", { name: "提交回合", exact: true }).click();
  await expect(page.getByText("局面版本 1", { exact: true })).toBeVisible();
  expect((await saved(page)).players.p1.science[1]).toBe(10);
  expect((await saved(page)).players.p1.keysUsed).toBe(1);
});
