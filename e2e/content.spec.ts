import { test, expect, type Page } from "@playwright/test";
import { signIn } from "./sign-in";

/**
 * The Arabic of categories (the common names at once, the others through
 * claude.ai: the tests have no API key), and the tall pictures planned for a
 * product from the editor, with the requests written out for Gemini.
 */

/** The card of a category, found by its title. */
const card = (page: Page, name: string) => page.locator("section").filter({ has: page.getByRole("heading", { name, exact: true }) });

test("categories get their Arabic: the common names at once, the others from claude.ai's reply", async ({ page }) => {
  const run = Date.now().toString(36);
  await signIn(page);
  await page.goto("/admin/categories");
  for (const [name, slug] of [["Jardin", `jardin-${run}`], [`Pêche ${run}`, `peche-${run}`]]) {
    const form = card(page, "Nouvelle catégorie");
    await form.getByLabel("Nom", { exact: true }).fill(name);
    await form.getByLabel("Adresse").fill(slug);
    await form.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText("Enregistré.")).toBeVisible();
    await page.goto("/admin/categories");
  }
  const box = page.getByTestId("category-arabic");
  await expect(box).toContainText(`Pêche ${run}`);
  await box.getByRole("button", { name: "Traduire en arabe" }).click();
  // "Jardin" is a known aisle: written at once.
  await expect(card(page, "Jardin").last().getByLabel("Nom arabe")).toHaveValue("الجنينة");
  // The other one goes through claude.ai.
  await expect(box.getByRole("button", { name: "Copier la demande" })).toBeVisible();
  const id = await card(page, `Pêche ${run}`).locator('input[name="id"]').inputValue();
  await box.getByLabel("Réponse de l'IA pour les catégories").fill(`Voici :\n{"categories":[{"id":"${id}","nameAr":"الصيد","headlineAr":""}]}`);
  await box.getByRole("button", { name: "Mettre les traductions" }).click();
  await expect(card(page, `Pêche ${run}`).getByLabel("Nom arabe")).toHaveValue("الصيد");
});

test("the editor plans a product's tall pictures and writes the requests for Gemini", async ({ page }) => {
  await signIn(page);
  await page.goto("/admin/produits?q=diffuseur-huiles-essentielles");
  await page.getByRole("link", { name: /Diffuseur/ }).first().click();
  await page.getByText(/Faire ces images avec l'IA/).click();
  await page.getByTestId("plan-images").click();
  const ideas = {
    imageIdeas: [
      { kind: "hero", headlineAr: "ريحة باهية في الدار", headlineFr: "Une bonne odeur chez vous", points: [{ ar: "300 مل", fr: "300 ml" }], scene: "The diffuser on a shelf with a soft mist.", sceneBefore: "" },
      { kind: "before_after", headlineAr: "هواء أرطب", headlineFr: "Un air plus doux", points: [], scene: "The same room with the diffuser on.", sceneBefore: "A dry room in winter." },
    ],
  };
  await page.getByLabel("Réponse de l'IA pour les images").fill(JSON.stringify(ideas));
  await page.getByRole("button", { name: "Utiliser cette réponse" }).click();
  const panel = page.getByTestId("image-ideas");
  await expect(panel.getByLabel("Demande : Une seule grande image, avec toutes les parties")).toHaveValue(/2 bands[\s\S]*Band 1, headline:\n  «ريحة باهية في الدار»[\s\S]*«قبل»/);
  await expect(panel.getByLabel("Demande : 2. Avant / après")).toHaveValue(/A dry room in winter\./);
  await panel.getByRole("button", { name: "Français" }).click();
  await expect(panel.getByLabel("Demande : 2. Avant / après")).toHaveValue(/«Avant»[\s\S]*«Après»/);
});
