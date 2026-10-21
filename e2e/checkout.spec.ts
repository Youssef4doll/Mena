import { test, expect, type Page } from "@playwright/test";

async function fillDetails(page: Page, gov: string) {
  await page.getByTestId("name").fill("Amira Ben Salah");
  await page.getByTestId("phone").fill("22 123 456");
  await page.getByTestId("governorate").selectOption(gov);
  await page.getByTestId("address").fill("Sfax Ville, rue de la République 12");
}

/** French pages live under /fr: Arabic, the shop's main language, is at the root. */
const FR = "/fr";

test("Arabic is the main language, at the root; French is one tap away", async ({ page }) => {
  await page.goto("/produit/diffuseur-huiles-essentielles");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar-TN");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("موزّع زيوت عطرية");
  // The short line under the name, in Tunisian.
  await expect(page.getByTestId("summary")).toContainText("بخار رقيق");
  await expect(page.getByTestId("place-order")).toContainText("اشري توّا");
  // /ar/... is the root form; French keeps its prefix.
  await page.goto("/ar/produit/diffuseur-huiles-essentielles");
  await expect(page).toHaveURL(/\/produit\/diffuseur-huiles-essentielles$/);
  await page.getByRole("link", { name: "Français" }).first().click();
  await expect(page).toHaveURL(/\/fr\/produit\/diffuseur-huiles-essentielles$/);
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Diffuseur d'huiles essentielles");
});

test("the basket: two products, one order, every price from the server", async ({ page }) => {
  await page.goto(`${FR}/produit/diffuseur-huiles-essentielles`);
  await page.getByTestId("offer-3").check();
  await page.locator("#commander").getByTestId("add-to-cart").click();
  const added = page.getByRole("dialog");
  await expect(added.getByText("Ajouté au panier")).toBeVisible();
  await added.getByRole("button", { name: "Continuer mes achats" }).click();
  await expect(page.getByTestId("cart-count")).toHaveText("1");

  // A product with options asks for the option before the basket too.
  await page.goto(`${FR}/produit/montre-minimaliste`);
  await page.locator("#commander").getByTestId("add-to-cart").click();
  await expect(page.getByText("Choisissez d'abord une option plus haut.")).toBeVisible();
  await page.getByTestId("variant-select").first().click();
  await page.getByRole("option", { name: /Doré/ }).click();
  await page.locator("#commander").getByTestId("add-to-cart").click();
  await page.getByTestId("go-to-cart").click();
  await expect(page).toHaveURL(/\/fr\/panier$/);
  await expect(page.getByTestId("cart-line")).toHaveCount(2);

  await fillDetails(page, "Sfax");
  // 138,000 for the pack + 85,000 for Doré; the pack includes delivery, so the order ships free.
  await expect(page.getByTestId("total")).toHaveText("223,000 DT");
  await page.getByTestId("place-order").click();
  await expect(page).toHaveURL(/\/commande\/merci\/MN-/);
  await expect(page.getByText("Achetez 2, la 3e offerte")).toBeVisible();

  // The order empties the basket.
  await page.goto(`${FR}/panier`);
  await expect(page.getByText("Votre panier est vide")).toBeVisible();
  // The old checkout address leads to the basket.
  await page.goto(`${FR}/commande`);
  await expect(page).toHaveURL(/\/fr\/panier$/);
});

