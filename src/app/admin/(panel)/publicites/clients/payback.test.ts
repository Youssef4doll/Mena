import { test } from "node:test";
import assert from "node:assert/strict";
import { PAYBACK_MIN_CUSTOMERS, payback, type LtvInput } from "./payback";

const ltv = (m30: [number, number, number], m60: [number, number, number], m90: [number, number, number]): LtvInput[] => [
  { days: 30, customers: m30[0], deliveredOrders: m30[1], revenue: m30[2] },
  { days: 60, customers: m60[0], deliveredOrders: m60[1], revenue: m60[2] },
  { days: 90, customers: m90[0], deliveredOrders: m90[1], revenue: m90[2] },
];

test("spend per new customer against the margin of their delivered orders, paid back at the first horizon that covers it", () => {
  // 40 customers for 400 DT of ads: 10 DT each. Margin 12 DT per delivered order.
  const r = payback({ customers: 40, ltv: ltv([30, 21, 1_400_000], [20, 18, 1_200_000], [12, 14, 900_000]) }, 400_000, 12_000);
  assert.equal(r.costPerCustomer, 10_000);
  const [d30, d60, d90] = r.points;
  // 21 delivered for 30 customers: 0.7 × 12 DT = 8.4 DT, under 10 DT.
  assert.equal(d30.marginPerCustomer, 8_400);
  assert.ok(Math.abs((d30.ratio ?? 0) - 0.84) < 1e-9);
  assert.equal(d30.revenuePerCustomer, 46_667);
  // 18 for 20: 10.8 DT, over 10 DT.
  assert.equal(d60.marginPerCustomer, 10_800);
  assert.equal(r.paidBackAt, 60);
  assert.equal(d90.enough, true);
});

test("a horizon with too few customers is shown but never says paid back", () => {
  const few = PAYBACK_MIN_CUSTOMERS - 1;
  const r = payback({ customers: 50, ltv: ltv([few, few * 3, 600_000], [0, 0, 0], [0, 0, 0]) }, 100_000, 20_000);
  assert.equal(r.points[0].enough, false);
  assert.ok((r.points[0].ratio ?? 0) > 1);
  assert.equal(r.paidBackAt, null);
  // Nobody old enough: nothing measured, not a zero.
  assert.equal(r.points[1].revenuePerCustomer, null);
  assert.equal(r.points[1].marginPerCustomer, null);
  assert.equal(r.points[1].ratio, null);
});

test("no spend, no new customer or no margin: the missing part stays empty", () => {
  const data = { customers: 20, ltv: ltv([15, 12, 800_000], [0, 0, 0], [0, 0, 0]) };
  assert.equal(payback(data, null, 10_000).costPerCustomer, null);
  assert.equal(payback(data, 0, 10_000).costPerCustomer, null);
  assert.equal(payback({ ...data, customers: 0 }, 50_000, 10_000).costPerCustomer, null);
  const noMargin = payback(data, 50_000, null);
  assert.equal(noMargin.points[0].revenuePerCustomer, 53_333);
  assert.equal(noMargin.points[0].marginPerCustomer, null);
  assert.equal(noMargin.paidBackAt, null);
});
