import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeTranslation, type ProductTexts } from "./translate-merge";

const before: ProductTexts = {
  name: "Lampe de chevet tactile",
  nameAr: "",
  summary: "",
  summaryAr: "ضو مريح للقراية",
  description: "Trois intensités.",
  descriptionAr: "وصف كتبو صاحب المحل",
  specs: "",
  specsAr: "",
  keywords: "",
  variants: [{ name: "Noir", nameAr: "" }],
  offers: [{ label: "1 unité", labelAr: "" }],
};
// What the model might send back, including changes it was not asked for.
const answer: ProductTexts = {
  name: "Lampe changée",
  nameAr: "لمبة سرير باللمس",
  summary: "Une lumière douce pour lire.",
  summaryAr: "تبدّل",
  description: "Changée",
  descriptionAr: "وصف جديد",
  specs: "invente",
  specsAr: "مخترع",
  keywords: "lampe, lamba, لمبة",
  variants: [{ name: "Noir", nameAr: "أكحل" }],
  offers: [{ label: "1 unité", labelAr: "حبة وحدة" }],
};

test("'fill' writes only the empty side of a filled pair, and the keywords when empty", () => {
  const out = mergeTranslation(before, answer, "fill");
  assert.equal(out.name, "Lampe de chevet tactile");
  assert.equal(out.nameAr, "لمبة سرير باللمس");
  assert.equal(out.summary, "Une lumière douce pour lire.");
  assert.equal(out.summaryAr, "ضو مريح للقراية");
  // Both sides written by the shop: untouched.
  assert.equal(out.descriptionAr, "وصف كتبو صاحب المحل");
  // Both sides empty: nothing to translate, nothing invented.
  assert.equal(out.specs, "");
  assert.equal(out.specsAr, "");
  assert.equal(out.keywords, "lampe, lamba, لمبة");
  assert.deepEqual(out.variants, [{ name: "Noir", nameAr: "أكحل" }]);
  assert.deepEqual(out.offers, [{ label: "1 unité", labelAr: "حبة وحدة" }]);
});

test("'to-ar' rewrites the Arabic of every text that has French, and never the French", () => {
  const out = mergeTranslation(before, answer, "to-ar");
  assert.equal(out.name, "Lampe de chevet tactile");
  assert.equal(out.nameAr, "لمبة سرير باللمس");
  assert.equal(out.descriptionAr, "وصف جديد");
  // No French summary: the Arabic one stays.
  assert.equal(out.summaryAr, "ضو مريح للقراية");
  assert.equal(out.specsAr, "");
});

test("keywords already typed by the shop are kept; lists of another length are ignored", () => {
  const out = mergeTranslation({ ...before, keywords: "veilleuse" }, { ...answer, variants: [] }, "fill");
  assert.equal(out.keywords, "veilleuse");
  assert.deepEqual(out.variants, before.variants);
});
