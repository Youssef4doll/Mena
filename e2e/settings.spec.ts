import { test, expect, type Page } from "@playwright/test";
import { signIn } from "./sign-in";

/**
 * The settings page: nothing a browser could take for a login form, a
 * refusal shown at its field, and two open forms that cannot undo each
 * other's change. Every value is put back as it was.
 */
const field = (page: Page, name: string) => page.locator(`[data-field="${name}"]`);
const save = (page: Page) => page.getByRole("button", { name: "Enregistrer les paramètres" }).click();

test("no password field for the password manager, and a refusal next to its field", async ({ page }) => {
  await signIn(page);
  await page.goto("/admin/parametres");
  await page.waitForLoadState("networkidle");
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  // What a password manager typed into Messenger (the admin's e-mail): refused there, and scrolled to.
  const messenger = field(page, "contact.messenger");
  const before = await messenger.inputValue();
  await messenger.fill("e2e@mena.test");
  await save(page);
  await expect(page.getByRole("alert").filter({ hasText: /Messenger|m\.me|utilisateur/i })).toBeVisible();
  await expect(messenger).toBeFocused();
  await expect(messenger).toBeInViewport();
  await messenger.fill(before);
  // The same for a Pixel ID that is not one.
  const pixel = field(page, "tracking.metaPixelId");
  const pixelBefore = await pixel.inputValue();
  await pixel.fill("e2e@mena.test");
  await save(page);
  await expect(page.getByRole("alert").filter({ hasText: "Meta Pixel ID" })).toBeVisible();
  await pixel.fill(pixelBefore);
});

test("an older form open elsewhere neither undoes a save nor overwrites the same field", async ({ page, context }) => {
  await signIn(page);
  const other = await context.newPage();
  await page.goto("/admin/parametres");
  await other.goto("/admin/parametres");
  await page.waitForLoadState("networkidle");
  await other.waitForLoadState("networkidle");
  const tag = String(Date.now()).slice(-6);
  const legal = field(page, "shop.legalId");
  const keep = { legal: await legal.inputValue(), tagline: await field(page, "shop.tagline").inputValue() };
  try {
    // Tab 1 saves one field; tab 2, opened before, saves another: both stay.
    await legal.fill(`RNE-${tag}`);
    await save(page);
    await expect(page.getByText("Enregistré : Matricule fiscal.")).toBeVisible();
    await field(other, "shop.tagline").fill(`Accroche ${tag}`);
    await save(other);
    await expect(other.getByText("Enregistré : Phrase d'accroche.")).toBeVisible();
    // What is stored is shown back after the save: tab 2 now shows tab 1's change too.
    await expect(field(other, "shop.legalId")).toHaveValue(`RNE-${tag}`);
    await page.reload();
    await expect(field(page, "shop.tagline")).toHaveValue(`Accroche ${tag}`);
    await expect(field(page, "shop.legalId")).toHaveValue(`RNE-${tag}`);

    // The same field changed in both: the second save is refused, by name, and nothing of it is written.
    await page.waitForLoadState("networkidle");
    await field(page, "shop.legalId").fill(`A-${tag}`);
    await save(page);
    await expect(page.getByText("Enregistré : Matricule fiscal.")).toBeVisible();
    const third = await context.newPage();
    await third.goto("/admin/parametres");
    await third.waitForLoadState("networkidle");
    await field(other, "shop.legalId").fill(`B-${tag}`);
    await save(other);
    await expect(other.getByText(/Modifié entre-temps.*Matricule fiscal/).first()).toBeVisible();
    await expect(field(third, "shop.legalId")).toHaveValue(`A-${tag}`);
    await third.close();
  } finally {
    await page.reload();
    await page.waitForLoadState("networkidle");
    await field(page, "shop.legalId").fill(keep.legal);
    await field(page, "shop.tagline").fill(keep.tagline);
    await save(page);
    await expect(page.getByText(/Enregistré|Rien n'a changé/)).toBeVisible();
    await other.close();
  }
});
