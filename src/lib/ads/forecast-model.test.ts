import { test } from "node:test";
import assert from "node:assert/strict";
import { budgetOptions, calibrate, cpmDist, creativeOutlook, evaluate, rateDist, simulate, stageDists, testPlan, type Economics, type ForecastInputs, type Plan } from "./forecast-model";

// A 59,900 DT product bought 20 DT, 8 DT delivery fee, carrier 7 DT, 3 DT for a parcel back.
const econ: Economics = { revenue: 67_900, productCost: 20_000, carrierPerParcel: 7_000, returnPerParcel: 3_000, shipped: 1, maxCostPerDelivered: 40_900 };

/** Public ranges only: a CPM of 2 to 4 DT, 1–2 % CTR, 70–85 % landing, 1.5–3 % orders, 70–85 % confirmed, 75–90 % delivered. */
const publicOnly: ForecastInputs = {
  cpm: { prior: { low: 2_000, high: 4_000 }, shop: null },
  rates: {
    ctr: { prior: { low: 0.01, high: 0.02 }, shop: null },
    landing: { prior: { low: 0.7, high: 0.85 }, shop: null },
    orderRate: { prior: { low: 0.015, high: 0.03 }, shop: null },
    confirmRate: { prior: { low: 0.7, high: 0.85 }, shop: null },
    deliveryRate: { prior: { low: 0.75, high: 0.9 }, shop: null },
  },
};

const plan = (creatives: Plan["creatives"], daily = 30_000, days = 4): Plan => ({ adSets: [{ id: "A", creativeIds: creatives.map((c) => c.id), dailyBudget: daily }], days, creatives });
const avg = [{ id: "c1", ctrFactor: 1, convFactor: 1, confidence: "medium" as const }];

test("a public range alone gives a median inside it", () => {
  const d = rateDist({ low: 0.01, high: 0.02 }, null)!;
  assert.equal(d.basis, "public");
  assert.ok(d.median > 0.012 && d.median < 0.017, `median ${d.median}`);
  assert.ok(d.low < d.median && d.high > d.median);
});

test("a public range is read as published, high rates on their smaller side", () => {
  const ctr = rateDist({ low: 0.01, high: 0.02 }, null)!;
  assert.ok(ctr.low > 0.008 && ctr.high < 0.022, `ctr ${ctr.low}–${ctr.high}`);
  const landing = rateDist({ low: 0.7, high: 0.85 }, null)!;
  assert.ok(landing.low > 0.65 && landing.high < 0.9, `landing ${landing.low}–${landing.high}`);
  // A single figure still gets a spread: it was measured elsewhere.
  const one = rateDist({ low: 0.02, high: 0.02 }, null)!;
  assert.ok(one.low < 0.016 && one.high > 0.025);
});

test("the shop's own counts outweigh a public range once they are many", () => {
  const d = rateDist({ low: 0.01, high: 0.02 }, { successes: 600, n: 20_000 })!;
  assert.equal(d.basis, "both");
  assert.ok(d.median > 0.027 && d.median < 0.031, `median ${d.median}`);
});

test("without a public range, a few counts are not enough to forecast a stage", () => {
  assert.equal(rateDist(null, { successes: 2, n: 40 }), null);
  assert.equal(rateDist(null, null), null);
  assert.equal(rateDist(null, { successes: 12, n: 400 })!.basis, "shop");
});

test("the shop's CPM, measured on many impressions, outweighs the public range", () => {
  const d = cpmDist({ low: 2_000, high: 4_000 }, { spend: 120_000, impressions: 60_000 })!;
  assert.equal(d.basis, "both");
  // 2 DT measured against 2.8 DT public: much closer to the shop's.
  assert.ok(d.median > 2_000 && d.median < 2_300, `median ${d.median}`);
});

test("calibration moves the public range", () => {
  const plain = rateDist({ low: 0.01, high: 0.02 }, null)!;
  const halved = rateDist({ low: 0.01, high: 0.02 }, null, 0.5)!;
  assert.ok(Math.abs(halved.median / plain.median - 0.5) < 0.08);
});

test("the same plan always gives the same forecast", () => {
  const dists = stageDists(publicOnly);
  const a = simulate(plan(avg), dists, econ, { draws: 800 });
  const b = simulate(plan(avg), dists, econ, { draws: 800 });
  assert.deepEqual(a, b);
});

test("the median orders follow the funnel's medians", () => {
  const dists = stageDists(publicOnly);
  const s = simulate(plan(avg, 30_000, 4), dists, econ, { draws: 2000 });
  // 120 DT at ~2.8 DT per 1 000 ≈ 42 800 impressions × 1.4 % × 0.78 × 2.1 % ≈ 10 orders.
  const p50 = s.metrics.orders!.p50;
  assert.ok(p50 >= 6 && p50 <= 15, `orders p50 ${p50}`);
  assert.ok(s.metrics.orders!.p10 < p50 && s.metrics.orders!.p90 > p50);
  assert.equal(s.metrics.spend!.p50, 120_000);
  assert.ok(s.probProfit != null && s.probProfit > 0 && s.probProfit < 1);
});

