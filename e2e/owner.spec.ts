import { test, expect } from "@playwright/test";
import { signIn } from "./sign-in";
import sharp from "sharp";
import { TEST_URL } from "./targets";

/** The owner's tools: the quality of each product page, and the home page's banners. */


test("each product page has its score and what it lacks, the weakest first", async ({ page }) => {
  await signIn(page);
  await page.goto("/admin/produits/qualite");
  await expect(page.getByRole("heading", { name: "Qualité des fiches" })).toBeVisible();
  const scores = (await page.getByTestId("quality-score").allTextContents()).map(Number);
  expect(scores.length).toBeGreaterThan(0);
  expect([...scores].sort((a, b) => a - b)).toEqual(scores);
  // One thing missing, and only the pages that lack it.
  await page.getByRole("link", { name: /^Grandes images de description/ }).click();
  await expect(page.getByTestId("quality-list").locator("li").first()).toContainText(/grandes? images? de description/i);
});

test("several home banners, each leading somewhere, with arrows on a computer, then removed", async ({ page, browser }) => {
  const png = (r: number) => sharp({ create: { width: 1600, height: 700, channels: 3, background: { r, g: 90, b: 140 } } }).png().toBuffer();
  await signIn(page);
  await page.goto("/admin/parametres");
  const banners = page.getByTestId("banners");
  const upload = async (r: number) => {
    const before = await banners.locator("img").count();
    await banners.locator('input[type="file"]').setInputFiles({ name: `banner-${r}.png`, mimeType: "image/png", buffer: await png(r) });
    await expect(banners.locator("img")).toHaveCount(before + 1);
  };
  const start = await banners.locator("img").count();
  try {
    await upload(40);
    await upload(200);
    await banners.getByLabel("Lien de la photo").nth(start).selectOption({ label: "Toute la boutique" });
    await page.getByRole("button", { name: "Enregistrer les paramètres" }).click();
    await expect(page.getByText("Paramètres enregistrés.")).toBeVisible();

    await page.goto("/fr");
    const dots = page.locator('button[aria-label^="Photo "][aria-current]');
    await expect(dots).toHaveCount(start + 2);
    await expect(page.locator('a[href="/fr/boutique"]').filter({ has: page.locator("img") }).first()).toBeAttached();
    // A finger swipes: no arrows on the phone.
    await expect(page.getByRole("button", { name: "Photo suivante" })).toBeHidden();

    // With a mouse, the arrows go forward, and from the first back to the last.
    const desk = await browser.newContext({ baseURL: TEST_URL, viewport: { width: 1366, height: 800 }, hasTouch: false, isMobile: false });
    try {
      const pc = await desk.newPage();
      await pc.goto("/fr");
      const deskDots = pc.locator('button[aria-label^="Photo "][aria-current]');
      await expect(deskDots.first()).toHaveAttribute("aria-current", "true");
      await pc.getByRole("button", { name: "Photo suivante" }).click();
      await expect(deskDots.nth(1)).toHaveAttribute("aria-current", "true");
      await pc.getByRole("button", { name: "Photo précédente" }).click();
      await expect(deskDots.first()).toHaveAttribute("aria-current", "true");
      await pc.getByRole("button", { name: "Photo précédente" }).click();
      await expect(deskDots.last()).toHaveAttribute("aria-current", "true");
    } finally {
      await desk.close();
    }
  } finally {
    // Back as it was: the other tests read the home page.
    await page.goto("/admin/parametres");
    while ((await banners.locator("img").count()) > start) await banners.getByRole("button", { name: "Retirer" }).last().click();
    await page.getByRole("button", { name: "Enregistrer les paramètres" }).click();
    await expect(page.getByText("Paramètres enregistrés.")).toBeVisible();
  }
});
