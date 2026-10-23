import { test } from "node:test";
import assert from "node:assert/strict";
import { arabicCategory, lacksArabic, manualCategoriesRequest, readCategoriesAnswer } from "./category-ar";
import { CATEGORY_FR } from "./supplier-page";

test("the common aisles have their Tunisian name, however they are typed", () => {
  assert.equal(arabicCategory("Maison"), "الدار");
  assert.equal(arabicCategory(" CUISINE "), "الكوجينة");
  assert.equal(arabicCategory("Électroménager"), "الكهرومنزلي");
  assert.equal(arabicCategory("Salle  de bain"), "بيت البانو");
  assert.equal(arabicCategory("Pêche sous-marine"), "");
  // Every category an Ecomness import can create has one.
  for (const fr of new Set(Object.values(CATEGORY_FR))) assert.ok(arabicCategory(fr), fr);
});

test("a category lacks Arabic when its name, or its card title, is in French only", () => {
  const c = { id: "c1", name: "Maison", nameAr: "الدار", headline: "", headlineAr: "" };
  assert.equal(lacksArabic(c), false);
  assert.equal(lacksArabic({ ...c, nameAr: " " }), true);
  assert.equal(lacksArabic({ ...c, headline: "Tout pour la maison" }), true);
});

test("the request lists the categories by id; the reply is read back, on one line", () => {
  const r = manualCategoriesRequest([{ id: "c1", name: "Pêche", nameAr: "", headline: "Tout pour la pêche", headlineAr: "" }]);
  assert.ok(r.includes('"id": "c1"') && r.includes("Tout pour la pêche") && r.includes("Tunisian Arabic"));
  assert.deepEqual(readCategoriesAnswer('Voici : {"categories":[{"id":"c1","nameAr":"الصيد\\n","headlineAr":"كل شي للصيد"},{"id":"c2","nameAr":"","headlineAr":""}]}'), [
    { id: "c1", nameAr: "الصيد", headlineAr: "كل شي للصيد" },
  ]);
  assert.equal(readCategoriesAnswer("rien"), null);
});
