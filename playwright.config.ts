import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "test/e2e",
  testMatch: "**/*.e2e.ts",
  outputDir: "test/results",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:8766",
    trace: "on-first-retry",
  },
  webServer: {
    command: "bun ./server/server.ts",
    env: {
      ...process.env,
      PORT: "8766",
      APPSTUDO_E2E_SKIP_EMAIL: "1",
      APP_RUNTIME_HOST: "localhost",
      PLATFORM_ORIGIN: "http://127.0.0.1:8766",
    },
    url: "http://127.0.0.1:8766/en/",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