test("the pictures open in full screen, zoom, and the phone's Back closes them", async ({ page }) => {
  await page.goto(`${FR}/produit/diffuseur-huiles-essentielles`);
  await page.getByRole("button", { name: "Voir la photo en grand" }).first().click();
  const viewer = page.getByRole("dialog");
  await expect(viewer.getByText(/^1 \/ \d+$/)).toBeVisible();
  await viewer.getByRole("button", { name: "Zoomer", exact: true }).click();
  await expect(viewer.getByRole("button", { name: "Réduire", exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).toHaveURL(/\/fr\/produit\/diffuseur-huiles-essentielles$/);
});

test("a phone visitor orders a product with options, cash on delivery", async ({ page }) => {
  await page.goto(`${FR}/produit/montre-minimaliste`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Montre minimaliste");

  // The option must be chosen first; the form says so instead of failing silently.
  await fillDetails(page, "Sfax");
  await page.getByTestId("place-order").click();
  await expect(page.getByText("Choisissez d'abord une option plus haut.")).toBeVisible();
  await page.getByTestId("variant-select").first().click();
  await page.getByRole("option", { name: /Doré/ }).click();

  // Doré is 85,000 + 8,000 delivery to Sfax, both from the server.
  await expect(page.getByTestId("total")).toHaveText("93,000 DT");
  await page.getByTestId("place-order").click();

  await expect(page).toHaveURL(/\/commande\/merci\/MN-/);
  const ref = (await page.getByTestId("order-ref").textContent())!.trim();
  expect(ref).toMatch(/^MN-[2-9A-Z]{6}$/);

  await page.goto(`${FR}/suivi/${ref}`);
  await expect(page.getByText("En attente de confirmation")).toBeVisible();
  await expect(page.getByText("93,000 DT").first()).toBeVisible();
});

test("an offer sets quantity, price and free delivery on the server", async ({ page }) => {
  // Supplier stock: the test database keeps earlier runs' orders, so a counted stock would run out.
  await page.goto(`${FR}/produit/diffuseur-huiles-essentielles`);
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
  await page.goto(`${FR}/suivi/MN-ABCDEF`);
  await expect(page).toHaveURL(/\/suivi$/);
  const res = await request.post("/api/orders/lookup", { data: { ref: "MN-ABCDEF", phone: "22123456" } });
  expect(res.status()).toBe(404);
});

test("a pack's saving is measured against the shop's own one-unit offer", async ({ page }) => {
  await page.goto(`${FR}/produit/diffuseur-huiles-essentielles`);
  // "1 unité" is 69,000, so three cost 207,000 one by one; the pack is 138,000, a third less.
  const pack = page.locator("label", { has: page.getByTestId("offer-3") });
  await expect(pack.getByText("207,000 DT", { exact: true })).toBeVisible();
  await expect(pack.getByText("−33%")).toBeVisible();
  // The single unit strikes only the product's real former price (79,000 in the demo), with no %:
  // every % on the cards is measured against the same one-unit offer.
  const one = page.locator("label", { has: page.getByTestId("offer-1") });
  await expect(one.getByText("79,000 DT", { exact: true })).toBeVisible();
  await expect(one.getByText(/%/)).toHaveCount(0);
});

test("Enter in the promo field applies the code instead of sending the order", async ({ page }) => {
  await page.goto(`${FR}/produit/diffuseur-huiles-essentielles`);
  await fillDetails(page, "Sfax");
  await page.getByRole("button", { name: "J'ai un code promo" }).click();
  const code = page.getByLabel("Code promo");
  await code.fill("NOPE10");
  await code.press("Enter");
  await expect(page.getByText("NOPE10")).toBeVisible();
  await expect(page).toHaveURL(/\/produit\/diffuseur-huiles-essentielles/);
});

test("saved details alone do not count as a started order", async ({ page }) => {
  await page.goto(`${FR}/produit/diffuseur-huiles-essentielles`);
  await page.evaluate(() => localStorage.setItem("mena_details", JSON.stringify({ name: "Amira", phone: "22123456", governorate: "Sfax", address: "Sfax Ville" })));
  const saves: string[] = [];
  page.on("request", (r) => {
    if (r.url().endsWith("/api/cart") && r.method() === "POST") saves.push(r.url());
  });
  await page.goto(`${FR}/produit/lampe-de-chevet-tactile`);
  await expect(page.getByTestId("phone")).toHaveValue("22123456");
  await page.waitForTimeout(1500);
  expect(saves).toHaveLength(0);
  // Using the form is what starts it.
  await page.getByTestId("address").fill("Sfax Ville, rue 5");
  await expect.poll(() => saves.length, { timeout: 5000 }).toBeGreaterThan(0);
});

test("Acheter maintenant on a card orders without leaving the list", async ({ page }) => {
  await page.goto(`${FR}/categorie/maison`);
  const card = page.locator("div.group", { hasText: "Diffuseur d'huiles essentielles" }).first();
  await card.getByRole("button", { name: "Acheter maintenant" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.locator("#qb-title")).toHaveText("Diffuseur d'huiles essentielles");
  // Still the list: the sheet only marks the address, so the phone's Back button closes it.
  await expect(page).toHaveURL(/\/fr\/categorie\/maison#commande$/);
  await page.goBack();
  await expect(sheet).toHaveCount(0);
  await expect(page).toHaveURL(/\/fr\/categorie\/maison$/);
  await card.getByRole("button", { name: "Acheter maintenant" }).click();
  await expect(sheet.locator("#qb-title")).toHaveText("Diffuseur d'huiles essentielles");
  await sheet.getByTestId("offer-3").check();
  await sheet.getByTestId("name").fill("Amira Ben Salah");
  await sheet.getByTestId("phone").fill("22 123 456");
  await sheet.getByTestId("address").fill("Sfax Ville, rue de la République 12");
  await sheet.getByTestId("governorate").selectOption("Sfax");
  // Same server prices as the product page: 2 × 69,000, delivery included.
  await expect(sheet.getByTestId("total")).toHaveText("138,000 DT");
  await sheet.getByTestId("place-order").click();
  await expect(page).toHaveURL(/\/commande\/merci\/MN-/);
});

test("a lost answer, then a second tap, still make one order; the ordered product leaves the basket", async ({ page }) => {
  await page.goto(`${FR}/produit/diffuseur-huiles-essentielles`);
  await page.getByTestId("offer-3").check();
  // In the basket too, then ordered from its page: it must not stay there, inviting a second order.
  await page.locator("#commander").getByTestId("add-to-cart").click();
  await page.getByRole("dialog").getByRole("button", { name: "Continuer mes achats" }).click();
  await expect(page.getByTestId("cart-count")).toHaveText("1");
  await fillDetails(page, "Sfax");
  await expect(page.getByTestId("total")).toHaveText("138,000 DT");

  // The order reaches the server, but its answer is lost on the way back (a weak signal).
  let first: string | null = null;
  await page.route("**/api/orders", async (route) => {
    const res = await route.fetch();
    first = (await res.json()).ref;
    await route.abort("failed");
  });
  await page.getByTestId("place-order").click();
  await expect(page.getByText(/ne sera pas enregistrée deux fois/)).toBeVisible();
  expect(first).toMatch(/^MN-/);

  // Tapping again sends the same attempt: the server answers with the order it already made.
  await page.unroute("**/api/orders");
  await page.getByTestId("place-order").click();
  await expect(page).toHaveURL(new RegExp(`/commande/merci/${first}$`));
  await expect(page.getByTestId("cart-count")).toHaveCount(0);
});

test("search finds the product despite a typing mistake, and completes like Google", async ({ page }) => {
  await page.goto(`${FR}/`);
  const box = page.getByRole("combobox", { name: "Rechercher" }).first();
  await box.fill("difus");
  const list = page.getByTestId("suggestions");
  await expect(list.getByText("Diffuseur d'huiles essentielles").first()).toBeVisible();
  // Arrow down picks the completion, Enter searches it.
  await box.press("ArrowDown");
  await box.press("Enter");
  await expect(page).toHaveURL(/\/fr\/recherche\?q=Diffuseur/);
  // A mistake in a full search: the page says what it searched instead.
  await page.goto(`${FR}/recherche?q=${encodeURIComponent("lamep de chevt")}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("lampe de chevet");
  await expect(page.getByText("Vous avez écrit « lamep de chevt »")).toBeVisible();
  // Tunisian written in Latin letters, through the product's keywords.
  await page.goto(`${FR}/recherche?q=lamba`);
  await expect(page.getByText("Lampe de chevet tactile").first()).toBeVisible();
});
