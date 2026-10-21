import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBrief, copyWarnings, firstSentence, specLines, type Angle, type BriefInput, type BriefPerformance } from "./brief";
import { breakEven } from "./breakeven";
import { shrink } from "./stats";
import { CONFIRM_PRIOR_ORDERS, DELIVERY_PRIOR_PARCELS } from "./kpis";

const quiet: BriefPerformance = {
  days: 90, visits: 0, formStarts: 0, shopVisits: 0, shopFormStarts: 0,
  orders: 0, confirmed: 0, decided: 0, delivered: 0, back: 0, open: 0, multiUnitOrders: 0,
  refusals: [], shopRefusals: [], ads: [], searches: [],
};

// A 59,900 DT bedside lamp bought 21,500 DT, 8 DT delivery, carrier 7 DT, 3 DT for a parcel back.
const lamp: BriefInput = {
  product: {
    id: "p1", slug: "lampe-de-chevet-tactile", name: "Lampe de chevet tactile", nameAr: "لمبة متاع بيت النوم",
    summary: "Trois niveaux de lumière d'une simple touche. Rechargeable en USB-C.",
    summaryAr: "ثلاثة مستويات متاع ضو بلمسة وحدة. تتشرجا ب USB-C.",
    specs: "Dimensions : 12 x 20 cm\nMatière : bois et tissu\nAutonomie : 8 heures",
    specsAr: "القياس: 12 x 20 cm\nالمادة: عود وقماش\nالشحن يدوم: 8 سوايع",
    category: "Maison", categoryAr: "الدار",
    price: 59_900, compareAt: 69_900, cost: 21_500, hasVideo: true, photos: 5,
    variants: [{ name: "Noir", nameAr: "أكحل" }, { name: "Blanc", nameAr: "أبيض" }],
    offers: [
      { id: "o2", label: "2 lampes", labelAr: "زوز لمبات", quantity: 2, price: 99_000, freeDelivery: true, endsAt: "2026-10-31T22:00:00.000Z" },
    ],
    active: true, available: true,
  },
  shop: { deliveryFee: 8_000, freeThreshold: null, delivery: { minDays: 1, maxDays: 3 }, everywhere: true, openBeforePaying: true, returnDays: 10, carrierPerParcel: 7_000, returnPerParcel: 3_000 },
  reviews: { count: 4, average: 4.75, quotes: [{ rating: 5, text: "Très belle lumière, conforme aux photos.", authorName: "Amel B.", governorate: "Sfax" }] },
  performance: { ...quiet, visits: 640, formStarts: 70, shopVisits: 5000, shopFormStarts: 520, orders: 30, confirmed: 22, decided: 28, delivered: 15, back: 3, open: 9, multiUnitOrders: 4 },
  baseline: { confirmRate: 0.75, deliveryRate: 0.82 },
  asOf: "2026-10-19T10:00:00.000Z",
};

/** Every text an ad would carry, in both languages. */
const texts = (a: Angle) => [a.primary.fr, a.primary.ar, a.headline.fr, a.headline.ar, a.caption.fr, a.caption.ar, a.hook.text.fr, a.hook.text.ar];
const allTexts = (input: BriefInput) => {
  const b = buildBrief(input);
  return [...b.angles.flatMap(texts), ...b.hooks.flatMap((h) => [h.text.fr, h.text.ar]), b.cta.text.fr, b.cta.text.ar];
};

test("every ready-made text passes the shop's own rules, whatever the settings", () => {
  const variants: BriefInput[] = [
    lamp,
    { ...lamp, product: { ...lamp.product, offers: [], compareAt: null } },
    { ...lamp, reviews: { count: 0, average: null, quotes: [] } },
    { ...lamp, shop: { ...lamp.shop, openBeforePaying: false, deliveryFee: 0, delivery: { minDays: 0, maxDays: 0 }, everywhere: false } },
    { ...lamp, shop: { ...lamp.shop, delivery: null }, product: { ...lamp.product, summary: "", summaryAr: null, nameAr: null, specs: "", specsAr: null } },
  ];
  for (const v of variants) for (const t of allTexts(v)) assert.deepEqual(copyWarnings(t, v), [], t);
});

