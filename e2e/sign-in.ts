import fs from "node:fs";
import { expect, type Page } from "@playwright/test";

/**
 * Signs in to the back office once per run and reuses the session: the
 * login is rate-limited (as it must be), and each new test signing in again
 * would hit that limit.
 */
const FILE = "test-results/.admin-session.json";

export async function signIn(page: Page) {
  if (fs.existsSync(FILE)) {
    await page.context().addCookies(JSON.parse(fs.readFileSync(FILE, "utf8")));
    await page.goto("/admin");
    if (await page.getByRole("heading", { name: "Tableau de bord" }).isVisible()) return;
  }
  await page.goto("/admin/connexion");
  await page.getByLabel("E-mail").fill("e2e@mena.test");
  await page.getByLabel("Mot de passe").fill("e2e-password-123");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("heading", { name: "Tableau de bord" })).toBeVisible();
  fs.mkdirSync("test-results", { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify((await page.context().cookies()).filter((c) => c.name === "mena_admin")));
}
