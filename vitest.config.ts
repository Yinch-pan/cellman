import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: [
      "scripts/**/*.test.ts",
      "packages/**/*.test.ts",
      "apps/**/*.test.{ts,tsx}",
    ],
    testTimeout: 15000,
    hookTimeout: 30000,
  },
});
