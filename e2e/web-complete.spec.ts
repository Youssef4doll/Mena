import http from "node:http";
import type { AddressInfo } from "node:net";
import sharp from "sharp";
import { test, expect } from "@playwright/test";
import { signIn } from "./sign-in";

/**
 * Completing a product page from the web, without an API key (the tests
 * have none): the owner's link to the product's page on another site, read
 * by the shop for its large photos, its long picture and its video; then a
 * reply pasted from claude.ai, with its texts. Nothing is saved before
 * "Appliquer".
 */
test("a product page completed from another site's page, then from a claude.ai reply", async ({ page }) => {
  const png = (w: number, h: number, r: number) => sharp({ create: { width: w, height: h, channels: 3, background: { r, g: 110, b: 160 } } }).png().toBuffer();
  const files: Record<string, Buffer> = { "/img/1.png": await png(900, 900, 30), "/img/2.png": await png(900, 900, 90), "/img/long.png": await png(800, 2000, 150), "/img/tiny.png": await png(60, 60, 200) };
  let host = "";
  const site = http.createServer((req, res) => {
    const f = files[req.url ?? ""];
    if (f) {
      res.writeHead(200, { "content-type": "image/png" });
      return res.end(f);
    }
    if (req.url === "/produit") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(`<html><head><meta property="og:image" content="${host}/img/2.png">
        <script type="application/ld+json">{"@type":"Product","name":"Bouilloire 1,7 L","description":"Bouilloire électrique 1,7 L, arrêt automatique.","image":["${host}/img/1.png"]}</script></head>
        <body><img src="/img/long.png"><img src="/img/tiny.png"><iframe src="https://www.youtube.com/embed/abcdefghijk"></iframe></body></html>`);
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((r) => site.listen(0, "127.0.0.1", r));
  host = `http://127.0.0.1:${(site.address() as AddressInfo).port}`;
  // A new product each run (the test database keeps earlier runs), offline, without photos or texts.
  const name = `Bouilloire web ${Date.now().toString(36)}`;

  try {
    await signIn(page);
    await page.goto("/admin/produits/import");
    await page.getByLabel(/Ou collez ici les lignes/).fill(`nom\tprix\n${name}\t59`);
    await page.getByRole("button", { name: "Lire les lignes collées" }).click();
    await page.getByRole("button", { name: "Importer 1 produit" }).click();
    await expect(page.getByText("Import terminé.")).toBeVisible({ timeout: 60_000 });

    await page.goto("/admin/produits/completer?f=all");
    const item = page.getByTestId("complete-item").filter({ hasText: name });
    await item.getByLabel(`Liens pour ${name}`).fill(`${host}/produit`);
    await item.getByRole("button", { name: "Lire ces liens" }).click();
    const choices = item.getByTestId("complete-choices");
    // Two photos and the long picture; the thumbnail is too small to be offered.
    await expect(choices.getByTestId("found-images").locator("li:visible")).toHaveCount(3);
    await expect(choices.getByRole("button", { name: "Photo", pressed: true })).toHaveCount(2);
    await expect(choices.getByRole("button", { name: "Grande image", pressed: true })).toHaveCount(1);
    await expect(choices.locator('input[type="radio"]').first()).toBeChecked();
    await expect(choices.getByRole("textbox", { name: "Description trouvée" })).toHaveValue(/Bouilloire électrique 1,7 L/);

    await choices.getByTestId("complete-apply").click();
    await expect(item.getByRole("status")).toContainText("3 photos ajoutées, vidéo ajoutée, 1 texte enregistré.", { timeout: 60_000 });

    // The same product through claude.ai: its reply's texts, to read before applying.
    await page.goto("/admin/produits/completer?f=all");
    await page.getByRole("button", { name: "Tout décocher" }).click();
    await item.getByLabel(`Choisir ${name}`).check();
    const reply = [{ ref: "P1", pages: [{ url: `${host}/produit`, title: "Bouilloire", sure: true }], images: [], video: "", texts: { summary: "Une bouilloire de 1,7 L qui s'arrête seule.", summaryAr: "بوايلوار 1,7 لتر تطفى وحدها." } }];
    await page.getByLabel("Réponse de claude.ai").fill(`Voici :\n${JSON.stringify(reply)}`);
    await page.getByRole("button", { name: "Lire la réponse" }).click();
    await expect(item.getByLabel("Phrase sous le nom", { exact: true })).toHaveValue("Une bouilloire de 1,7 L qui s'arrête seule.");
    // The pictures already added are not offered again.
    await expect(item.getByText("3 photos déjà sur la fiche.")).toBeVisible();
    await expect(item.getByTestId("found-images").locator("li:visible")).toHaveCount(0);
  } finally {
    site.close();
  }
});
