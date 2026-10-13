import { defineConfig } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { existsSync } from "node:fs";
if (existsSync(".env")) loadEnvFile(".env");
process.env.E2E_SCHEMA ??= "e2e_" + randomUUID().replaceAll("-", "");
export default defineConfig({
  globalTeardown: "./tests/e2e/teardown.ts",
  testDir: "./tests/e2e",
  timeout: 60000,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:5174",
    headless: true,
    channel: "chrome",
    screenshot: "only-on-failure",
  },
  reporter: "list",
  webServer: {
    command: "node --env-file-if-exists=.env --import tsx tests/e2e/server.ts",
    url: "http://127.0.0.1:5174",
    reuseExistingServer: false,
    timeout: 30000,
    gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
  },
});
