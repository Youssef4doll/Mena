import { test } from "node:test";
import assert from "node:assert/strict";
import { CHECKS, productQuality, type QualityInput } from "./product-quality";

const full: QualityInput = {
  nameAr: "موزّع زيوت", summary: "Brume fine.", summaryAr: "بخار رقيق.", description: "x".repeat(250), descriptionAr: "وصف", specs: "Capacité : 300 ml",
  keywords: "diffuseur", seoTitle: "Diffuseur", seoDescription: "Brume fine. Paiement à la livraison.", categoryId: "c1", cost: 20_000,
  videoUrl: "https://youtu.be/x", checkedAt: new Date(), gallery: 4, details: 2,
  offers: [{ quantity: 3, label: "Achetez 2, la 3e offerte", labelAr: "اشري 2 والثالثة هدية", active: true }],
};

test("the points add up to 100, and a complete page has them all", () => {
  assert.equal(CHECKS.reduce((s, c) => s + c.max, 0), 100);
  assert.deepEqual(productQuality(full), { score: 100, missing: [] });
});

test("a product from a supplier list: one photo, no texts, no long pictures", () => {
  const q = productQuality({ ...full, nameAr: null, summary: "", summaryAr: null, description: "", descriptionAr: null, specs: "", keywords: "", seoTitle: "", seoDescription: "", videoUrl: null, checkedAt: null, gallery: 1, details: 0, offers: [] });
  assert.equal(q.score, 5 + 0 + 0 + 6 + 0 + 0 + 0 + 5 + 0 + 0 + 5 + 0 + 5);
  assert.equal(q.missing[0].key, "details");
  assert.ok(q.missing.some((m) => m.text === "1 photo seulement (3 ou plus conseillées)"));
  assert.ok(q.missing.some((m) => m.text === "Arabe manquant : nom"));
});

test("an offer whose name contradicts its quantity costs its points", () => {
  const q = productQuality({ ...full, offers: [{ quantity: 2, label: "Achetez 2, la 3e offerte", labelAr: "الثانية", active: true }] });
  assert.equal(q.score, 95);
  assert.equal(q.missing[0].text, "1 offre dont le nom contredit la quantité");
});
