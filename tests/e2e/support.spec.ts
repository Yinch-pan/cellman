import { test, expect } from "@playwright/test";

test("signed-out users can reach support and data information on a phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("link", { name: "帮助与数据说明" }).click();
  await expect(
    page.getByRole("heading", { name: "帮助、反馈与账号数据" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "yinchpan@gmail.com" }),
  ).toHaveAttribute("href", /^mailto:yinchpan@gmail.com/);
  await expect(
    page.getByText("数据请求目前由人工处理。", { exact: false }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
