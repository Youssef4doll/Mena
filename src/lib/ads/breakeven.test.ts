import { test } from "node:test";
import assert from "node:assert/strict";
import { breakEven, levers, productBreakEvens, shippedShare, unitMargin, type UnitInput } from "./breakeven";
import { profit } from "../profit";

// A 59,900 DT lamp bought 20 DT, 8 DT delivery fee, carrier 7 DT a parcel, 3 DT for a parcel back.
const lamp: UnitInput = {
  price: 59_900,
  units: 1,
  unitCost: 20_000,
  deliveryFee: 8_000,
  carrierPerParcel: 7_000,
  returnPerParcel: 3_000,
  confirmRate: 0.72,
  deliveryRate: 0.8,
  orderRate: 0.025,
  landingRate: 0.8,
  ctr: 0.015,
  cpa: 15_000,
};

test("the ceilings of a cash-on-delivery product", () => {
  const b = breakEven(lamp);
  assert.equal(b.revenue, 67_900);
  assert.equal(b.productCost, 20_000);
  // Each delivered order carries 1/0.8 parcels sent and 0.25 parcel back: (7 + 3 × 0.2) / 0.8.
  assert.equal(b.shippingPerDelivered, 9_500);
  assert.equal(b.margin, 38_400);
  assert.equal(b.maxCostPerDelivered, 38_400);
  assert.ok(Math.abs(b.netDeliveryRate! - 0.576) < 1e-12);
  assert.equal(b.maxCpa, 22_118, "38,4 DT × 57,6 % of placed orders delivered");
  assert.equal(b.maxCostPerVisit, 553);
  assert.equal(b.maxCpc, 442);
  assert.equal(b.maxCpm, 6_636);
  assert.ok(Math.abs(b.minRoas! - 67_900 / 38_400) < 1e-12);
  assert.deepEqual(b.missing, []);
});

test("the delivery and confirmation rates under which the product loses money at today's CPA", () => {
  const b = breakEven(lamp);
  assert.ok(Math.abs(b.minDeliveryRate! - (15_000 / 0.72 + 10_000) / 50_900) < 1e-12);
  // At exactly that delivery rate, a placed order earns nothing.
  const d = b.minDeliveryRate!;
  const perPlaced = 0.72 * (d * (67_900 - 20_000) - 7_000 - 3_000 * (1 - d)) - 15_000;
  assert.ok(Math.abs(perPlaced) < 1e-6);
  assert.ok(Math.abs(b.minConfirmRate! - 15_000 / (0.8 * 47_900 - 7_000 - 600)) < 1e-12);
  // A CPA no delivery rate can carry: the required rate is above 100 %.
  assert.ok(breakEven({ ...lamp, cpa: 60_000 }).minDeliveryRate! > 1);
});

test("the unit margin is the profit of src/lib/profit.ts spread over the delivered orders", () => {
  // 8 delivered, 2 back: a delivery rate of 80 %.
  const p = profit({ deliveredRevenue: 8 * 67_900, delivered: 8, productCost: 8 * 20_000, costUnknown: 0, parcels: 10, backParcels: 2, carrierPerParcel: 7_000, returnPerParcel: 3_000, adSpend: 0 });
  assert.equal(unitMargin({ revenue: 67_900, productCost: 20_000, carrierPerParcel: 7_000, returnPerParcel: 3_000, deliveryRate: 0.8 }), p.beforeAds! / 8);
});

test("a missing cost or rate is not guessed", () => {
  const noCost = breakEven({ ...lamp, unitCost: null });
  assert.equal(noCost.margin, null);
  assert.equal(noCost.maxCpa, null);
  assert.ok(noCost.missing.includes("unitCost"));
  const noCarrier = breakEven({ ...lamp, carrierPerParcel: null });
  assert.equal(noCarrier.margin, null);
  assert.ok(noCarrier.missing.includes("carrierCost"));
  assert.ok(breakEven({ ...lamp, returnPerParcel: null }).missing.includes("returnCost"));
  // Every parcel delivered: the return cost does not matter.
  assert.equal(breakEven({ ...lamp, returnPerParcel: null, deliveryRate: 1 }).margin, 67_900 - 20_000 - 7_000);
  const noRates = breakEven({ ...lamp, confirmRate: null, orderRate: null, ctr: null, cpa: null });
  assert.equal(noRates.maxCostPerDelivered, 38_400, "the cost per delivered needs no confirmation rate");
  assert.equal(noRates.maxCpa, null);
  assert.equal(noRates.maxCpm, null);
  assert.equal(noRates.minDeliveryRate, null);
  assert.deepEqual(noRates.missing, ["confirmRate", "orderRate", "ctr", "cpa"]);
  assert.equal(breakEven({ ...lamp, deliveryRate: 0 }).margin, null, "no delivery at all: no margin to speak of");
});

