import { test } from "node:test";
import assert from "node:assert/strict";
import type { BriefInput } from "./brief";
import { Concept, IDEAS_SCHEMA, conceptWarnings, ideaCount, ideasFacts, ideasRequest, ideasTask, readIdeasReply, type IdeaConcept } from "./ideas-prompt";

const input: BriefInput = {
  product: {
    id: "p1", slug: "mixeur-portable", name: "Mixeur portable", nameAr: "ميكسور صغير",
    summary: "Des jus et des smoothies partout. Rechargeable en USB.", summaryAr: "عصير وسموذي وين ما تكون. يتشرجا ب USB.",
    specs: "Capacité : 380 ml\nMatière : plastique sans BPA", specsAr: "السعة: 380 ml\nالمادة: بلاستيك بلا BPA",
    category: "Cuisine", categoryAr: "الكوجينة",
    price: 49_900, compareAt: null, cost: 23_456, hasVideo: false, photos: 4,
    variants: [], offers: [{ id: "o2", label: "2 mixeurs", labelAr: null, quantity: 2, price: 89_000, freeDelivery: false, endsAt: null }],
    active: true, available: true,
  },
  shop: { deliveryFee: 8_000, freeThreshold: 150_000, delivery: { minDays: 1, maxDays: 3 }, everywhere: true, openBeforePaying: true, returnDays: 10, carrierPerParcel: 7_000, returnPerParcel: 3_000 },
  reviews: { count: 2, average: 5, quotes: [{ rating: 5, text: "Pratique pour le bureau.", authorName: "Sami K.", governorate: "Tunis" }] },
  performance: {
    days: 90, visits: 820, formStarts: 30, shopVisits: 5000, shopFormStarts: 520, orders: 26, confirmed: 20, decided: 24, delivered: 14, back: 2, open: 6, multiUnitOrders: 3,
    refusals: [{ reason: "Injoignable", count: 2 }], shopRefusals: [{ reason: "Injoignable", count: 9 }],
    ads: [{ source: "facebook", campaign: "mixeur-oct", ad: "mixeur-demo-v1", visits: 410, orders: 14, confirmed: 11, delivered: 8, back: 1 }],
    searches: [{ q: "blender", count: 5 }],
  },
  baseline: { confirmRate: 0.74, deliveryRate: 0.83 },
  asOf: "2026-10-19T10:00:00.000Z",
};

const concept: IdeaConcept = {
  title: "Jus au bureau",
  angle: "demo",
  format: "video",
  hookVisual: "Le mixeur tourne dans la main, au bureau.",
  hookTextAr: "عصير في 30 ثانية",
  hookTextFr: "Un jus en 30 secondes",
  beats: [
    { time: "0-3 s", shot: "Le mixeur en marche", onScreenAr: "ميكسور صغير", onScreenFr: "Mixeur portable", voiceAr: "" },
    { time: "20-30 s", shot: "Prix et livraison", onScreenAr: "49,900 د.ت · الخلاص عند الاستلام", onScreenFr: "49,900 DT · paiement à la livraison", voiceAr: "اطلب توّا" },
  ],
  primaryTextAr: "ميكسور صغير. عصير وسموذي وين ما تكون.\nالسوم 49,900 د.ت.",
  primaryTextFr: "Mixeur portable. Des jus et des smoothies partout.\n49,900 DT.",
  headlineAr: "ميكسور صغير · 49,900 د.ت",
  headlineFr: "Mixeur portable · 49,900 DT",
  cta: "Commander",
  why: "La démonstration montre l'usage réel.",
  measure: "Taux d'accroche et coût par commande livrée.",
  adName: "Mixeur Demo V2",
};

test("one request with the rules, the facts, the numbers and the exact format", () => {
  const r = ideasRequest(input, 3);
  assert.ok(r.includes("Write 3 ad concepts"));
  assert.ok(r.includes("Tunisian Arabic (derja)"));
  assert.ok(r.includes("No fake scarcity"));
  assert.ok(r.includes('"price": "49,900 DT"'));
  assert.ok(r.includes('"pricePerUnit": "44,500 DT"'));
  assert.ok(r.includes('"words": "blender"'));
  assert.ok(r.includes('"ad": "mixeur-demo-v1"'));
  assert.ok(r.includes('starting with "mixeur-portable-"'));
  assert.ok(r.includes('{"concepts":[{"title":""'));
  // The supplier cost stays in the shop; only the ceilings it gives are shown, as an estimate.
  assert.ok(!r.includes("23,456") && !r.includes("23456"));
  assert.ok(r.includes('"maxAdCostPerDeliveredOrder"'));
});

