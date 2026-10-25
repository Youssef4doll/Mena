import { test, expect } from "@playwright/test";
import { signIn } from "./sign-in";

/**
 * What the October 2026 audit asked for, kept true: offers named by their
 * quantity, a name that contradicts it refused; the delay of the chosen
 * governorate; the data notice at the form; product pictures open to
 * Google; a share picture; a way past the header; and this device's details
 * forgotten on request.
 */
const PRODUCT = "/fr/produit/diffuseur-huiles-essentielles";


test("an offer is titled by its quantity; the owner's name follows only when it agrees", async ({ page }) => {
  await page.goto(PRODUCT);
  const pack = page.locator("label", { has: page.getByTestId("offer-3") });
  await expect(pack).toContainText("3 unités");
  await expect(pack).toContainText("Achetez 2, la 3e offerte");
  // The one-unit offer says its quantity, and its name ("1 unité") is not said twice.
  const one = page.locator("label", { has: page.getByTestId("offer-1") });
  await expect(one.getByText("1 unité", { exact: true })).toHaveCount(1);
});

test("the editor refuses an offer whose name speaks of another quantity", async ({ page }) => {
  await signIn(page);
  await page.goto(`/admin/produits?q=${encodeURIComponent("Diffuseur")}`);
  await page.getByRole("link", { name: /Diffuseur/ }).first().click();
  const qty = page.getByLabel("Quantité").nth(2);
  await expect(qty).toHaveValue("3");
  await qty.fill("2");
  await expect(page.getByText(/Ce nom annonce 3 unités, mais la quantité est 2/)).toBeVisible();
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.getByText(/Offre 3 : le nom « Achetez 2, la 3e offerte » annonce 3 unités, mais la quantité est 2/)).toBeVisible();
});

test("the form says what the number is for, and the delay of the governorate chosen", async ({ page }) => {
  await page.goto(PRODUCT);
  await expect(page.getByText(/Votre numéro sert à confirmer et livrer votre commande/).first()).toBeVisible();
  // Chosen again until the page is live: a choice made before it is, is reset when it starts.
  await expect(async () => {
    await page.getByTestId("governorate").first().selectOption("Sfax");
    await expect(page.getByTestId("delivery-delay").first()).toContainText("Livraison à Sfax", { timeout: 2000 });
  }).toPass({ timeout: 20_000 });
});

test("product pictures are open to Google, and the home page has a share picture", async ({ page, request }) => {
  expect(await (await request.get("/robots.txt")).text()).toContain("Allow: /api/img/");
  await page.goto("/fr");
  const og = await page.locator('meta[property="og:image"]').first().getAttribute("content");
  expect(og).toMatch(/\/opengraph-image/);
  const img = await request.get(new URL(og!).pathname);
  expect(img.headers()["content-type"]).toBe("image/png");
});

test("keyboard users can skip the header", async ({ page }) => {
  await page.goto("/fr");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Aller au contenu" })).toBeFocused();
});

test("this device's saved details are forgotten on request", async ({ page }) => {
  await page.goto("/fr/suivi");
  await page.evaluate(() => localStorage.setItem("mena_details", JSON.stringify({ name: "Amira", phone: "22123456", governorate: "Sfax", address: "Sfax Ville", ref: "MN-TEST" })));
  await page.reload();
  await page.getByRole("button", { name: "Effacer mes infos de cet appareil" }).click();
  await expect(page.getByText("Vos infos sont effacées de cet appareil.")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("mena_details"))).toBeNull();
});
