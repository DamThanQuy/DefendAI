// playwright.config.ts — Playwright config cho E2E tests
// Dùng cho UI test: workspace deliverables-check (issue deliverable-check-name-only-flaw-wip)
// Cài: `npm install -D @playwright/test` rồi `npx playwright install chromium`
// Chạy: `npx playwright test e2e/deliverables-check.spec.ts`

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,        // 1 file tại 1 thời điểm (workspace setup)
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 60_000,             // 1 test case max 60s (Layer 2 AI có thể chậm)
  expect: { timeout: 8_000 },
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 8_000,
    navigationTimeout: 15_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});