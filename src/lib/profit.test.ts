import { test } from "node:test";
import assert from "node:assert/strict";
import { profit, spendInRange } from "./profit";

const base = { deliveredRevenue: 770_000, delivered: 10, productCost: 300_000, costUnknown: 0, parcels: 13, backParcels: 3, carrierPerParcel: 7_000, returnPerParcel: 4_000, adSpend: 200_000 };

test("profit after product, carrier, returns and ads, and the cost of one delivered order", () => {
  const p = profit(base);
  assert.equal(p.carrierCost, 91_000);
  assert.equal(p.returnCost, 12_000);
  assert.equal(p.beforeAds, 770_000 - 300_000 - 91_000 - 12_000);
  assert.equal(p.contribution, 367_000 - 200_000);
  assert.equal(p.costPerDelivered, 20_000);
  assert.deepEqual(p.missing, []);
});

test("a cost the owner did not give is not guessed", () => {
  const p = profit({ ...base, carrierPerParcel: null, adSpend: null });
  assert.equal(p.beforeAds, null);
  assert.equal(p.contribution, null);
  assert.equal(p.costPerDelivered, null);
  assert.deepEqual(p.missing, ["carrierCost", "adSpend"]);
  // Orders without a supplier cost: no profit figure either.
  assert.deepEqual(profit({ ...base, costUnknown: 2 }).missing, ["productCost"]);
  // No parcel came back: the return cost is 0 even when not given.
  assert.equal(profit({ ...base, backParcels: 0, returnPerParcel: null }).returnCost, 0);
});

test("a weekly spend counts for its days inside the period", () => {
  const week = { day: "2026-10-05", days: 7, amount: 70_000 };
  assert.equal(spendInRange(week, "2026-10-01", "2026-10-31"), 70_000);
  assert.equal(spendInRange(week, "2026-10-08", "2026-10-15"), 40_000);
  assert.equal(spendInRange(week, "2026-10-12", "2026-10-20"), 0);
  assert.equal(spendInRange({ day: "2026-10-10", days: 1, amount: 5_000 }, "2026-10-10", "2026-10-11"), 5_000);
});
