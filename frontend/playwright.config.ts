import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";
const localChrome =
  process.platform === "win32" &&
  existsSync("C:/Program Files/Google/Chrome/Application/chrome.exe");
const production = process.env.PLAYWRIGHT_PRODUCTION === "1";
const port = Number(process.env.PLAYWRIGHT_PORT ?? 3000);
export default defineConfig({
  testDir: "./tests/browser",
  outputDir: production ? "test-results-production" : "test-results",
  fullyParallel: false,
  workers: 1,
  maxFailures: 1,
  timeout: 60_000,
  use: { baseURL: `http://127.0.0.1:${port}`, trace: "retain-on-failure" },
  projects: [
    {
      name: "chromium",
      use: {
        actionTimeout: 15_000,
        ...devices["Desktop Chrome"],
        channel:
          process.env.PLAYWRIGHT_CHANNEL ??
          (localChrome ? "chrome" : undefined),
      },
    },
  ],
  webServer: {
    command: production
      ? `npm start -- --port ${port}`
      : "node ../scripts/dev.mjs",
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
