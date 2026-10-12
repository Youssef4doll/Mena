#!/usr/bin/env node
/**
 * Phone-width screenshots of the running site (localhost only).
 *   node scripts/screens.mjs [baseUrl] path1 path2 …
 */
import { chromium, devices } from "@playwright/test";
import { mkdirSync } from "node:fs";

const [, , base = "http://localhost:3000", ...paths] = process.argv;
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base)) {
  console.error("Screenshots run against localhost only.");
  process.exit(1);
}
mkdirSync("screenshots", { recursive: true });
// PW_CHROMIUM lets a machine with a different pre-installed Chromium use it.
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const ctx = await browser.newContext({ ...devices["iPhone 13"], userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1 MenaScreens" });
const page = await ctx.newPage();
for (const p of paths.length ? paths : ["/"]) {
  await page.goto(base + p, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  const name = p.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "home";
  await page.screenshot({ path: `screenshots/${name}.png`, fullPage: true });
  console.log(`screenshots/${name}.png`);
}
await browser.close();