test("copies use the product's own facts, in derja and in French", () => {
  const b = buildBrief(lamp);
  const demo = b.angles.find((a) => a.key === "demo")!;
  assert.match(demo.primary.fr, /^Lampe de chevet tactile\. Trois niveaux de lumière d'une simple touche\./);
  assert.ok(demo.primary.fr.includes("59,900 DT au lieu de 69,900 DT."));
  assert.ok(demo.primary.fr.includes("Livraison en 1 à 3 jours ouvrés partout en Tunisie : 8,000 DT."));
  assert.ok(demo.primary.fr.includes("vous ouvrez le colis avant de payer"));
  assert.ok(demo.primary.ar.startsWith("لمبة متاع بيت النوم. ثلاثة مستويات متاع ضو بلمسة وحدة."));
  assert.ok(demo.primary.ar.includes("السوم 59,900 د.ت، قبل كان ب 69,900 د.ت."));
  assert.ok(demo.primary.ar.includes("الخلاص عند الاستلام"));
  assert.ok(demo.caption.fr.length <= 100 && demo.caption.ar.length <= 100);
  // The pack: its real price per lamp, its real end date, its free delivery.
  const offer = b.angles.find((a) => a.key === "offer")!;
  assert.match(offer.why, /49,500 DT au lieu de 59,900 DT/);
  assert.ok(offer.primary.fr.startsWith("Lampe de chevet tactile : 2 lampes, 99,000 DT, livraison offerte, jusqu'au 31/10."));
  assert.ok(offer.primary.ar.startsWith("لمبة متاع بيت النوم: زوز لمبات ب 99,000 د.ت، التوصيل بلاش، حتى 31/10."));
  assert.match(offer.caution ?? "", /31\/10/);
  // Sizes and choices become hooks; the supplier cost never appears.
  assert.ok(b.hooks.some((h) => h.text.fr === "Dimensions : 12 x 20 cm" && h.text.ar === "القياس: 12 x 20 cm"));
  assert.ok(b.hooks.some((h) => h.text.ar === "متوفّر في: أكحل، أبيض"));
  assert.ok(!JSON.stringify(b).includes("21,500"));
});

test("a testimonial only with a real review, quoted word for word", () => {
  const b = buildBrief(lamp);
  const t = b.angles.find((a) => a.key === "testimonial")!;
  assert.ok(t.primary.fr.startsWith("« Très belle lumière, conforme aux photos. » Amel B., Sfax"));
  assert.ok(t.primary.fr.includes("4,8/5 sur 4 avis de clients livrés."));
  const none = buildBrief({ ...lamp, reviews: { count: 0, average: null, quotes: [] } });
  assert.ok(!none.angles.some((a) => a.key === "testimonial"));
  assert.ok(none.missing.some((m) => /Aucun avis/.test(m)));
  assert.ok(none.compliance.some((c) => /Aucun avis publié/.test(c)));
});

test("no promise the settings do not make", () => {
  const closed = { ...lamp, shop: { ...lamp.shop, openBeforePaying: false } };
  for (const t of allTexts(closed)) assert.ok(!/avant de payer|قبل ما تخلّص/.test(t), t);
  assert.ok(buildBrief(closed).compliance.some((c) => /« Ouvrir avant de payer » : non/.test(c)));
  // No previous price, no struck-through price.
  const plain = buildBrief({ ...lamp, product: { ...lamp.product, compareAt: null, offers: [] } });
  assert.ok(!plain.angles.some((a) => /au lieu de/.test(a.primary.fr)));
  assert.equal(plain.angles.find((a) => a.key === "offer")!.title, "Prix et paiement à la livraison");
  // A problem angle needs the product's own description.
  assert.ok(!buildBrief({ ...lamp, product: { ...lamp.product, summary: "", summaryAr: null } }).angles.some((a) => a.key === "problem"));
});

test("an offer past its end date is no longer used", () => {
  const ended = buildBrief({ ...lamp, asOf: "2026-11-02T10:00:00.000Z" });
  const offer = ended.angles.find((a) => a.key === "offer")!;
  assert.equal(offer.title, "Prix");
  assert.ok(!JSON.stringify(ended.angles).includes("99,000"));
  assert.ok(ended.compliance[0].includes("Aucune offre de ce produit n'a de date de fin"));
});

test("low confirmation, proven by the counts, puts the price-led angles first", () => {
  const b = buildBrief({ ...lamp, performance: { ...lamp.performance, confirmed: 18, decided: 40, orders: 45 } });
  const f = b.focus.find((x) => x.key === "confirmation")!;
  assert.match(f.evidence, /18 confirmées sur 40 \(45 %\) contre 75 % pour la boutique/);
  assert.equal(b.angles[0].key, "offer");
  assert.equal(b.angles[0].boost, f.title);
});

test("refusals put the unboxing first, with the first reason typed", () => {
  const b = buildBrief({ ...lamp, performance: { ...lamp.performance, delivered: 12, back: 10, refusals: [{ reason: "Plus petit que prévu", count: 6 }] } });
  const f = b.focus.find((x) => x.key === "delivery")!;
  assert.match(f.evidence, /10 colis revenus sur 22/);
  assert.match(f.evidence, /« Plus petit que prévu » \(6\)/);
  assert.equal(b.angles[0].key, "unboxing");
});

test("small numbers judge nothing", () => {
  const b = buildBrief({ ...lamp, performance: { ...quiet, visits: 40, formStarts: 1, shopVisits: 5000, shopFormStarts: 520, orders: 5, confirmed: 1, decided: 5, delivered: 0, back: 3 } });
  assert.deepEqual(b.focus.map((f) => f.key), []);
  assert.equal(b.angles[0].key, "demo");
  const fresh = buildBrief({ ...lamp, performance: quiet });
  assert.deepEqual(fresh.focus.map((f) => f.key), ["new"]);
});

test("the page and packs: read against the whole shop", () => {
  const b = buildBrief({ ...lamp, performance: { ...lamp.performance, visits: 900, formStarts: 40, orders: 30, multiUnitOrders: 12 } });
  assert.match(b.focus.find((f) => f.key === "page")!.evidence, /40 formulaires commencés pour 900 visites de la fiche \(4,4 %\), contre 10 % sur l'ensemble des fiches/);
  assert.equal(b.focus.find((f) => f.key === "pack")!.action, "Mettez le pack en avant dans la publicité.");
});

test("the control ad has enough visits, not the luckiest small one", () => {
  const ads = [
    { source: "facebook", campaign: "lampe-oct", ad: "lampe-demo-v1", visits: 300, orders: 12, confirmed: 9, delivered: 6, back: 1 },
    { source: "facebook", campaign: "lampe-oct", ad: "lampe-gift-v1", visits: 20, orders: 3, confirmed: 2, delivered: 1, back: 0 },
  ];
  const b = buildBrief({ ...lamp, performance: { ...lamp.performance, ads } });
  assert.match(b.focus.find((f) => f.key === "control")!.evidence, /« lampe-demo-v1 » : 12 commandes pour 300 visites/);
  assert.match(b.tests[0], /^Témoin : « lampe-demo-v1 »/);
});

test("ceilings from the product's rates pulled toward the shop's, labelled as an estimate", () => {
  const b = buildBrief(lamp);
  const c = shrink(22, 28, 0.75, CONFIRM_PRIOR_ORDERS)!;
  const d = shrink(15, 18, 0.82, DELIVERY_PRIOR_PARCELS)!;
  const expected = breakEven({ price: 59_900, units: 1, unitCost: 21_500, deliveryFee: 8_000, carrierPerParcel: 7_000, returnPerParcel: 3_000, confirmRate: c, deliveryRate: d });
  assert.equal(b.ceilings.rows[0].maxCostPerDelivered, expected.maxCostPerDelivered);
  assert.equal(b.ceilings.rows[0].maxCpa, expected.maxCpa);
  assert.equal(b.ceilings.rows[1].label, "2 lampes");
  assert.ok(b.tests.some((t) => t.includes("estimation")));
  const noCost = buildBrief({ ...lamp, product: { ...lamp.product, cost: null }, shop: { ...lamp.shop, carrierPerParcel: null } });
  assert.deepEqual(noCost.ceilings.missing, ["le coût fournisseur du produit (sa fiche, dans Produits)", "le coût du transporteur par colis (Paramètres, carte « Livraison »)"]);
  assert.ok(noCost.tests.some((t) => t.startsWith("Plafond de coût inconnu")));
});

test("the pack that leaves the most is pushed; a 1-unit offer at the unit price is the unit itself", () => {
  const offers = [
    { id: "o1", label: "1 unité", labelAr: "حبة وحدة", quantity: 1, price: 59_900, freeDelivery: false, endsAt: null },
    { id: "o2", label: "2 unités", labelAr: "زوز حبات", quantity: 2, price: 107_900, freeDelivery: false, endsAt: null },
    { id: "o3", label: "Achetez 2, la 3e offerte", labelAr: "اشري 2 والثالثة هدية", quantity: 3, price: 119_800, freeDelivery: true, endsAt: null },
  ];
  const known = buildBrief({ ...lamp, product: { ...lamp.product, offers, cost: 27_000 } });
  assert.deepEqual(known.ceilings.rows.map((r) => r.label), ["1 article", "2 unités", "Achetez 2, la 3e offerte"]);
  assert.ok(known.angles.find((a) => a.key === "offer")!.primary.fr.startsWith("Lampe de chevet tactile : 2 unités, 107,900 DT."));
  assert.ok(known.tests.some((t) => /^Le pack « 2 unités » laisse .* c'est l'offre à mettre en avant\.$/.test(t)));
  // Without the supplier cost, the lowest price per unit.
  const unknown = buildBrief({ ...lamp, product: { ...lamp.product, offers, cost: null } });
  assert.match(unknown.angles.find((a) => a.key === "offer")!.title, /Offre/);
  assert.ok(unknown.angles.find((a) => a.key === "offer")!.primary.fr.includes("Achetez 2, la 3e offerte, 119,800 DT, livraison offerte."));
});

test("a long summary is shortened after the name, never cut at the name", () => {
  const long = { ...lamp, product: { ...lamp.product, summary: "Un toucher sur le pied pour allumer : trois intensités, une lumière chaude et douce pour lire le soir sans éblouir personne dans la chambre." } };
  const first = buildBrief(long).angles.find((a) => a.key === "demo")!.primary.fr.split("\n")[0];
  assert.ok(first.startsWith("Lampe de chevet tactile. Un toucher sur le pied pour allumer"), first);
  assert.ok(first.length <= 125 && first.endsWith("…"), first);
});

test("ad names are cleaned, unique, and say the angle", () => {
  const names = buildBrief(lamp).angles.map((a) => a.adName);
  assert.equal(new Set(names).size, names.length);
  assert.ok(names.includes("lampe-de-demo-v1"));
  assert.ok(names.includes("lampe-de-avant-apres-v1"));
  for (const n of names) assert.match(n, /^[a-z0-9-]+$/);
});

test("same input, same brief", () => {
  assert.deepEqual(buildBrief(lamp), buildBrief(structuredClone(lamp)));
});

test("copyWarnings catches what an ad must not say", () => {
  const w = (t: string, i: BriefInput = lamp) => copyWarnings(t, i);
  assert.deepEqual(w("Stock limité !"), ["Point d'exclamation : la boutique n'en met pas.", "Urgence ou rareté que rien ne prouve."]);
  assert.deepEqual(w("Seulement 49,900 DT"), ["Montant absent de la fiche et de Paramètres, carte « Livraison » : 49,900 DT."]);
  assert.deepEqual(w("59,900 DT, 99,000 د.ت les deux, livraison 8,000 DT, 49,500 DT la lampe"), []);
  assert.deepEqual(w("Livré en 24h"), ["Délai plus court que celui de Paramètres, carte « Livraison »."]);
  assert.deepEqual(w("Perte de poids garantie"), ["Promesse de santé ou de résultat : refusée par Meta et TikTok."]);
  assert.deepEqual(w("Finitions soignées"), []);
  const strict = { ...lamp, shop: { ...lamp.shop, openBeforePaying: false }, product: { ...lamp.product, offers: [] } };
  assert.deepEqual(w("Livraison gratuite, ouvrez avant de payer", strict), ["« Gratuit » ou « offert » sans offre réelle.", "« Ouvrir avant de payer » alors que ce n'est pas coché dans Paramètres, carte « Livraison »."]);
  assert.deepEqual(w("التوصيل بلاش", strict), ["« Gratuit » ou « offert » sans offre réelle."]);
  assert.deepEqual(w("-30 % aujourd'hui"), ["Pourcentage que la fiche ne donne pas."]);
});

test("counts of one read in the singular, and the settings are named where they are typed", () => {
  // One confirmed order out of 20 called, one parcel back, one photo, one day.
  const one = buildBrief({ ...lamp, product: { ...lamp.product, photos: 1 }, performance: { ...lamp.performance, days: 1, confirmed: 1, decided: 20, delivered: 1, back: 14 } });
  const confirm = one.focus.find((f) => f.key === "confirmation")!;
  assert.match(confirm.evidence, /^1 confirmée sur 20 \(5 %\) contre 75 % pour la boutique, sur 1 jour\.$/);
  assert.match(one.focus.find((f) => f.key === "delivery")!.evidence, /^14 colis revenus sur 15/);
  assert.ok(one.assets.includes("1 photo sur la fiche : filmez ou photographiez le produit avant de lancer."));
  const strict = buildBrief({ ...lamp, shop: { ...lamp.shop, openBeforePaying: false } });
  assert.ok(strict.compliance.some((c) => c.includes("Paramètres, carte « Livraison »")));
  const texts = [...one.focus.flatMap((f) => [f.evidence, f.action]), ...one.tests, ...one.missing, ...one.assets, ...strict.compliance];
  for (const t of texts) assert.doesNotMatch(t, /\(s\)|\b1 (commandes|livrées|visites|jours|confirmées|recherches)\b|Réglages|rubrique/, t);
});

test("text helpers", () => {
  assert.equal(firstSentence("Une phrase. Une autre."), "Une phrase.");
  assert.equal(firstSentence("mot ".repeat(50), 20), "mot mot mot mot…");
  assert.deepEqual(specLines("Matière : inox\nsans deux-points\nالمادة: عود"), [{ label: "Matière", value: "inox" }, { label: "المادة", value: "عود" }]);
});
