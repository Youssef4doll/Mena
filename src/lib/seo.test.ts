import { test } from "node:test";
import assert from "node:assert/strict";
import { SEO_DESCRIPTION_MAX, SEO_TITLE_MAX, clip, productDescription, productTitle, type SeoProduct } from "./seo";

const lamp: SeoProduct = {
  name: "Lampe de chevet tactile",
  nameAr: "لمبة سرير باللمس",
  summary: "Un toucher sur le pied pour allumer : trois intensités, une lumière chaude et douce pour lire le soir.",
  summaryAr: "تمسّ الساق تشعل: 3 درجات ضو، ضو دافي ومريح للقراية في الليل.",
  description: "",
  descriptionAr: null,
  seoTitle: "",
  seoTitleAr: null,
  seoDescription: "",
  seoDescriptionAr: null,
  price: 59_900,
  category: { name: "Maison", nameAr: "الدار" },
  offers: [],
  variants: [],
};

test("a text is cut at a word, with an ellipsis", () => {
  assert.equal(clip("Lampe de chevet tactile", 60), "Lampe de chevet tactile");
  assert.equal(clip("Lampe de chevet tactile rechargeable", 20), "Lampe de chevet…");
});

test("the title is the product's own words, then its category, like Amazon's", () => {
  assert.equal(productTitle(lamp, "fr"), "Lampe de chevet tactile — Maison");
  assert.equal(productTitle(lamp, "ar"), "لمبة سرير باللمس — الدار");
  // The shop's own title wins.
  assert.equal(productTitle({ ...lamp, seoTitle: "Lampe de chevet LED tactile rechargeable" }, "fr"), "Lampe de chevet LED tactile rechargeable");
  assert.ok(productTitle({ ...lamp, name: "x".repeat(90) }, "fr").length <= SEO_TITLE_MAX);
});

test("the description repeats the name, says the real price and how it is sold, within Google's length", () => {
  const fr = productDescription(lamp, "fr", true);
  assert.ok(fr.startsWith("Lampe de chevet tactile : Un toucher"), fr);
  assert.ok(fr.endsWith("59,900 DT. Paiement à la livraison, livraison dans toute la Tunisie."), fr);
  assert.ok(fr.length <= SEO_DESCRIPTION_MAX + 1, `${fr.length}`);
  const ar = productDescription(lamp, "ar", false);
  assert.ok(ar.includes("الدفع عند الاستلام، توصيل حتى لدارك"), ar);
  // An offer's price is the one shown.
  assert.ok(productDescription({ ...lamp, offers: [{ quantity: 1, price: 49_000 }] }, "fr", true).includes("49,000 DT"));
});
