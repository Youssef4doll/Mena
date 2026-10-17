import http from "node:http";
import type { AddressInfo } from "node:net";
import sharp from "sharp";
import { test, expect, type Page } from "@playwright/test";

/**
 * Many products at once: rows pasted from a spreadsheet, with pictures from
 * a web address (served here, on this machine), imported, put online, found
 * in the shop; the same rows again change nothing. Then the list's quick edit
 * and an editor opened before it, which must not undo it.
 */

async function signIn(page: Page) {
  await page.goto("/admin/connexion");
  await page.getByLabel("E-mail").fill("e2e@mena.test");
  await page.getByLabel("Mot de passe").fill("e2e-password-123");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("heading", { name: "Tableau de bord" })).toBeVisible();
}

test("a pasted sheet becomes products with their pictures, once", async ({ page }) => {
  const png = await sharp({ create: { width: 640, height: 640, channels: 3, background: { r: 30, g: 120, b: 160 } } }).png().toBuffer();
  let served = 0;
  const pictures = http.createServer((_req, res) => {
    served++;
    res.writeHead(200, { "content-type": "image/png" });
    res.end(png);
  });
  await new Promise<void>((r) => pictures.listen(0, "127.0.0.1", r));
  const port = (pictures.address() as AddressInfo).port;
  // A new name each run: the test database keeps earlier runs.
  const run = Date.now().toString(36);
  const sheet = [
    "nom\tprix\tcategorie\tphotos\toffres\tvariantes",
    `Lampe import ${run}\t49,900\tImport e2e\thttp://127.0.0.1:${port}/a.png ; http://127.0.0.1:${port}/b.png\t1 = 49,900 ; 2 = 89,900 livraison offerte\tNoir ; Blanc`,
    `Sac import ${run}\t35\tImport e2e\t\t\t`,
  ].join("\n");

  try {
    await signIn(page);
    await page.goto("/admin/produits/import");
    await page.getByLabel(/Ou collez ici les lignes/).fill(sheet);
    await page.getByRole("button", { name: "Lire les lignes collées" }).click();
    await expect(page.getByText("2 lignes · 2 nouveaux · 0 mise à jour · 0 avec erreur")).toBeVisible();
    await page.getByRole("button", { name: "Importer 2 produits" }).click();
    await expect(page.getByText("Import terminé.")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/Créés : 2 · Mis à jour : 0 · Échecs : 0/)).toBeVisible();
    await expect(page.getByText(/Photos ajoutées : 2 · Déjà là : 0/)).toBeVisible();
    await page.getByRole("button", { name: "Mettre en ligne les 2 produits créés" }).click();
    await expect(page.getByText("2 produits mis en ligne.")).toBeVisible();

    // In the shop, in French, with its offers and options.
    await page.goto(`/fr/produit/lampe-import-${run}`);
    await expect(page.getByRole("heading", { name: `Lampe import ${run}` })).toBeVisible();
    await expect(page.getByText("2 unités").first()).toBeVisible();
    await expect(page.getByText("Blanc").first()).toBeVisible();

    // The same rows again: two updates, no new product, no picture fetched again.
    const before = served;
    await page.goto("/admin/produits/import");
    await page.getByLabel(/Ou collez ici les lignes/).fill(sheet);
    await page.getByRole("button", { name: "Lire les lignes collées" }).click();
    await expect(page.getByText("2 lignes · 0 nouveau · 2 mises à jour · 0 avec erreur")).toBeVisible();
    await page.getByRole("button", { name: "Importer 2 produits" }).click();
    await expect(page.getByText("Import terminé.")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/Créés : 0 · Mis à jour : 2/)).toBeVisible();
    await expect(page.getByText(/Photos ajoutées : 0 · Déjà là : 2/)).toBeVisible();
    expect(served).toBe(before);
  } finally {
    pictures.close();
  }
});

test("an editor opened before a change made from the list does not undo it", async ({ page, browser }) => {
  await signIn(page);
  await page.goto("/admin/produits?q=diffuseur-huiles-essentielles");
  const row = page.getByRole("link", { name: /Diffuseur/ }).first();
  const href = (await row.getAttribute("href"))!;

  // Tab 1: the editor, open.
  const editor = await (await browser.newContext()).newPage();
  await signIn(editor);
  await editor.goto(href);
  await expect(editor.getByRole("button", { name: "Enregistrer", exact: true })).toBeVisible();

  // Tab 2: a change saved from the list.
  const featured = page.getByRole("switch", { name: "Sélection" }).first();
  await featured.click();
  await expect(page.getByText("Enregistré").first()).toBeVisible();

  // Back in the editor: refused, with the reason.
  await editor.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(editor.getByText(/modifié ailleurs depuis que vous l'avez ouvert/)).toBeVisible();
  await editor.reload();
  await editor.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(editor.getByText("Produit enregistré.")).toBeVisible();

  // The list as it was: the product back in or out of the selection.
  await page.reload();
  await page.getByRole("switch", { name: "Sélection" }).first().click();
  await expect(page.getByText("Enregistré").first()).toBeVisible();
});