test("the facts carry real numbers only, and nothing when there is none", () => {
  const f = ideasFacts(input);
  assert.equal(f.product.previousPrice, null);
  assert.equal(f.results.confirmationRate, Math.round((20 / 24) * 1000) / 1000);
  assert.equal(f.results.deliveryRate, Math.round((14 / 16) * 1000) / 1000);
  assert.equal(f.shop.freeDeliveryFrom, "150,000 DT");
  const empty = ideasFacts({ ...input, performance: { ...input.performance, visits: 0, formStarts: 0, decided: 0, confirmed: 0, delivered: 0, back: 0 } });
  assert.equal(empty.results.formStartRate, null);
  assert.equal(empty.results.confirmationRate, null);
  assert.equal(empty.results.deliveryRate, null);
});

test("the task puts what the data says first", () => {
  const t = ideasTask(input, 4);
  assert.ok(t.includes('"focus"'));
  assert.ok(t.includes("Publicité témoin"));
  assert.ok(t.indexOf("How to choose them") < t.indexOf("Product facts and numbers"));
});

test("reads the reply with text and code fences around, and names each ad", () => {
  const second = { ...concept, angle: "nouveau", adName: "" };
  const reply = `Voici les concepts :\n\`\`\`json\n${JSON.stringify({ concepts: [concept, concept, second] })}\n\`\`\`\nBonne chance.`;
  const list = readIdeasReply(reply, input)!;
  assert.equal(list.length, 3);
  assert.deepEqual(list.map((c) => c.adName), ["mixeur-demo-v2", "mixeur-demo-v2-2", "mixeur-portable-other-v3"]);
  assert.equal(list[2].angle, "other");
  assert.equal(readIdeasReply(reply, input, 2)!.length, 2);
});

test("reads a bare list of concepts too", () => {
  assert.equal(readIdeasReply(`[${JSON.stringify(concept)}]`, input)?.length, 1);
});

test("refuses a cut, empty or incomplete reply", () => {
  const full = JSON.stringify({ concepts: [concept] });
  assert.equal(readIdeasReply(full.slice(0, 200), input), null);
  assert.equal(readIdeasReply("", input), null);
  assert.equal(readIdeasReply(JSON.stringify({ concepts: [] }), input), null);
  assert.equal(readIdeasReply(JSON.stringify({ concepts: [{ title: "x" }] }), input), null);
});

test("flags a concept that says what the product page does not", () => {
  assert.deepEqual(conceptWarnings(concept, input), []);
  const bad = { ...concept, primaryTextFr: "Stock limité, 39,900 DT seulement !", beats: [{ ...concept.beats[0], voiceAr: "آخر حبّات" }] };
  assert.deepEqual(conceptWarnings(bad, input), ["Point d'exclamation : la boutique n'en met pas.", "Urgence ou rareté que rien ne prouve.", "Montant absent de la fiche et des réglages : 39,900 DT."]);
});

test("the API schema and the reader agree on every field", () => {
  const item = IDEAS_SCHEMA.properties.concepts.items;
  assert.deepEqual(Object.keys(item.properties).sort(), Object.keys(Concept.shape).sort());
  assert.deepEqual([...item.required].sort(), Object.keys(Concept.shape).sort());
  assert.equal(item.additionalProperties, false);
  assert.equal(item.properties.beats.items.additionalProperties, false);
  assert.equal(IDEAS_SCHEMA.additionalProperties, false);
});

test("concept counts stay between 1 and 8", () => {
  assert.equal(ideaCount(0), 1);
  assert.equal(ideaCount(20), 8);
  assert.equal(ideaCount("3"), 3);
  assert.equal(ideaCount("trois"), 4);
});
