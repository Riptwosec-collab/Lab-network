import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: { baseURL: "http://127.0.0.1:33217", trace: "on-first-retry" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm exec next dev -p 33217",
    url: "http://127.0.0.1:33217/dashboard",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
