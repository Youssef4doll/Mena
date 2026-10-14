import { test } from "node:test";
import assert from "node:assert/strict";
import { discountPct, formatDay, leadOffer, offerCompareAt, offerLastDay, offersApply } from "./offer-display";

const one = { quantity: 1, price: 69_000 };
const three = { quantity: 3, price: 138_000 };

test("a pack is compared with the shop's own one-unit offer, never with another price", () => {
  assert.equal(offerCompareAt([one, three], three), 207_000);
  assert.equal(offerCompareAt([one, three], one), null);
  // The one-unit offer only strikes the product's former price, and only when it is higher.
  assert.equal(offerCompareAt([one, three], one, 99_000), 99_000);
  assert.equal(offerCompareAt([one, three], one, 60_000), null);
  // No single unit sold: there is no real price to strike through.
  assert.equal(offerCompareAt([three], three), null);
  // A pack that saves nothing shows no saving.
  assert.equal(offerCompareAt([one, { quantity: 2, price: 150_000 }], { quantity: 2, price: 150_000 }), null);
});

test("a saving is rounded down, never up", () => {
  assert.equal(discountPct(69_000, 79_000), 12);
  assert.equal(discountPct(123_900, 138_000), 10);
  assert.equal(discountPct(90, 100), 10);
  assert.equal(discountPct(100, 100), 0);
  assert.equal(discountPct(100, null), 0);
});

test("lists lead with one unit, else the smallest pack", () => {
  assert.equal(leadOffer([three, one]), one);
  assert.equal(leadOffer([three, { quantity: 2, price: 120_000 }])?.quantity, 2);
  assert.equal(leadOffer([]), null);
});

test("offers only apply when every option has the product's price", () => {
  assert.equal(offersApply(59_900, [{ price: null }, { price: 59_900 }]), true);
  assert.equal(offersApply(59_900, [{ price: null }, { price: 89_900 }]), false);
});

test("the last day is the Tunis calendar day before the offer ends", () => {
  // Saved as "last day 15 October": ends at 00:00 in Tunis on the 16th (23:00 UTC on the 15th).
  const endsAt = new Date(Date.parse("2026-10-15T00:00:00Z") + 23 * 3_600_000);
  assert.equal(offerLastDay(endsAt), "2026-10-15");
  assert.equal(formatDay("2026-10-15", "fr-FR"), "15 octobre");
});
