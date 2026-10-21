import { test, expect, type Locator, type Page } from "@playwright/test";

/**
 * The "Publicités" section, as a phone: a visit from a Meta ad that orders
 * and is delivered, then the ad's spend pasted from an Ads Manager export,
 * previewed, imported, and imported again (the second import replaces the
 * first: the campaign's spend stays the same). The campaign then shows its
 * spend, its cost per delivered order and a verdict; Seuils shows the
 * ceilings once the carrier's costs are known.
 */

async function signIn(page: Page) {
  await page.goto("/admin/connexion");
  await page.getByLabel("E-mail").fill("e2e@mena.test");
  await page.getByLabel("Mot de passe").fill("e2e-password-123");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("heading", { name: "Tableau de bord" })).toBeVisible();
}

/** Today in Tunis, as the export writes it: the server refuses a day after today. */
function tunisToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Tunis", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/** What Ads Manager exports in French, by ad and by day: the summary line first, every cell quoted. */
function metaExport(day: string, campaign: string, ads: { name: string; reach: number; impressions: number; amount: string; clicks: number; purchases: string }[]): string {
  const line = (cells: (string | number)[]) => cells.map((c) => `"${c}"`).join(",");
  return [
    line(["Début des rapports", "Fin des rapports", "Nom de la campagne", "Nom de l’ensemble de publicités", "Nom de la publicité", "Jour", "Couverture", "Impressions", "Montant dépensé (TND)", "Clics sur un lien", "Achats"]),
    line([day, day, "", "", "", "", "", "", "19.75", "", ""]),
    ...ads.map((a) => line([day, day, campaign, "large-18-45", a.name, day, a.reach, a.impressions, a.amount, a.clicks, a.purchases])),
  ].join("\n");
}

/** The page fits the phone's width: wide tables scroll inside their own box. */
async function fitsWidth(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
}

/** A row's cell under the column titled `title` (the sort arrow aside). */
async function cellUnder(page: Page, row: Locator, title: string): Promise<Locator> {
  const titles = (await page.locator("thead th").allTextContents()).map((t) => t.replace(/[▲▼]/g, "").trim());
  expect(titles).toContain(title);
  return row.locator(":scope > td").nth(titles.indexOf(title));
}

const tab = (page: Page, name: string) => page.getByRole("navigation", { name: "Onglets publicités" }).getByRole("link", { name, exact: true });

