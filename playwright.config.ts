import { defineConfig } from "@playwright/test";
import { randomUUID, randomBytes } from "node:crypto";
import { loadEnvFile } from "node:process";
import { existsSync } from "node:fs";
if (existsSync(".env")) loadEnvFile(".env");
process.env.E2E_SCHEMA ??= "e2e_" + randomUUID().replaceAll("-", "");
process.env.E2E_MAIL_KEY = randomBytes(32).toString("base64");
const origin = `http://127.0.0.1:${process.env.E2E_WEB_PORT ?? "5174"}`;
export default defineConfig({
  globalTeardown: "./tests/e2e/teardown.ts",
  testDir: "./tests/e2e",
  timeout: 60000,
  workers: 1,
  use: {
    baseURL: origin,
    headless: true,
    channel: "chrome",
    screenshot: "only-on-failure",
    // Legacy transport scenarios exercise the optional detailed-review mode.
    // quick-actions.spec.ts explicitly checks the default one-click flow.
    // Turn-planning scenarios opt in separately and verify atomic publication.
    storageState: {
      cookies: [],
      origins: [
        {
          origin,
          localStorage: [
            { name: "cellman-turn-planning", value: "off" },
            { name: "cellman-step-review", value: "on" },
          ],
        },
      ],
    },
  },
  reporter: "list",
  webServer: {
    command: "node --env-file-if-exists=.env --import tsx tests/e2e/server.ts",
    url: origin,
    reuseExistingServer: false,
    timeout: 30000,
    gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
  },
});
