import { test, expect } from "@playwright/test";

test("a phone visitor orders with cash on delivery", async ({ page }) => {
  await page.goto("/produit/montre-minimaliste");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Montre minimaliste");

  // A variant must be chosen first.
  await page.getByTestId("buy-now").click();
  await expect(page.getByText("Choisissez une option")).toBeVisible();
  await page.getByRole("button", { name: /Doré/ }).click();
  await page.getByTestId("buy-now").click();

  await expect(page).toHaveURL(/\/commande$/);
  await page.getByTestId("phone").fill("22 123 456");
  await page.getByTestId("name").fill("Amira Ben Salah");
  await page.getByTestId("governorate").selectOption("Sfax");
  await page.getByTestId("city").fill("Sfax Ville");
  await page.getByTestId("address").fill("Rue de la République 12");

  // Doré is 85,000 + 8,000 delivery to Sfax, both from the server.
  await expect(page.getByTestId("total")).toHaveText("93,000 DT");
  await page.getByTestId("place-order").click();

  await expect(page).toHaveURL(/\/commande\/merci\/MN-/);
  const ref = (await page.getByTestId("order-ref").textContent())!.trim();
  expect(ref).toMatch(/^MN-[2-9A-Z]{6}$/);

  // The thank-you page set the access cookie: the order page opens.
  await page.goto(`/suivi/${ref}`);
  await expect(page.getByText("En attente de confirmation")).toBeVisible();
  await expect(page.getByText("93,000 DT").first()).toBeVisible();
});

test("the server refuses a total the customer was not shown", async ({ request }) => {
  const quote = await (await request.post("/api/quote", { data: { lines: [{ productId: "nope", qty: 1 }] } })).json();
  expect(quote.lines).toHaveLength(0);

  const res = await request.post("/api/orders", {
    data: {
      lines: [{ productId: "nope", qty: 1 }],
      phone: "22123456",
      name: "Test",
      governorate: "Tunis",
      city: "Tunis",
      address: "Rue 1",
      payment: "COD",
      expectedTotal: 1,
      locale: "fr",
    },
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
