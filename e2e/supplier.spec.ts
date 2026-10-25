import http from "node:http";
import type { AddressInfo } from "node:net";
import sharp from "sharp";
import { test, expect, type Page } from "@playwright/test";
import { signIn } from "./sign-in";

/**
 * Products from Ecomness: the list copied by a scraping extension becomes
 * offline products with their photo at full size; then one product's page,
 * copied whole, completes the same product (no copy) with its texts in both
 * languages (here through the manual claude.ai path: the tests have no API
 * key) and its other photos.
 */

/** What Ctrl+V gives the page: the copied HTML and its text. */
async function paste(page: Page, html: string, text: string) {
  await page.getByTestId("supplier-paste").evaluate(
    (el, data) => {
      const dt = new DataTransfer();
      if (data.html) dt.setData("text/html", data.html);
      dt.setData("text/plain", data.text);
      el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    },
    { html, text },
  );
}

test("an Ecomness list becomes offline products, and a product page completes one of them", async ({ page }) => {
  const png = (r: number) => sharp({ create: { width: 800, height: 800, channels: 3, background: { r, g: 120, b: 160 } } }).png().toBuffer();
  const files: Record<string, Buffer> = { "/a.png": await png(30), "/b.png": await png(90), "/c.png": await png(150) };
  // What the shop's server fetched (the browser also shows the small copies in the preview).
  const asked: string[] = [];
  const pictures = http.createServer((req, res) => {
    if (/MenaShop/.test(req.headers["user-agent"] ?? "")) asked.push(req.url ?? "");
    const f = files[(req.url ?? "").split("?")[0]];
    res.writeHead(f ? 200 : 404, { "content-type": "image/png" });
    res.end(f ?? "");
  });
  await new Promise<void>((r) => pictures.listen(0, "127.0.0.1", r));
  const host = `http://127.0.0.1:${(pictures.address() as AddressInfo).port}`;
  // The supplier's small copy of a photo, as its list shows it.
  const thumb = (f: string) => `${host}/_next/image?url=${encodeURIComponent(`${host}${f}`)}&w=384&q=75`;
  const run = Date.now().toString(36).toUpperCase();
  const list = [
    "Image\tURL\tInline-flex\tDescription\tText-sm\tFont-medium\tFont-medium\tText-md",
    `${thumb("/a.png")}\thttps://www.ecomness.com/en/dashboard/marketplace/a${run.toLowerCase()}\t+ 30 %\tChaise pliante ${run}\tFurniture\tENP-A${run}\tENSU-748QLGFQ\t20 TND`,
    `${thumb("/b.png")}\thttps://www.ecomness.com/en/dashboard/marketplace/b${run.toLowerCase()}\t+ 30 %\tTable basse ${run}\tFurniture\tENP-B${run}\tENSU-748QLGFQ\t52 TND`,
  ].join("\n");

  try {
    await signIn(page);
    await page.goto("/admin/produits");
    await page.getByRole("link", { name: "Depuis Ecomness" }).click();
    await paste(page, "", list);
    await expect(page.getByText("2 produits trouvés dans la liste")).toBeVisible();
    // The owner's rule (cost × 2 + 10 DT, ending in ,900) gives the prices.
    await expect(page.getByLabel(`Prix de vente de Chaise pliante ${run}`)).toHaveValue("49.900");
    await expect(page.getByLabel(`Prix de vente de Table basse ${run}`)).toHaveValue("113.900");
    await page.getByLabel(`Prix de vente de Table basse ${run}`).fill("119,900");
    await page.getByTestId("supplier-create").click();
    await expect(page.getByText("2 produits créés.")).toBeVisible({ timeout: 60_000 });
    // The full-size photo was fetched, not the small copy.
    expect(asked.filter((u) => u.startsWith("/_next/image"))).toEqual([]);
    expect(asked.filter((u) => u === "/a.png" || u === "/b.png").sort()).toEqual(["/a.png", "/b.png"]);

    // The same list again: nothing new, the products are found by their code.
    await page.getByRole("button", { name: "Coller une page produit" }).click();
    await paste(page, "", list);
    await expect(page.getByText("Déjà dans la boutique", { exact: true })).toHaveCount(2);
    // Already there: left out unless ticked, and ticked all at once if wanted.
    await expect(page.getByTestId("supplier-select")).toContainText("0 coché sur 2 · 2 déjà dans la boutique");
    await page.getByRole("button", { name: "Ceux déjà dans la boutique" }).click();
    await expect(page.getByTestId("supplier-create")).toHaveText("Mettre à jour 2 produits");
    await page.getByRole("button", { name: "Coller autre chose" }).click();

    // One product's page, copied whole: its photos (the main one already there) and its text.
    const pageHtml = `<header><img src="${host}/logo.svg" alt="Ecomness"></header><main><h1>Chaise de Plage Pliante ${run}</h1>
      <img src="${thumb("/a.png").replace(/&/g, "&amp;")}" alt="Chaise"><img src="${thumb("/c.png").replace(/&/g, "&amp;")}" alt="Chaise"></main>`;
    const pageTextCopied = `Ecomness\nMarketplace\nChaise de Plage Pliante ${run}\nProduct Code : ENP-A${run}\nPrix : 20 TND\nStock : 120\nChaise légère en aluminium, se plie en deux. Poids : 2 kg.`;
    await paste(page, pageHtml, pageTextCopied);
    await expect(page.getByText("2 photos trouvées")).toBeVisible();
    // No API key in the tests: the page's own text is offered at once, ready to correct…
    await expect(page.getByTestId("page-text-draft").getByLabel("Description")).toHaveValue("Chaise légère en aluminium, se plie en deux. Poids : 2 kg.");
    // …or the request goes to claude.ai and its reply comes back.
    await page.getByText("Ou une fiche réécrite en français et en arabe, avec claude.ai").click();
    await expect(page.getByRole("button", { name: "Copier la demande" })).toBeVisible();
    const reply = {
      name: `Chaise de plage pliante ${run}`, nameAr: "كرسي بحر يتطوى", summary: "Une chaise légère qui se plie en deux.", summaryAr: "كرسي خفيف يتطوى على زوز.",
      description: "Chaise légère en aluminium.\n\nElle se plie en deux.", descriptionAr: "كرسي خفيف بالألومينيوم.\n\nيتطوى على زوز.", specs: "Poids : 2 kg", specsAr: "الوزن : 2 كغ",
      keywords: "chaise plage, kursi bhar", category: "Meubles", supplierPrice: "20 TND", supplierRef: `ENP-A${run}`,
      variants: [], imageIdeas: [{ headlineAr: "يتطوى على زوز", headlineFr: "Se plie en deux", scene: "The chair folded flat next to a beach bag." }],
    };
    await page.getByLabel("Réponse de l'IA").fill(`Voici la fiche :\n${JSON.stringify(reply)}`);
    await page.getByRole("button", { name: "Utiliser cette réponse" }).click();
    await expect(page.getByRole("heading", { name: `Compléter « Chaise pliante ${run} »` })).toBeVisible();
    await expect(page.getByTestId("supplier-texts")).toContainText("كرسي خفيف بالألومينيوم.");
    // The picture to make, its request written out in full (Arabic text on the picture by default).
    await expect(page.getByTestId("image-ideas").getByText("يتطوى على زوز", { exact: true })).toBeVisible();
    await expect(page.getByLabel(/^Demande : 1\./)).toHaveValue(/«يتطوى على زوز»/);
    // Its price stays the one set from the list.
    await expect(page.getByTestId("supplier-price")).toHaveValue("49.900");
    await page.getByTestId("supplier-create").click();
    await expect(page.getByText("Produit complété : 1 photo ajoutée, 1 déjà là.")).toBeVisible({ timeout: 60_000 });
    expect(asked.filter((u) => u === "/c.png")).toEqual(["/c.png"]);

    // In the editor: one product, with both languages, its two photos and its supplier code.
    await page.getByRole("link", { name: "Ouvrir dans l'éditeur" }).click();
    await expect(page.getByLabel(/Nom \(français\)/)).toHaveValue(`Chaise de plage pliante ${run}`);
    await expect(page.getByLabel("Nom (arabe)")).toHaveValue("كرسي بحر يتطوى");
    await expect(page.getByLabel("Description détaillée (arabe)")).toHaveValue("كرسي خفيف بالألومينيوم.\n\nيتطوى على زوز.");
    await page.goto(`/admin/produits?q=${encodeURIComponent(`pliante ${run}`)}`);
    await expect(page.getByRole("link", { name: new RegExp(`pliante ${run}`, "i") })).toHaveCount(1);
  } finally {
    pictures.close();
  }
});
