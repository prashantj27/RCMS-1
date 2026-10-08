import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3200);
const usingPostgres = Boolean(process.env.DATABASE_URL);
// Two suites against the same build: the prototype portals (default app behaviour) and the full login mode.
//   npx playwright test                         → prototype (tests/e2e/prototype.spec.ts)
//   E2E_AUTH_MODE=login npx playwright test     → login    (tests/e2e/app.spec.ts)
const authMode = process.env.E2E_AUTH_MODE === "login" ? "login" : "prototype";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: authMode === "login" ? "app.spec.ts" : "prototype.spec.ts",
  fullyParallel: false, // tests share one seeded database
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  timeout: 30_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...(process.env.CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.CHROMIUM_PATH } } : {}),
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Production build + start: tests exercise exactly what ships (CSP, cookies, caching headers).
    command: `npx tsx scripts/e2e-prepare.ts && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    env: {
      NODE_ENV: "production",
      RCMS_AUTH_MODE: authMode,
      AUTH_SECRET: "e2e-secret-e2e-secret-e2e-secret-0123456789",
      ...(usingPostgres ? {} : { RCMS_ALLOW_PGLITE: "1", PGLITE_DIR: ".data/e2e" }),
    },
  },
});
