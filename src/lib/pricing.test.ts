import { test } from "node:test";
import assert from "node:assert/strict";
import { priceCart, type CatalogProduct } from "./pricing";
import { DEFAULT_SETTINGS } from "./settings-schema";

const zones = DEFAULT_SETTINGS.delivery.zones;
const now = new Date("2026-10-12T10:00:00Z");

function product(over: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    id: "p1", slug: "lampe", name: "Lampe", nameAr: null, price: 49_900, cost: 20_000, active: true,
    stockMode: "SUPPLIER", stockQty: 0, available: true, imageId: null, variants: [], ...over,
  };
}
const base = { governorate: null, zones, deliveryFee: DEFAULT_SETTINGS.delivery.fee, freeThreshold: null, promo: null, phoneAlreadyUsedPromo: false, now };

test("prices from the catalog, not from the request", () => {
  const catalog = new Map([["p1", product()]]);
  // A tampered request can only send ids and quantities; there is no price field to lie in.
  const q = priceCart({ ...base, catalog, lines: [{ productId: "p1", qty: 2, price: 1 } as never] });
  assert.equal(q.subtotal, 99_800);
  // One fee everywhere: delivery is in the total before the governorate is chosen.
  assert.equal(q.total, 107_800);
  assert.equal(q.costTotal, 40_000);
});

test("one delivery fee for every governorate; the delay comes from the governorate", () => {
  const catalog = new Map([["p1", product()]]);
  const tunis = priceCart({ ...base, catalog, lines: [{ productId: "p1", qty: 1 }], governorate: "Tunis" });
  const sfax = priceCart({ ...base, catalog, lines: [{ productId: "p1", qty: 1 }], governorate: "Sfax" });
  assert.equal(tunis.deliveryFee, 8_000);
  assert.equal(sfax.deliveryFee, 8_000);
  assert.deepEqual(tunis.delivery, { minDays: 1, maxDays: 2, fee: 8_000, free: false });
  const changed = priceCart({ ...base, deliveryFee: 6_500, catalog, lines: [{ productId: "p1", qty: 1 }], governorate: "Sfax" });
  assert.equal(changed.total, 56_400);
  assert.equal(sfax.total, 57_900);
  assert.deepEqual(sfax.delivery, { minDays: 2, maxDays: 3, fee: 8_000, free: false });
});

test("a disabled governorate is reported, not silently charged", () => {
  const catalog = new Map([["p1", product()]]);
  const z = { ...zones, Tozeur: { ...zones.Tozeur, enabled: false } };
  const q = priceCart({ ...base, catalog, zones: z, lines: [{ productId: "p1", qty: 1 }], governorate: "Tozeur" });
  assert.equal(q.deliveryUnavailable, true);
  assert.equal(q.delivery, null);
});

test("free delivery threshold applies after discount", () => {
  const catalog = new Map([["p1", product()]]);
  const q = priceCart({ ...base, catalog, freeThreshold: 100_000, lines: [{ productId: "p1", qty: 2 }], governorate: "Tunis" });
  assert.equal(q.deliveryFee, 8_000);
  assert.equal(q.freeDeliveryRemaining, 200);
  const q3 = priceCart({ ...base, catalog, freeThreshold: 100_000, lines: [{ productId: "p1", qty: 3 }], governorate: "Tunis" });
  assert.equal(q3.deliveryFee, 0);
  assert.equal(q3.delivery?.free, true);
  assert.equal(q3.freeDeliveryRemaining, null);
});

test("tracked stock caps the quantity", () => {
  const catalog = new Map([["p1", product({ stockMode: "TRACKED", stockQty: 2 })]]);
  const q = priceCart({ ...base, catalog, lines: [{ productId: "p1", qty: 5 }] });
  assert.equal(q.lines[0].qty, 2);
  assert.deepEqual(q.problems, [{ productId: "p1", variantId: null, offerId: null, kind: "qty_reduced", available: 2 }]);
});

test("unavailable, inactive, unknown and invalid lines are dropped", () => {
  const catalog = new Map([
    ["p1", product({ available: false })],
    ["p2", product({ id: "p2", active: false })],
    ["p3", product({ id: "p3", stockMode: "TRACKED", stockQty: 0 })],
  ]);
  const q = priceCart({
    ...base, catalog,
    lines: [{ productId: "p1", qty: 1 }, { productId: "p2", qty: 1 }, { productId: "p3", qty: 1 }, { productId: "nope", qty: 1 }, { productId: "p1", qty: -3 }, { productId: "p1", qty: 1.5 }],
  });
  assert.equal(q.lines.length, 0);
  assert.equal(q.total, 0);
  assert.deepEqual(q.problems.map((p) => p.kind), ["unavailable", "not_found", "unavailable", "not_found"]);
});

