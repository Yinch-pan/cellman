import type { Browser, BrowserContextOptions } from "@playwright/test";

// Preserve explicit preview/confirm coverage in existing transport scenarios.
// New quick-action scenarios leave this optional setting off.
export async function reviewContext(
  browser: Browser,
  options?: BrowserContextOptions,
) {
  const context = await browser.newContext(options);
  await context.addInitScript(() =>
    localStorage.setItem("cellman-step-review", "on"),
  );
  return context;
}