test("a stronger creative brings more orders for the same money", () => {
  const dists = stageDists(publicOnly);
  const weak = simulate(plan([{ id: "w", ctrFactor: 0.6, convFactor: 0.8, confidence: "high" }]), dists, econ, { draws: 1500 });
  const strong = simulate(plan([{ id: "s", ctrFactor: 1.4, convFactor: 1.2, confidence: "high" }]), dists, econ, { draws: 1500 });
  assert.ok(strong.metrics.orders!.p50 > weak.metrics.orders!.p50 * 2);
  assert.ok(strong.probProfit! > weak.probProfit!);
});

test("factors are held to their range", () => {
  const dists = stageDists(publicOnly);
  const wild = creativeOutlook({ id: "x", ctrFactor: 9, convFactor: 0.01, confidence: "low" }, dists, econ);
  const capped = creativeOutlook({ id: "x", ctrFactor: 1.6, convFactor: 0.5, confidence: "low" }, dists, econ);
  assert.deepEqual(wild, capped);
});

test("nothing is forecast past a stage nobody measured", () => {
  const inputs: ForecastInputs = { ...publicOnly, rates: { ...publicOnly.rates, orderRate: { prior: null, shop: null } } };
  const s = simulate(plan(avg), stageDists(inputs), econ, { draws: 300 });
  assert.deepEqual(s.missing, ["orderRate"]);
  assert.ok(s.metrics.visits);
  assert.equal(s.metrics.orders, null);
  assert.equal(s.metrics.profit, null);
  assert.equal(s.probProfit, null);
});

test("an unknown cost leaves the profit out, not at zero", () => {
  const s = simulate(plan(avg), stageDists(publicOnly), { ...econ, productCost: null, maxCostPerDelivered: null }, { draws: 300 });
  assert.equal(s.metrics.profit, null);
  assert.equal(s.probProfit, null);
  assert.ok(s.metrics.delivered);
});

test("learning events count what the platform optimises on", () => {
  const dists = stageDists(publicOnly);
  const placed = simulate(plan(avg, 30_000, 7), dists, econ, { draws: 800, optimized: "placed" });
  const delivered = simulate(plan(avg, 30_000, 7), dists, econ, { draws: 800, optimized: "delivered" });
  assert.ok(placed.learningEvents[0].p50 > delivered.learningEvents[0].p50);
});

test("the test gives each creative twice its ceiling, and a loss cap tests fewer creatives", () => {
  const t = testPlan({ maxCostPerDelivered: 25_000, creatives: 3, days: 4 })!;
  assert.equal(t.perCreative, 50_000);
  assert.equal(t.total, 150_000);
  assert.equal(t.daily, 38_000);
  const capped = testPlan({ maxCostPerDelivered: 25_000, creatives: 3, days: 4, maxLoss: 110_000 })!;
  assert.equal(capped.creatives, 2);
  assert.equal(capped.dropped, 1);
  assert.equal(testPlan({ maxCostPerDelivered: 0, creatives: 2, days: 4 }), null);
  assert.equal(testPlan({ maxCostPerDelivered: 25_000, creatives: 1, days: 1 })!.days, 3);
});

test("budget options keep the plan's split and say when each creative reaches its verdict", () => {
  const two: Plan = { adSets: [{ id: "A", creativeIds: ["c1"], dailyBudget: 20_000 }, { id: "B", creativeIds: ["c1"], dailyBudget: 10_000 }], days: 4, creatives: avg };
  const opts = budgetOptions(two, stageDists(publicOnly), econ, [15_000, 30_000, 60_000], { draws: 400, verdictSpend: 120_000 });
  assert.deepEqual(opts.map((o) => o.daily), [15_000, 30_000, 60_000]);
  assert.deepEqual(opts.map((o) => o.daysToVerdict), [8, 4, 2]);
  assert.ok(opts[2].orders!.p50 > opts[0].orders!.p50);
});

test("a forecast is compared on rates, and only where the counts say enough", () => {
  const e = evaluate({ rates: { cpm: 3_000, ctr: 0.015, landing: 0.8, orderRate: 0.02 }, ordersPerDinar: { p10: 0.05, p90: 0.15 } }, { spend: 100_000, impressions: 40_000, clicks: 800, sessions: 30, orders: 4 });
  assert.deepEqual(e.checks.map((c) => c.stage), ["cpm", "ctr", "landing"]);
  assert.ok(Math.abs(e.checks[0].ratio - 2_500 / 3_000) < 1e-9);
  assert.equal(e.ordersPerDinar, 0.04);
  assert.equal(e.inRange, false);
});

test("calibration is pulled toward 1 until several forecasts agree", () => {
  const one = evaluate({ rates: { cpm: 2_000, ctr: 0.01, landing: 0.8, orderRate: 0.02 }, ordersPerDinar: null }, { spend: 100_000, impressions: 25_000, clicks: 250, sessions: 200, orders: 4 });
  const c1 = calibrate([one]);
  // CPM came out at 4 DT for 2 forecast: ×2, pulled to 2^(1/3).
  assert.ok(Math.abs(c1.cpm!.factor - Math.cbrt(2)) < 1e-9);
  const c5 = calibrate([one, one, one, one, one]);
  assert.ok(c5.cpm!.factor > c1.cpm!.factor && c5.cpm!.factor < 2);
  assert.equal(calibrate([]).cpm, undefined);
});