test("variants: required, priced, and stocked on their own", () => {
  const catalog = new Map([["p1", product({
    stockMode: "TRACKED",
    variants: [
      { id: "v1", name: "Noir", price: null, stockQty: 3, available: true },
      { id: "v2", name: "Or", price: 59_900, stockQty: 0, available: true },
    ],
  })]]);
  assert.equal(priceCart({ ...base, catalog, lines: [{ productId: "p1", qty: 1 }] }).problems[0].kind, "variant_required");
  const q = priceCart({ ...base, catalog, lines: [{ productId: "p1", variantId: "v1", qty: 1 }, { productId: "p1", variantId: "v2", qty: 1 }] });
  assert.equal(q.lines.length, 1);
  assert.equal(q.lines[0].unitPrice, 49_900);
  assert.equal(q.problems[0].kind, "unavailable");
});

test("quantity is capped at 10 per line even for supplier stock, and duplicates merge", () => {
  const catalog = new Map([["p1", product()]]);
  const q = priceCart({ ...base, catalog, lines: [{ productId: "p1", qty: 8 }, { productId: "p1", qty: 8 }] });
  assert.equal(q.lines.length, 1);
  assert.equal(q.lines[0].qty, 10);
});

test("promo codes", () => {
  const catalog = new Map([["p1", product()]]);
  const promo = { code: "BIENVENUE", kind: "PERCENT" as const, value: 10, minSubtotal: 0, maxUses: null, usedCount: 0, oncePerPhone: true, startsAt: null, endsAt: null, active: true };
  const q = priceCart({ ...base, catalog, promo, lines: [{ productId: "p1", qty: 1 }], governorate: "Tunis" });
  assert.equal(q.discount, 4_900); // 4 990 rounded down to 100 millimes
  assert.equal(q.total, 49_900 - 4_900 + 8_000);

  const used = priceCart({ ...base, catalog, promo, phoneAlreadyUsedPromo: true, lines: [{ productId: "p1", qty: 1 }] });
  assert.equal(used.discount, 0);
  assert.deepEqual(used.promo?.result, { ok: false, reason: "already_used" });

  const fixed = priceCart({ ...base, catalog, promo: { ...promo, kind: "FIXED", value: 999_000 }, lines: [{ productId: "p1", qty: 1 }] });
  assert.equal(fixed.discount, 49_900); // never below zero

  const free = priceCart({ ...base, catalog, promo: { ...promo, kind: "FREE_DELIVERY" }, lines: [{ productId: "p1", qty: 1 }], governorate: "Sfax" });
  assert.equal(free.deliveryFee, 0);

  const expired = priceCart({ ...base, catalog, promo: { ...promo, endsAt: new Date("2026-01-01") }, lines: [{ productId: "p1", qty: 1 }] });
  assert.deepEqual(expired.promo?.result, { ok: false, reason: "expired" });

  const min = priceCart({ ...base, catalog, promo: { ...promo, minSubtotal: 100_000 }, lines: [{ productId: "p1", qty: 1 }] });
  assert.deepEqual(min.promo?.result, { ok: false, reason: "min_subtotal" });

  const usedUp = priceCart({ ...base, catalog, promo: { ...promo, maxUses: 5, usedCount: 5 }, lines: [{ productId: "p1", qty: 1 }] });
  assert.deepEqual(usedUp.promo?.result, { ok: false, reason: "used_up" });
});

test("unknown cost leaves the margin unknown rather than wrong", () => {
  const catalog = new Map([["p1", product({ cost: null })]]);
  assert.equal(priceCart({ ...base, catalog, lines: [{ productId: "p1", qty: 1 }] }).costTotal, null);
});

const offers = [
  { id: "o1", label: "1 unité", labelAr: null, quantity: 1, price: 49_000, freeDelivery: false, active: true, endsAt: null },
  { id: "o3", label: "2 + 1 offert", labelAr: null, quantity: 3, price: 99_000, freeDelivery: true, active: true, endsAt: null },
  { id: "old", label: "Fini", labelAr: null, quantity: 2, price: 1_000, freeDelivery: false, active: true, endsAt: new Date("2026-10-01") },
  { id: "off", label: "Éteinte", labelAr: null, quantity: 2, price: 1_000, freeDelivery: false, active: false, endsAt: null },
];

test("an offer sets the quantity and the price, whatever the request says", () => {
  const catalog = new Map([["p1", product({ offers })]]);
  const q = priceCart({ ...base, catalog, lines: [{ productId: "p1", offerId: "o3", qty: 9 }], governorate: "Sfax" });
  assert.equal(q.lines[0].qty, 3);
  assert.equal(q.lines[0].lineTotal, 99_000);
  assert.equal(q.lines[0].unitPrice, 33_000);
  assert.equal(q.lines[0].offerLabel, "2 + 1 offert");
  assert.equal(q.subtotal, 99_000);
  assert.equal(q.costTotal, 60_000);
  // The offer includes delivery.
  assert.equal(q.deliveryFee, 0);
  assert.equal(q.delivery?.free, true);
  assert.equal(q.total, 99_000);
});

