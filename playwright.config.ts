import { defineConfig, devices } from "@playwright/test"

/**
 * End-to-end coverage for the web UI. The unit suite drives the same
 * markup under happy-dom (tests/webUi.spec.ts); what only a browser can
 * answer is whether the conversion worker actually starts, whether a real
 * file, clipboard or download behaves, and what axe makes of the result.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  /* fail rather than silently run a subset someone left focused */
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [["html", { outputFolder: "tests/e2e/reports/html" }], ["github"]]
    : [["html", { outputFolder: "tests/e2e/reports/html", open: "never" }]],
  use: {
    baseURL: "http://localhost:4173",
    trace: "on-first-retry"
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
      /* axe audits the DOM/ARIA tree, which is engine independent, and the
         clipboard specs need the permissions API and a readable system
         clipboard — neither of which WebKit offers under Playwright. What
         WebKit is here for is the file, download and fallback-copy paths,
         whose workarounds in web/src/main.ts exist for this engine. */
      testIgnore: ["**/a11y.spec.ts", "**/clipboard.spec.ts"]
    }
  ],

  /* the built bundle, not the dev server: the worker is its own chunk and
     the DOM-free entity decoder (web/vite.config.ts) only applies to the
     build, so a dev-server run would test neither */
  webServer: {
    command: "npm run build:web && npm run preview:web",
    port: 4173,
    timeout: 180 * 1000,
    reuseExistingServer: !process.env.CI
  },

  outputDir: "tests/e2e/reports/test-results"
})
