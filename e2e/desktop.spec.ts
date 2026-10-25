import { test, expect } from "@playwright/test";
import { TEST_URL } from "./targets";

/**
 * A wide computer: the product page in three columns, like Amazon's, with
 * its purchase box; the phone keeps its own page (the other tests).
 */
test("on a wide computer the purchase box takes the choice to the form over the page", async ({ browser }) => {
  const ctx = await browser.newContext({ baseURL: TEST_URL, viewport: { width: 1440, height: 900 }, hasTouch: false, isMobile: false });
  try {
    const page = await ctx.newPage();
    await page.goto("/fr/produit/diffuseur-huiles-essentielles");
    const box = page.getByTestId("desk-box");
    await expect(box).toBeVisible();
    await expect(page.getByTestId("in-brief")).toBeVisible();
    // The page's own form is not shown twice: it opens over the page.
    await expect(page.locator("#commander")).toBeHidden();
    await expect(box.getByTestId("desk-buy")).toBeInViewport();

    await box.locator('input[name="dk-offer"]').nth(2).check();
    await expect(box).toContainText("138,000");
    await box.getByTestId("desk-buy").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByTestId("offer-3")).toBeChecked();
    await expect(dialog.getByLabel("Téléphone")).toBeVisible();
  } finally {
    await ctx.close();
  }
});

test("a phone has no purchase box: the form is on the page", async ({ page }) => {
  await page.goto("/fr/produit/diffuseur-huiles-essentielles");
  await expect(page.getByTestId("desk-box")).toBeHidden();
  await expect(page.locator("#commander")).toBeVisible();
});
