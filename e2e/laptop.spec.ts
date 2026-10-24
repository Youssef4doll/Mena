import { test, expect } from "@playwright/test";

/**
 * On a laptop: the long pictures in a column about a phone's width, with the
 * price and the button beside them while they are read; product cards five
 * to a row. A phone keeps its own layout (see product-page.spec.ts).
 */
const PRODUCT = "/fr/produit/diffuseur-huiles-essentielles";

test.describe("laptop", () => {
  test.use({ viewport: { width: 1366, height: 768 }, isMobile: false, hasTouch: false });

  test("the long pictures stay narrow, and the order stays beside them", async ({ page }) => {
    await page.goto(PRODUCT);
    const pictures = page.locator("#details img");
    expect(await pictures.count()).toBeGreaterThan(0);
    const box = (await pictures.first().boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(500);

    // Down to the last picture: the price and the button are still on screen.
    await pictures.last().scrollIntoViewIfNeeded();
    const side = page.getByTestId("side-order");
    await expect(side).toBeInViewport();
    await expect(side).toContainText("Paiement à la livraison");
    await side.getByRole("button", { name: "Commander maintenant" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("cards are five to a row", async ({ page }) => {
    await page.goto("/fr/boutique");
    const cards = page.locator("a[data-slug]");
    expect(await cards.count()).toBeGreaterThanOrEqual(5);
    const tops = await cards.evaluateAll((els) => els.slice(0, 6).map((a) => Math.round(a.getBoundingClientRect().top)));
    // The first five on one line, the sixth under them.
    expect(new Set(tops.slice(0, 5)).size).toBe(1);
    if (tops.length > 5) expect(tops[5]).toBeGreaterThan(tops[0]);
  });
});

test.describe("phone", () => {
  test.use({ viewport: { width: 360, height: 800 } });

  test("no side order: the pictures go edge to edge, the bar at the bottom is the button", async ({ page }) => {
    await page.goto(PRODUCT);
    await expect(page.getByTestId("side-order")).toBeHidden();
    const box = (await page.locator("#details img").first().boundingBox())!;
    expect(box.width).toBe(360);
  });
});
