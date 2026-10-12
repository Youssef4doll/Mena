import { test, expect, type Page } from "@playwright/test";

async function fillDetails(page: Page, gov: string) {
  await page.getByTestId("name").fill("Amira Ben Salah");
  await page.getByTestId("phone").fill("22 123 456");
  await page.getByTestId("governorate").selectOption(gov);
  await page.getByTestId("address").fill("Sfax Ville, rue de la République 12");
}

test("there is no basket: the product page is where the order is placed", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cart-button")).toHaveCount(0);
  await page.goto("/commande");
  await expect(page).toHaveURL(/\/boutique$/);
});

test("a phone visitor orders a product with options, cash on delivery", async ({ page }) => {
  await page.goto("/produit/montre-minimaliste");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Montre minimaliste");

  // The option must be chosen first; the form says so instead of failing silently.
  await fillDetails(page, "Sfax");
  await page.getByTestId("place-order").click();
  await expect(page.getByText("Choisissez d'abord une option plus haut.")).toBeVisible();
  await page.getByRole("button", { name: /Doré/ }).click();

  // Doré is 85,000 + 8,000 delivery to Sfax, both from the server.
  await expect(page.getByTestId("total")).toHaveText("93,000 DT");
  await page.getByTestId("place-order").click();

  await expect(page).toHaveURL(/\/commande\/merci\/MN-/);
  const ref = (await page.getByTestId("order-ref").textContent())!.trim();
  expect(ref).toMatch(/^MN-[2-9A-Z]{6}$/);

  await page.goto(`/suivi/${ref}`);
  await expect(page.getByText("En attente de confirmation")).toBeVisible();
  await expect(page.getByText("93,000 DT").first()).toBeVisible();
});

test("an offer sets quantity, price and free delivery on the server", async ({ page }) => {
  // Supplier stock: the test database keeps earlier runs' orders, so a counted stock would run out.
  await page.goto("/produit/diffuseur-huiles-essentielles");
  await page.getByTestId("offer-3").check();
  await fillDetails(page, "Sfax");
  // "Achetez 2, la 3e offerte": 2 × 69,000 = 138,000, delivery included.
  await expect(page.getByTestId("total")).toHaveText("138,000 DT");
  await page.getByTestId("place-order").click();
  await expect(page).toHaveURL(/\/commande\/merci\/MN-/);
  await expect(page.getByText("Achetez 2, la 3e offerte")).toBeVisible();
  await expect(page.getByText("138,000 DT").first()).toBeVisible();
});

test("the server refuses a total the customer was not shown", async ({ request }) => {
  const quote = await (await request.post("/api/quote", { data: { lines: [{ productId: "nope", qty: 1 }] } })).json();
  expect(quote.lines).toHaveLength(0);

  const res = await request.post("/api/orders", {
    data: { lines: [{ productId: "nope", qty: 1 }], phone: "22123456", name: "Test", governorate: "Tunis", address: "Rue 1", payment: "COD", expectedTotal: 1, locale: "fr" },
  });
  expect(res.status()).toBe(409);
  expect((await res.json()).error).toBe("empty");
});

test("an order page needs its link or ref + phone", async ({ page, request }) => {
  await page.goto("/suivi/MN-ABCDEF");
  await expect(page).toHaveURL(/\/suivi$/);
  const res = await request.post("/api/orders/lookup", { data: { ref: "MN-ABCDEF", phone: "22123456" } });
  expect(res.status()).toBe(404);
});

test("arabic pages are right-to-left", async ({ page }) => {
  await page.goto("/ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar-TN");
});
