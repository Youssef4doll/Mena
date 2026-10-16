import { defineConfig, devices } from "@playwright/test";
import { assertLocal, TEST_DB, TEST_URL } from "./e2e/targets";

assertLocal();

const port = new URL(TEST_URL).port || "3100";
const PHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: TEST_URL,
    // Our analytics ignore headless browsers; the tests present as a phone.
    userAgent: PHONE_UA,
    trace: "retain-on-failure",
    ...(process.env.PW_CHROMIUM ? { launchOptions: { executablePath: process.env.PW_CHROMIUM } } : {}),
  },
  projects: [{ name: "phone", use: { ...devices["iPhone 13"], userAgent: PHONE_UA, defaultBrowserType: "chromium" } }],
  webServer: {
    command: `npx tsx e2e/prepare-db.ts && npx next dev -p ${port}`,
    url: `${TEST_URL}/`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      DATABASE_URL: TEST_DB,
      DATABASE_URL_UNPOOLED: TEST_DB,
      APP_SECRET: "e2e-only-secret-0123456789abcdefghijkl",
      NEXT_PUBLIC_SITE_URL: TEST_URL,
      NEXT_DIST_DIR: ".next-e2e",
      // The import test serves its own pictures on this machine (refused in production).
      MEDIA_ALLOW_LOCAL: "1",
    },
  },
});
