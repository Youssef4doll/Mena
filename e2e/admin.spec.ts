import { test, expect, type Page } from "@playwright/test";

async function placeOrder(page: Page, phone: string) {
  // Arrives from an ad and orders at once: the ad must still get the credit.
  // French, under /fr: Arabic is the shop's main language, at the root.
  await page.goto("/fr/produit/diffuseur-huiles-essentielles?utm_source=facebook&utm_medium=paid&utm_campaign=e2e-oct");
  await page.getByTestId("name").fill("Sami Trabelsi");
  await page.getByTestId("phone").fill(phone);
  await page.getByTestId("governorate").selectOption("Tunis");
  await page.getByTestId("address").fill("La Marsa, rue Habib Bourguiba 5");
  // First offer, "1 unité" at 69,000, plus 7,000 to Tunis. (Supplier stock: never runs out between runs.)
  await expect(page.getByTestId("total")).toHaveText("76,000 DT");
  await page.getByTestId("place-order").click();
  await expect(page).toHaveURL(/\/commande\/merci\/MN-/);
  return (await page.getByTestId("order-ref").textContent())!.trim();
}

test("the back office takes an order from call to verified review", async ({ page, browser }) => {
  const phone = `9${String(Date.now()).slice(-7)}`;
  const ref = await placeOrder(page, phone);
  const reviewText = `Diffuseur silencieux, bien emballé (${ref}).`;

  const admin = await (await browser.newContext()).newPage();
  await admin.goto("/admin");
  await expect(admin).toHaveURL(/\/admin\/connexion/);
  await admin.getByLabel("E-mail").fill("e2e@mena.test");
  await admin.getByLabel("Mot de passe").fill("e2e-password-123");
  await admin.getByRole("button", { name: "Se connecter" }).click();
  await expect(admin.getByRole("heading", { name: "Tableau de bord" })).toBeVisible();

  await admin.goto(`/admin/commandes?statut=ALL&q=${ref}`);
  await admin.getByText(ref).first().click();
  await expect(admin.getByRole("heading", { name: ref })).toBeVisible();
  await expect(admin.getByText("e2e-oct")).toBeVisible();
  await expect(admin.getByText("facebook", { exact: true })).toBeVisible();

  // The confirmation call.
  // Each step waits for the page to show the next possible move.
  await admin.getByRole("button", { name: "Confirmée", exact: true }).click();
  await admin.getByRole("button", { name: "→ Expédiée" }).click();
  await admin.getByRole("button", { name: "→ Livrée" }).click();
  await expect(admin.getByRole("link", { name: "Demander un avis sur WhatsApp" })).toBeVisible();

  // The customer (same browser that ordered) reviews from the tracking page.
  await page.goto(`/fr/suivi/${ref}`);
  await expect(page.getByText("Livrée").first()).toBeVisible();
  await page.getByRole("radio").nth(4).click();
  await page.getByPlaceholder("Votre avis (facultatif)").fill(reviewText);
  await page.getByRole("button", { name: "Publier mon avis" }).click();
  await expect(page.getByText("Merci pour votre avis.")).toBeVisible();

  // Not public until approved.
  await page.goto("/fr/produit/diffuseur-huiles-essentielles");
  await expect(page.getByText(reviewText)).toHaveCount(0);

  await admin.goto("/admin/avis");
  const mine = admin.getByRole("listitem").filter({ hasText: reviewText });
  await mine.getByRole("button", { name: "Publier" }).click();
  await expect(mine).toHaveCount(0);

  await page.goto("/fr/produit/diffuseur-huiles-essentielles");
  await expect(page.getByText(reviewText)).toBeVisible();
  await expect(page.getByText("Client livré").first()).toBeVisible();

  // The analytics page renders with this order in it.
  await admin.goto("/admin/analytics?p=today");
  await expect(admin.getByRole("heading", { name: "Analytics" })).toBeVisible();
  await expect(admin.getByRole("heading", { name: "Entonnoir" })).toBeVisible();
  await expect(admin.getByRole("heading", { name: "Sources de trafic" })).toBeVisible();
  const csv = await admin.request.get("/admin/analytics/export?report=daily&p=today");
  expect(csv.headers()["content-type"]).toContain("text/csv");
});

test("admin pages refuse anonymous visitors", async ({ request, page }) => {
  await page.goto("/admin/commandes");
  await expect(page).toHaveURL(/\/admin\/connexion/);
  const res = await request.get("/admin/analytics/export?report=daily", { maxRedirects: 0 });
  expect([307, 308, 401]).toContain(res.status());
});