test("a Meta export imported twice counts once, and its campaign gets a verdict and ceilings", async ({ page, browser }) => {
  // A new campaign each run: the test database keeps earlier runs.
  const run = Date.now().toString(36);
  const campaign = `e2e-ads-${run}`;
  const ad = `video-${run}`;
  const day = tunisToday();

  // The customer arrives from the ad and orders, cash on delivery.
  const shop = await (await browser.newContext()).newPage();
  await shop.goto(`/fr/produit/diffuseur-huiles-essentielles?utm_source=facebook&utm_medium=paid&utm_campaign=${campaign}&utm_content=${ad}`);
  await shop.getByTestId("name").fill("Sami Trabelsi");
  await shop.getByTestId("phone").fill(`9${String(Date.now()).slice(-7)}`);
  await shop.getByTestId("governorate").selectOption("Tunis");
  await shop.getByTestId("address").fill("La Marsa, rue Habib Bourguiba 5");
  await expect(shop.getByTestId("total")).toHaveText("77,000 DT");
  await shop.getByTestId("place-order").click();
  await expect(shop).toHaveURL(/\/commande\/merci\/MN-/);
  const ref = (await shop.getByTestId("order-ref").textContent())!.trim();
  await shop.context().close();

  // Called, shipped, delivered: the campaign has a cost per delivered order.
  await signIn(page);
  await page.goto(`/admin/commandes?statut=ALL&q=${ref}`);
  await page.getByText(ref).first().click();
  await expect(page.getByRole("heading", { name: ref })).toBeVisible();
  await expect(page.getByText(campaign)).toBeVisible();
  await page.getByRole("button", { name: "Confirmée", exact: true }).click();
  await page.getByRole("button", { name: "→ Expédiée" }).click();
  await page.getByRole("button", { name: "→ Livrée" }).click();
  await expect(page.getByRole("link", { name: "Demander un avis sur WhatsApp" })).toBeVisible();

  // The ceilings need the carrier's costs: set for the test, put back at the end.
  await page.goto("/admin/parametres");
  const carrier = page.getByLabel("Ce que le transporteur vous facture par colis");
  const back = page.getByLabel("Coût en plus d'un colis refusé ou retourné");
  const before = { carrier: await carrier.inputValue(), back: await back.inputValue() };
  await carrier.fill("7");
  await back.fill("4");
  await page.getByRole("button", { name: "Enregistrer les paramètres" }).click();
  await expect(page.getByText("Paramètres enregistrés.")).toBeVisible();

  // The overview, with its tabs.
  await page.goto("/admin/publicites");
  await expect(page.getByRole("heading", { name: "Publicités", exact: true })).toBeVisible();
  await expect(tab(page, "Vue d'ensemble")).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("region", { name: "Chiffres clés" }).getByText("Dépense pub")).toBeVisible();
  await expect(page.getByText("À faire d'abord")).toBeVisible();
  await fitsWidth(page);

  // The export of the campaign's two ads, pasted; the second ad's link had no utm_content.
  const csv = metaExport(day, campaign, [
    { name: ad, reach: 900, impressions: 1200, amount: "12.5", clicks: 2, purchases: "1" },
    { name: `carrousel-${run}`, reach: 600, impressions: 800, amount: "7.25", clicks: 1, purchases: "" },
  ]);
  const paste = async (replaced: string) => {
    await tab(page, "Importer").click();
    await expect(page).toHaveURL(/\/admin\/publicites\/importer$/);
    await expect(tab(page, "Importer")).toHaveAttribute("aria-current", "page");
    await page.getByLabel("Ou collez le contenu de l'export").fill(csv);
    await page.getByRole("button", { name: "Lire le texte collé" }).click();
    await expect(page.getByText("Rien n'est encore enregistré.")).toBeVisible();
    await expect(page.getByText("Meta", { exact: true })).toBeVisible();
    await expect(page.getByText("1 ligne ignorée")).toBeVisible();
    // The site saw this campaign today: its order and its visit.
    await expect(page.getByRole("listitem").filter({ hasText: campaign })).toContainText("reconnue");
    await expect(page.getByText(replaced)).toBeVisible();
    await fitsWidth(page);
    await page.getByRole("button", { name: "Importer 2 lignes · 19,750 DT" }).click();
    await expect(page.getByText(/^2 lignes importées\./)).toBeVisible();
  };
  // The campaign's line on Campagnes: the spend, and with one delivered order the same cost per delivered.
  const campaignLine = async () => {
    await tab(page, "Campagnes").click();
    await expect(page).toHaveURL(/\/admin\/publicites\/campagnes$/);
    const row = page.locator("tbody > tr").filter({ hasText: campaign });
    await expect(row).toHaveCount(1);
    await expect(await cellUnder(page, row, "Dépense")).toHaveText("19,750 DT");
    await expect(await cellUnder(page, row, "Coût / livrée")).toHaveText("19,750 DT");
    await expect(await cellUnder(page, row, "Commandes")).toContainText("1 livrée");
    await expect(await cellUnder(page, row, "Verdict")).toContainText(/Monter|Garder|À corriger|Attendre|Couper|Mesure cassée/);
    await fitsWidth(page);
    return row;
  };

  await paste("Aucune ligne déjà importée ne sera remplacée.");
  await campaignLine();

  // The same export again (Meta revises yesterday's figures): replaced, not added.
  await paste("2 lignes d'un import précédent seront remplacées");
  await expect(page.getByText(/2 lignes d'un import précédent remplacées/)).toBeVisible();
  const row = await campaignLine();
  // Unfolded: why the verdict, and its two ads.
  await row.getByRole("button", { name: "Déplier : détail et 2 publicités" }).click();
  await expect(page.getByText(/^Pourquoi « /).first()).toBeVisible();
  for (const name of [ad, `carrousel-${run}`]) await expect(page.locator("tbody > tr", { has: page.getByText(name, { exact: true }) })).toHaveCount(1);

  // Seuils: the costs used, and the ceilings of the product ordered.
  await tab(page, "Seuils").click();
  await expect(page).toHaveURL(/\/admin\/publicites\/seuils$/);
  const used = page.getByText("Transporteur par colis", { exact: true }).locator("..");
  await expect(used).toContainText("7,000 DT");
  const product = page.locator("details").filter({ has: page.getByText("Diffuseur d'huiles essentielles", { exact: true }) });
  for (const ceiling of ["Coût max par livrée", "CPA max"]) {
    await expect(product.locator("dt", { hasText: ceiling }).locator("xpath=following-sibling::dd[1]").first()).toHaveText(/^\d[\d\s]*,\d{3} DT$/);
  }
  await fitsWidth(page);

  // The imported lines are listed on Dépenses pub; deleted there, with the costs put back as they were.
  page.on("dialog", (d) => void d.accept());
  await page.goto("/admin/depenses");
  const lines = page.getByRole("row").filter({ hasText: campaign });
  await expect(lines).toHaveCount(2);
  await expect(lines.first()).toContainText("Import Meta texte collé");
  for (const left of [1, 0]) {
    await lines.first().getByRole("button", { name: "Supprimer" }).click();
    await expect(lines).toHaveCount(left);
  }
  await page.goto("/admin/parametres");
  await carrier.fill(before.carrier);
  await back.fill(before.back);
  await page.getByRole("button", { name: "Enregistrer les paramètres" }).click();
  await expect(page.getByText("Paramètres enregistrés.")).toBeVisible();
});