test("ended, switched-off and unknown offers are refused, not repriced", () => {
  const catalog = new Map([["p1", product({ offers })]]);
  for (const offerId of ["old", "off", "nope"]) {
    const q = priceCart({ ...base, catalog, lines: [{ productId: "p1", offerId, qty: 1 }] });
    assert.equal(q.lines.length, 0, offerId);
    assert.equal(q.problems[0].kind, "offer_unavailable", offerId);
  }
});

test("an offer needs its whole quantity in stock", () => {
  const catalog = new Map([["p1", product({ offers, stockMode: "TRACKED", stockQty: 2 })]]);
  const q = priceCart({ ...base, catalog, lines: [{ productId: "p1", offerId: "o3", qty: 1 }] });
  assert.equal(q.lines.length, 0);
  assert.equal(q.problems[0].kind, "unavailable");
  const ok = priceCart({ ...base, catalog, lines: [{ productId: "p1", offerId: "o1", qty: 1 }] });
  assert.equal(ok.lines[0].qty, 1);
});

test("an offer is taken once even if sent twice", () => {
  const catalog = new Map([["p1", product({ offers })]]);
  const q = priceCart({ ...base, catalog, lines: [{ productId: "p1", offerId: "o3", qty: 1 }, { productId: "p1", offerId: "o3", qty: 1 }] });
  assert.equal(q.lines.length, 1);
  assert.equal(q.subtotal, 99_000);
});

test("an offer on a product with variants still needs the variant", () => {
  const catalog = new Map([["p1", product({ offers, variants: [{ id: "v1", name: "Noir", price: null, stockQty: 0, available: true }] })]]);
  assert.equal(priceCart({ ...base, catalog, lines: [{ productId: "p1", offerId: "o3", qty: 1 }] }).problems[0].kind, "variant_required");
  const q = priceCart({ ...base, catalog, lines: [{ productId: "p1", variantId: "v1", offerId: "o3", qty: 1 }] });
  assert.equal(q.lines[0].variantName, "Noir");
  assert.equal(q.lines[0].lineTotal, 99_000);
});

test("an offer is refused on an option that has its own price", () => {
  const variants = [
    { id: "small", name: "Petit", price: null, stockQty: 0, available: true },
    { id: "big", name: "Grand", price: 89_900, stockQty: 0, available: true },
  ];
  const catalog = new Map([["p1", product({ offers, variants })]]);
  const q = priceCart({ ...base, catalog, lines: [{ productId: "p1", variantId: "big", offerId: "o1", qty: 1 }] });
  assert.equal(q.lines.length, 0);
  assert.equal(q.problems[0].kind, "offer_unavailable");
  const ok = priceCart({ ...base, catalog, lines: [{ productId: "p1", variantId: "small", offerId: "o1", qty: 1 }] });
  assert.equal(ok.lines.length, 1);
});

test("an offer larger than the stock says how many are left", () => {
  const catalog = new Map([["p1", product({ offers, stockMode: "TRACKED", stockQty: 2 })]]);
  const q = priceCart({ ...base, catalog, lines: [{ productId: "p1", offerId: "o3", qty: 1 }] });
  assert.deepEqual(q.problems[0], { productId: "p1", variantId: null, offerId: "o3", kind: "unavailable", available: 2 });
});

test("two lines of the same product share its counted stock", () => {
  const catalog = new Map([["p1", product({ offers, stockMode: "TRACKED", stockQty: 4 })]]);
  // A 3-pack and 2 more by the unit: 5 asked, 4 in stock. The pack is served, the units are cut to 1.
  const q = priceCart({ ...base, catalog, lines: [{ productId: "p1", offerId: "o3", qty: 1 }, { productId: "p1", qty: 2 }] });
  assert.equal(q.lines.reduce((n, l) => n + l.qty, 0), 4);
  assert.deepEqual(q.problems, [{ productId: "p1", variantId: null, offerId: null, kind: "qty_reduced", available: 1 }]);
  // The other way round, the pack no longer fits and says so, for that line.
  const r = priceCart({ ...base, catalog, lines: [{ productId: "p1", qty: 2 }, { productId: "p1", offerId: "o3", qty: 1 }] });
  assert.equal(r.lines.length, 1);
  assert.deepEqual(r.problems, [{ productId: "p1", variantId: null, offerId: "o3", kind: "unavailable", available: 2 }]);
  // Supplier stock is not counted: both lines go through.
  const s = priceCart({ ...base, catalog: new Map([["p1", product({ offers })]]), lines: [{ productId: "p1", offerId: "o3", qty: 1 }, { productId: "p1", qty: 2 }] });
  assert.equal(s.problems.length, 0);
});
