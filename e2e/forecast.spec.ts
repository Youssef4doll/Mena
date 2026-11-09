import fs from "node:fs";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
import { test, expect, type Page } from "@playwright/test";
import { signIn } from "./sign-in";

/**
 * Publicités → Prévision, without an API key (the tests have none), as a
 * phone: two real ads (a picture, and a video turned into still frames in
 * the browser), Claude's reading pasted from claude.ai, public figures
 * pasted and ticked by hand, a forecast, saved. Then the spend of those ads
 * imported from an Ads Manager export: the saved forecast is compared with
 * what happened, as the next forecasts will be corrected by it.
 */

const DAY = 86_400_000;
const tunisDay = (t: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Tunis", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t));

function metaExport(day: string, campaign: string, ad: { name: string; impressions: number; amount: string; clicks: number }): string {
  const line = (cells: (string | number)[]) => cells.map((c) => `"${c}"`).join(",");
  return [
    line(["Début des rapports", "Fin des rapports", "Nom de la campagne", "Nom de l’ensemble de publicités", "Nom de la publicité", "Jour", "Couverture", "Impressions", "Montant dépensé (TND)", "Clics sur un lien", "Achats"]),
    line([day, day, campaign, "large-18-45", ad.name, day, Math.round(ad.impressions * 0.7), ad.impressions, ad.amount, ad.clicks, ""]),
  ].join("\n");
}

const fig = (metric: string, low: number, high: number, unit = "percent", market = "maghreb") => ({ metric, low, high, unit, market, period: "2025", url: `https://example.org/${metric}`, title: `Étude ${metric}`, quote: `${low} à ${high}`, note: "" });
const review = (id: string, verdict: string, ctrFactor: number) => ({
  id,
  verdict,
  angle: "démonstration",
  scores: Object.fromEntries(["hook", "clarity", "proof", "offer", "match", "format"].map((k) => [k, { score: verdict === "launch" ? 4 : 2, why: "Vu sur les images." }])),
  ctrFactor,
  convFactor: 1,
  confidence: "medium",
  risks: verdict === "fix" ? ["Prix absent de la publicité."] : [],
  fixes: verdict === "fix" ? ["Montrer le produit dès la première seconde."] : [],
  placements: ["reels"],
});

/** The page fits the phone. clientWidth, not innerWidth: a phone widens its layout viewport to fit a page that is too wide, and innerWidth with it. */
async function fitsWidth(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
}

test("a Meta plan forecast from real ads, public figures and the shop's data, then checked against the spend", async ({ page }) => {
  test.setTimeout(240_000);
  const run = Date.now().toString(36);
  fs.mkdirSync("test-results", { recursive: true });
  const picture = `test-results/forecast-${run}.png`;
  await sharp({ create: { width: 1080, height: 1350, channels: 3, background: { r: 230, g: 120, b: 60 } } }).png().toFile(picture);
  const files = [picture];
  // A short vertical video, when this machine can make one.
  try {
    const video = `test-results/forecast-${run}.webm`;
    execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=360x640:rate=25", "-t", "5", "-c:v", "libvpx", "-b:v", "300k", video]);
    files.push(video);
  } catch {
    // Without ffmpeg, the picture alone.
  }

  await signIn(page);
  await page.goto("/admin/publicites/prevision");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("link", { name: "Prévision", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByLabel("Produit")).toBeVisible();

  // The ads: the picture and the video become pictures for Claude, in the browser.
  await page.locator('input[type="file"][accept="image/*,video/*"]').setInputFiles(files);
  const ads = page.getByTestId("forecast-ad");
  await expect(ads).toHaveCount(files.length, { timeout: 30_000 });
  const names = files.map((_, i) => `prev-${run}-v${i + 1}`);
  for (const [i, name] of names.entries()) await ads.nth(i).getByLabel("Nom de la publicité (comme dans le gestionnaire)").fill(name);
  if (files.length > 1) await expect(ads.nth(1)).toContainText("Vidéo 5 s");

  // Claude's reading, through claude.ai: the request and the pictures, then the reply.
  await page.getByRole("button", { name: "Préparer les images" }).click();
  await expect(page.getByRole("link", { name: "C1.jpg" })).toBeVisible();
  const ids = files.map((_, i) => `C${i + 1}`);
  const reply = { creatives: ids.map((id, i) => review(id, i === 0 ? "launch" : "fix", i === 0 ? 1.3 : 0.8)), grouping: [ids], groupingWhy: "Même angle.", summary: "C1 est la plus claire." };
  await page.getByLabel("Réponse de claude.ai (publicités)").fill(`Voici :\n${JSON.stringify(reply)}`);
  await page.getByRole("button", { name: "Lire la réponse" }).first().click();
  await expect(ads.first()).toContainText("À lancer");
  await expect(ads.first()).toContainText("Clics : ×1,3");
  await expect(page.getByText("C1 est la plus claire.")).toBeVisible();
  if (files.length > 1) await expect(ads.nth(1)).toContainText("Montrer le produit dès la première seconde.");

  // Public figures, pasted: none counts before it is ticked.
  const figures = { figures: [fig("cpm", 1, 2, "USD"), fig("ctr", 1, 2), fig("landing", 70, 85), fig("orderRate", 1.5, 3), fig("learningEvents", 50, 50, "events", "global")], fx: [{ currency: "USD", tndPerUnit: 3.1, url: "https://example.org/fx", quote: "1 USD = 3,1 TND", date: "2026-11-01" }] };
  // Figures from an earlier run keep the box closed: it opens on its title.
  const figureReply = page.getByLabel("Réponse de claude.ai (chiffres publics)");
  if (!(await figureReply.isVisible())) await page.getByText("Chercher avec claude.ai").click();
  await figureReply.fill(JSON.stringify(figures));
  await page.getByRole("button", { name: "Lire la réponse" }).last().click();
  // The new figures replace the old ones, with nothing ticked.
  await expect(page.getByText(/0 sur 5 utilisés/)).toBeVisible();
  const boxes = page.getByRole("checkbox", { name: /^Utiliser : / });
  await expect(boxes).toHaveCount(5);
  await expect(page.getByText("À vérifier : ouvrez la page").first()).toBeVisible();
  for (let i = 0; i < 5; i++) {
    await boxes.nth(i).check();
    await expect(boxes.nth(i)).toBeChecked();
    await expect(boxes.nth(i)).toBeEnabled();
  }
  await expect(page.getByText(/5 sur 5 utilisés/)).toBeVisible();

  // The plan: one ad set at 30 DT a day, started two days ago for one day (so it is over, and its spend can be imported).
  const start = tunisDay(Date.now() - 2 * DAY);
  await page.getByLabel("Budget par jour (DT)").fill("30");
  await page.getByLabel("Jours", { exact: true }).fill("1");
  await page.getByLabel("Début").fill(start);
  const campaign = `prev-${run}`;
  await page.getByLabel("Campagne").fill(campaign);
  await page.getByRole("button", { name: "Prévoir" }).click();
  const result = page.getByTestId("forecast-result");
  await expect(result).toBeVisible({ timeout: 60_000 });
  await expect(result.getByText("Chances d'être rentable")).toBeVisible();
  await expect(result.getByRole("cell", { name: "Coût pour 1 000 affichages" })).toBeVisible();
  // The CPM comes from the USD figure converted: 3,1 to 6,2 DT.
  await expect(result.locator("tr", { hasText: "Coût pour 1 000 affichages" })).toContainText("3,1 DT à 6,2 DT (Maghreb)");
  // The learning phase is checked against Meta's 50 events, whichever way it goes.
  await expect(result.getByText(/50 événements par semaine/)).toBeVisible();
  await fitsWidth(page);

  await page.getByRole("button", { name: "Enregistrer cette prévision" }).click();
  await expect(page.getByRole("status")).toContainText("Prévision enregistrée.");

  // The spend of the first ad, imported: the saved forecast meets what happened.
  await page.goto("/admin/publicites/importer");
  await page.getByLabel("Ou collez le contenu de l'export").fill(metaExport(start, campaign, { name: names[0], impressions: 4000, amount: "30", clicks: 60 }));
  await page.getByRole("button", { name: "Lire le texte collé" }).click();
  await page.getByRole("button", { name: /^Importer 1 ligne/ }).click();
  await expect(page.getByText(/^1 ligne importée\./)).toBeVisible();

  await page.goto("/admin/publicites/prevision#historique");
  const row = page.locator("#historique tbody tr").filter({ hasText: names[0] });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("Terminée");
  await expect(row).toContainText("30 DT");
  // 4 000 impressions are enough to compare the CPM and the clicks.
  await expect(row).toContainText(/CPM ×[\d,]+ · Clics ×[\d,]+/);
  await fitsWidth(page);

  page.once("dialog", (d) => d.accept());
  await row.getByRole("button", { name: "Supprimer" }).click();
  await expect(row).toHaveCount(0);
});
