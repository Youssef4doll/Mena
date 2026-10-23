import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeTranslation, needsTranslation, type ProductTexts } from "./translate-merge";

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
  seoTitle: "",
  seoTitleAr: "",
  seoDescription: "Ma description pour Google.",
  seoDescriptionAr: "",
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
  seoTitle: "Lampe de chevet tactile LED",
  seoTitleAr: "لمبة سرير باللمس",
  seoDescription: "Changée",
  seoDescriptionAr: "وصف لغوغل",
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

test("the Google title and description are written in both languages when both are empty, translated otherwise, never replaced", () => {
  const out = mergeTranslation(before, answer, "fill");
  assert.deepEqual([out.seoTitle, out.seoTitleAr], ["Lampe de chevet tactile LED", "لمبة سرير باللمس"]);
  assert.deepEqual([out.seoDescription, out.seoDescriptionAr], ["Ma description pour Google.", "وصف لغوغل"]);
  const filled = { ...before, seoTitle: "Mon titre", seoTitleAr: "عنواني" };
  assert.deepEqual([mergeTranslation(filled, answer, "fill").seoTitle, mergeTranslation(filled, answer, "fill").seoTitleAr], ["Mon titre", "عنواني"]);
  assert.equal(mergeTranslation(filled, answer, "to-ar").seoTitleAr, "لمبة سرير باللمس");
  // On one line, within what the product accepts.
  assert.equal(mergeTranslation(before, { ...answer, seoTitle: "Lampe\nde chevet " + "x".repeat(200) }, "fill").seoTitle.length, 120);
});

test("a product without its Google texts has something to translate", () => {
  const done = { ...before, nameAr: "x", summary: "x", specs: "", keywords: "k", seoTitle: "t", seoTitleAr: "t", seoDescription: "d", seoDescriptionAr: "d", variants: [{ name: "Noir", nameAr: "x" }], offers: [{ label: "1", labelAr: "x" }] };
  assert.equal(needsTranslation(done), false);
  assert.equal(needsTranslation({ ...done, seoTitle: "", seoTitleAr: "" }), true);
  assert.equal(needsTranslation({ ...done, seoDescriptionAr: "" }), true);
});