test("a product that loses money before any ad has no ceiling", () => {
  // 60 DT of supplier cost: 67,9 − 60 − 9,5 leaves −1,6 DT per delivered order.
  const b = breakEven({ ...lamp, unitCost: 60_000 });
  assert.equal(b.margin, -1_600);
  assert.ok(b.margin! < 0);
  assert.equal(b.maxCostPerDelivered, 0);
  assert.equal(b.maxCpa, 0);
  assert.equal(b.minRoas, null);
});

test("per offer: a pack with free delivery, the free-delivery threshold, inactive offers left out", () => {
  const rows = productBreakEvens(
    {
      price: 59_900,
      cost: 20_000,
      offers: [
        { id: "o2", label: "2 lampes", quantity: 2, price: 99_900, freeDelivery: true },
        { id: "o3", label: "3 lampes", quantity: 3, price: 139_900, freeDelivery: false },
        { id: "old", label: "Ancienne", quantity: 2, price: 89_900, freeDelivery: false, active: false },
      ],
    },
    { deliveryFee: 8_000, freeThreshold: 120_000, carrierPerParcel: 7_000, returnPerParcel: 3_000, confirmRate: 0.72, deliveryRate: 0.8 },
  );
  assert.deepEqual(rows.map((r) => r.key), ["unit", "o2", "o3"]);
  assert.equal(rows[0].input.deliveryFee, 8_000);
  assert.equal(rows[1].input.deliveryFee, 0, "the offer includes delivery");
  assert.equal(rows[2].input.deliveryFee, 0, "over the free-delivery threshold");
  assert.equal(rows[1].result.productCost, 40_000);
  assert.equal(rows[1].result.margin, 99_900 - 40_000 - 9_500);
  assert.ok(rows[1].result.maxCpa! > rows[0].result.maxCpa!, "the pack has more room than one unit");
});

test("levers: what each change adds to the max CPA, largest first", () => {
  const l = levers(lamp);
  assert.deepEqual(l.map((x) => x.key).sort(), ["confirmRate", "deliveryRate", "price", "unitCost"]);
  for (let i = 1; i < l.length; i++) assert.ok((l[i - 1].gain ?? -Infinity) >= (l[i].gain ?? -Infinity));
  // +5 DT on the price is worth 5 DT on every delivered order: 5 × 57,6 % per placed order.
  assert.equal(l.find((x) => x.key === "price")!.gain, 2_880);
  assert.ok(l.every((x) => (x.gain ?? 0) > 0));
  assert.equal(levers({ ...lamp, unitCost: null }).find((x) => x.key === "unitCost"), undefined);
});

test("confirmed orders that never ship lower every per-order ceiling, once the measured net rate says so", () => {
  // 72 % confirmed × 80 % delivered is 57,6 %; the shop measures 51,84 %: a tenth of the confirmed orders never leave.
  const measured = { ...lamp, netDeliveryRate: 0.5184 };
  const b = breakEven(measured);
  assert.ok(Math.abs(shippedShare(measured) - 0.9) < 1e-12);
  assert.ok(Math.abs(b.netDeliveryRate! - 0.5184) < 1e-12);
  assert.equal(b.maxCostPerDelivered, 38_400, "the max per delivered order does not move");
  assert.equal(b.maxCpa, 19_907, "38,4 DT × 51,84 %, not × 57,6 %");
  // At the minimum delivery rate, a placed order earns nothing once the unshipped confirmations are counted.
  const d = b.minDeliveryRate!;
  assert.ok(Math.abs(0.72 * 0.9 * (d * 47_900 - 7_000 - 3_000 * (1 - d)) - 15_000) < 1e-6);
  assert.ok(Math.abs(b.minConfirmRate! - 15_000 / (0.9 * (0.8 * 47_900 - 7_000 - 600))) < 1e-12);
  // A measured rate above confirmation × delivery never raises a ceiling; without one they stay as they were.
  assert.equal(breakEven({ ...lamp, netDeliveryRate: 0.7 }).maxCpa, 22_118);
  assert.equal(breakEven({ ...lamp, netDeliveryRate: null }).maxCpa, 22_118);
  // A lever keeps the share shipped: 5 more points of confirmation, 77 % × 90 % × 80 %.
  assert.equal(levers(measured).find((x) => x.key === "confirmRate")!.maxCpa, 21_289);
  // From the shop's figures, through productBreakEvens.
  const [unit] = productBreakEvens({ price: 59_900, cost: 20_000 }, { deliveryFee: 8_000, freeThreshold: null, carrierPerParcel: 7_000, returnPerParcel: 3_000, confirmRate: 0.72, deliveryRate: 0.8, netDeliveryRate: 0.5184 });
  assert.equal(unit.result.maxCpa, 19_907);
});
