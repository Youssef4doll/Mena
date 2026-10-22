import { test, expect, type Page } from "@playwright/test";

/** French pages live under /fr: Arabic, the shop's main language, is at the root. */
const FR = "/fr";
const PRODUCT = `${FR}/produit/diffuseur-huiles-essentielles`;

// The phones most customers have.
test.use({ viewport: { width: 360, height: 800 } });

/** Down to the long pictures, past the form, the way a reader gets there. */
async function readPastTheForm(page: Page) {
  await page.evaluate(() => scrollTo(0, document.getElementById("desc-title")!.getBoundingClientRect().top + scrollY));
  await expect.poll(() => page.locator("#commander").evaluate((el) => el.getBoundingClientRect().bottom)).toBeLessThan(0);
  await expect(page.getByTestId("sticky-bar")).toHaveAttribute("aria-hidden", "false");
}

test("the gallery's link counts the long pictures and leads to them", async ({ page }) => {
  await page.goto(PRODUCT);
  // The real number: the long pictures this page shows.
  const pictures = await page.locator("#details img").count();
  expect(pictures).toBeGreaterThan(0);
  const link = page.getByTestId("details-link");
  await expect(link).toHaveText(new RegExp(`^Voir les détails en images\\s\\(${pictures}\\)$`));
  await link.click();
  // The section's title has the link's words, and the focus, so the reader knows where they are.
  const title = page.getByRole("heading", { name: "Détails en images" });
  await expect(title).toBeFocused();
  await expect(title).toBeInViewport();

  // A product without long pictures has no link, and its text keeps its usual title.
  await page.goto(`${FR}/produit/montre-minimaliste`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Montre minimaliste");
  await expect(page.getByTestId("details-link")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Description" })).toBeVisible();
});

test("still above the form, the bar goes down to it; past it, the form opens in place with the choice and what was typed", async ({ page }) => {
  await page.goto(PRODUCT);
  const bar = page.getByTestId("sticky-bar");
  // The form just under the screen: the bar goes down to it, as before, and opens no sheet.
  await page.evaluate(() => scrollTo(0, document.getElementById("commander")!.getBoundingClientRect().top + scrollY - innerHeight + 120));
  await expect(bar).toHaveAttribute("aria-hidden", "false");
  await bar.getByRole("button").click();
  await expect(page.locator("#bb-name")).toBeFocused();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByTestId("offer-3").check();
  await page.locator("#commander").getByTestId("name").fill("TESTPDP Amira");
  await readPastTheForm(page);
  const where = await page.evaluate(() => scrollY);
  await bar.getByRole("button").click();

  const sheet = page.getByRole("dialog");
  await expect(sheet.locator("#os-title")).toHaveText("Diffuseur d'huiles essentielles");
  // Only the address is marked, so the phone's Back button closes the sheet.
  await expect(page).toHaveURL(/\/fr\/produit\/diffuseur-huiles-essentielles#commande$/);
  // The close button has the focus: no keyboard over the form.
  await expect(sheet.getByRole("button", { name: "Fermer" }).last()).toBeFocused();
  await expect(sheet.getByTestId("offer-3")).toBeChecked();
  await expect(sheet.getByTestId("name")).toHaveValue("TESTPDP Amira");
  // Typed in the sheet, kept on the page.
  await sheet.getByTestId("address").fill("Sfax Ville, rue de la République 12");

  await page.goBack();
  await expect(sheet).toHaveCount(0);
  await expect(page).toHaveURL(/\/fr\/produit\/diffuseur-huiles-essentielles$/);
  expect(await page.evaluate(() => scrollY)).toBe(where);
  await expect(bar.getByRole("button")).toBeFocused();
  await expect(page.locator("#commander").getByTestId("address")).toHaveValue("Sfax Ville, rue de la République 12");
});

test("an order from the sheet at the end of the page reaches the thank-you page", async ({ page }) => {
  await page.goto(PRODUCT);
  await page.getByTestId("offer-3").check();
  await page.locator("#commander").getByTestId("name").fill("TESTPDP Amira");

  // The order block after the questions has its own button: the bar steps aside while it is on screen.
  const end = page.getByTestId("end-order");
  await end.scrollIntoViewIfNeeded();
  await expect(page.getByTestId("sticky-bar")).toHaveAttribute("aria-hidden", "true");
  await expect(end).toContainText("138,000 DT");
  await end.getByRole("button", { name: "Commander maintenant" }).click();

  const sheet = page.getByRole("dialog");
  await expect(sheet.getByTestId("name")).toHaveValue("TESTPDP Amira");
  await sheet.getByTestId("phone").fill("22 900 777");
  await sheet.getByTestId("governorate").selectOption("Sfax");
  await sheet.getByTestId("address").fill("Sfax Ville, rue de la République 12");
  // The same server prices as the page: 2 × 69,000, delivery included.
  await expect(sheet.getByTestId("total")).toHaveText("138,000 DT");
  const sent = page.waitForRequest((r) => r.url().endsWith("/api/orders") && r.method() === "POST");
  await sheet.getByTestId("place-order").click();
  expect((await sent).postDataJSON().origin).toBe("sheet");
  await expect(page).toHaveURL(/\/fr\/commande\/merci\/MN-/);
  await expect(page.getByText("Achetez 2, la 3e offerte")).toBeVisible();
  // The thank-you page took the sheet's entry: Back returns to the product page, not to a closed sheet's #commande.
  await page.goBack();
  await expect(page).toHaveURL(/\/fr\/produit\/diffuseur-huiles-essentielles$/);
});

test("an answer lost on the page, then the same order sent from the sheet, still make one order", async ({ page }) => {
  await page.goto(PRODUCT);
  await page.getByTestId("offer-3").check();
  const form = page.locator("#commander");
  await form.getByTestId("name").fill("TESTPDP Amira");
  await form.getByTestId("phone").fill("22 900 777");
  await form.getByTestId("governorate").selectOption("Sfax");
  await form.getByTestId("address").fill("Sfax Ville, rue de la République 12");
  await expect(form.getByTestId("total")).toHaveText("138,000 DT");

  // The order reaches the server, but its answer is lost on the way back (a weak signal).
  let first: string | null = null;
  await page.route("**/api/orders", async (route) => {
    const res = await route.fetch();
    first = (await res.json()).ref;
    await route.abort("failed");
  });
  await form.getByTestId("place-order").click();
  await expect(form.getByText(/ne sera pas enregistrée deux fois/)).toBeVisible();
  expect(first).toMatch(/^MN-/);
  await page.unroute("**/api/orders");

  // The customer reads on, then orders from the sheet: the same attempt, so the server answers with the order it made.
  await readPastTheForm(page);
  await page.getByTestId("sticky-bar").getByRole("button").click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByTestId("total")).toHaveText("138,000 DT");
  await sheet.getByTestId("place-order").click();
  await expect(page).toHaveURL(new RegExp(`/commande/merci/${first}$`));
});
