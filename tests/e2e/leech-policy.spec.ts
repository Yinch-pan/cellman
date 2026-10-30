import { test, expect } from "@playwright/test";
import { actionState } from "../../packages/rules/test/fixtures/actions";
import { queueChoice } from "../../packages/rules/src/responses";
import { replayRecord } from "../../packages/rules/src/replay";

test("reject-paid preference resolves the pending response once and is replayable", async ({
  page,
}) => {
  const state = actionState();
  state.activeSeat = "p2";
  queueChoice(state, "p1", "leech", 3, ["accept", "decline"], "A1");
  state.players.p1.leechPolicy = { enabled: true, maxVpCost: 0 };
  await page.addInitScript((s) => {
    localStorage.setItem("boardgame-demo-v1", JSON.stringify(s));
    localStorage.setItem("cellman-step-review", "off");
    localStorage.setItem("cellman-turn-planning", "off");
  }, state);
  await page.goto("/#/demo");
  await page.getByText("自动蹭魔设置", { exact: true }).click();
  await page
    .getByRole("radio", { name: "自动拒绝付分蹭魔", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem("boardgame-demo-v1")!).revision,
      ),
    )
    .toBe(1);
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("boardgame-demo-v1")!),
  );
  expect(saved.pending).toEqual([]);
  expect(saved.players.p1.vp).toBe(state.players.p1.vp);
  expect(saved.players.p1.resources).toEqual(state.players.p1.resources);
  expect(saved.players.p1.leechPolicy.rejectPaid).toBe(true);
  expect(saved.activeSeat).toBe("p2");
  const record = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("boardgame-demo-record")!),
  );
  expect(replayRecord(record).state).toEqual(saved);
});

for (const width of [1440, 390]) {
  test(`${width}px leech presets apply immediately with review enabled`, async ({
    page,
  }) => {
    const state = actionState();
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript((s) => {
      localStorage.setItem("boardgame-demo-v1", JSON.stringify(s));
      localStorage.setItem("cellman-step-review", "on");
      localStorage.setItem("cellman-turn-planning", "off");
    }, state);
    await page.goto("/#/demo");
    await page.getByText("自动蹭魔设置", { exact: true }).click();
    const policies = [
      ["花费 0 分换取 1 魔力（默认）", 0, false],
      ["最多花费 1 分换取 2 魔力", 1, false],
      ["最多花费 2 分换取 3 魔力", 2, false],
      ["最多花费 3 分换取 4 魔力", 3, false],
      ["自动拒绝付分蹭魔", 0, true],
    ] as const;
    for (const [index, [name, maxVpCost, rejectPaid]] of policies.entries()) {
      await page.getByRole("radio", { name, exact: true }).check();
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              JSON.parse(localStorage.getItem("boardgame-demo-v1")!).revision,
          ),
        )
        .toBe(index + 1);
      const saved = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("boardgame-demo-v1")!),
      );
      expect(saved.players.p1.leechPolicy).toEqual({
        enabled: true,
        maxVpCost,
        rejectPaid,
      });
      expect(saved.players.p1.resources).toEqual(state.players.p1.resources);
      expect(saved.players.p1.primaryDone).toBe(false);
    }
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("boardgame-demo-v1")!),
    );
    const record = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("boardgame-demo-record")!),
    );
    expect(replayRecord(record).state).toEqual(saved);
    await page.locator(".leech-presets").scrollIntoViewIfNeeded();
    expect(
      await page
        .locator(".leech-presets label")
        .evaluateAll((labels) =>
          labels.every((label) => label.getBoundingClientRect().height >= 44),
        ),
    ).toBe(true);
    await page.screenshot({
      path: `work/acceptance/bga-20261028/local-leech-presets-${width}.png`,
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  });
}
