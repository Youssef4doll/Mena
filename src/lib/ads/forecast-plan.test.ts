import { test } from "node:test";
import assert from "node:assert/strict";
import { buildForecast, PlanInput, type ForecastEnv } from "./forecast-plan";
import type { Benchmark } from "./forecast-prompt";

const bench = (metric: Benchmark["metric"], low: number, high: number, o: Partial<Benchmark> = {}): Benchmark => ({
  id: `${metric}-${low}`,
  metric,
  low,
  high,
  market: "maghreb",
  period: "2025",
  url: `https://example.org/${metric}`,
  title: metric,
  quote: "",
  note: "",
  converted: null,
  checked: true,
  used: true,
  ...o,
});

const figures: Benchmark[] = [
  bench("cpm", 2_000, 4_000),
  bench("ctr", 0.01, 0.02),
  bench("ctr", 0.03, 0.03, { market: "global" }),
  bench("landing", 0.7, 0.85),
  bench("orderRate", 0.015, 0.03),
  bench("learningEvents", 50, 50, { market: "global" }),
];

const env: ForecastEnv = {
  offers: [
    { key: "unit", label: "1 article", units: 1, price: 59_900, revenue: 67_900, productCost: 20_000, margin: 33_000, maxCostPerDelivered: 33_000, maxCpa: 19_000 },
    { key: "o2", label: "2 articles", units: 2, price: 99_900, revenue: 99_900, productCost: 40_000, margin: 50_000, maxCostPerDelivered: 50_000, maxCpa: 29_000 },
  ],
  shop: { days: 90, cpm: null, ctr: null, landing: null, orderRate: null, orderScope: null, confirmRate: { successes: 70, n: 100 }, deliveryRate: { successes: 80, n: 100 }, shipped: 1 },
  benchmarks: figures,
  calibration: {},
  optimized: "placed",
  carrierPerParcel: 7_000,
  returnPerParcel: 3_000,
};

const review = (verdict: "launch" | "fix" | "skip", ctrFactor: number) => ({ verdict, ctrFactor, convFactor: 1, confidence: "medium" as const });
const plan = (o: Partial<PlanInput> = {}): PlanInput =>
  PlanInput.parse({
    productId: "cl0000000000000000000001",
    offerKey: "unit",
    days: 4,
    startDay: "2026-11-10",
    maxLoss: null,
    campaign: "lampe-2026-11",
    adSets: [{ id: "E1", name: "Ensemble 1", creativeIds: ["C1", "C2", "C3"], dailyBudget: 30_000 }],
    creatives: [
      { id: "C1", label: "C1", kind: "video", adName: "lampe-demo-v1", primaryText: "", headline: "", review: review("launch", 1.3) },
      { id: "C2", label: "C2", kind: "image", adName: "lampe-pub-v2", primaryText: "", headline: "", review: review("launch", 0.8) },
      { id: "C3", label: "C3", kind: "image", adName: "lampe-pub-v3", primaryText: "", headline: "", review: review("skip", 0.6) },
    ],
    ...o,
  });

test("the forecast says where each stage comes from, the most local market first", () => {
  const r = buildForecast(env, plan());
  assert.ok(!("error" in r));
  const ctr = r.stages.find((s) => s.stage === "ctr")!;
  assert.equal(ctr.basis, "public");
  assert.equal(ctr.public!.market, "maghreb");
  assert.equal(r.stages.find((s) => s.stage === "confirmRate")!.basis, "shop");
  assert.match(r.stages.find((s) => s.stage === "confirmRate")!.shop!, /70 sur 100/);
  assert.ok(r.sim.metrics.orders && r.sim.probProfit != null);
});

test("the test budget counts the ads Claude said to launch, and the advice names the others", () => {
  const r = buildForecast(env, plan());
  assert.ok(!("error" in r));
  assert.equal(r.test!.creatives, 2);
  assert.equal(r.test!.perCreative, 66_000);
  assert.ok(r.advice.some((a) => a.tone === "bad" && a.text.includes("À ne pas lancer : C3")));
  assert.ok(r.advice.some((a) => a.text.startsWith("Budget de test conseillé")));
  assert.ok(r.advice.some((a) => a.text.includes("C1 devrait coûter le moins")));
  assert.ok(r.options.some((o) => o.daily === r.test!.daily));
  // 50 events a week: a 30 DT a day test is far from it, and the advice says so.
  assert.equal(r.learning.needed, 50);
  assert.equal(r.learning.ok, false);
});

test("the offer chosen changes the ceiling and the money", () => {
  const unit = buildForecast(env, plan());
  const pack = buildForecast(env, plan({ offerKey: "o2" }));
  assert.ok(!("error" in unit) && !("error" in pack));
  assert.equal(pack.offer.key, "o2");
  assert.ok(pack.test!.perCreative > unit.test!.perCreative);
});

test("without a figure for a stage, nothing past it is forecast, and the advice says what is missing", () => {
  const r = buildForecast({ ...env, benchmarks: figures.filter((b) => b.metric !== "orderRate") }, plan());
  assert.ok(!("error" in r));
  assert.equal(r.sim.metrics.orders, null);
  assert.ok(r.advice[0].text.startsWith("Pas de chiffre pour"));
});

test("a figure not ticked is not used", () => {
  const r = buildForecast({ ...env, benchmarks: figures.map((b) => (b.metric === "cpm" ? { ...b, used: false } : b)) }, plan());
  assert.ok(!("error" in r));
  assert.equal(r.stages[0].value, null);
});

test("the plan from the browser is held to its limits", () => {
  assert.equal(PlanInput.safeParse({ ...plan(), days: 0 }).success, false);
  assert.equal(PlanInput.safeParse({ ...plan(), adSets: [] }).success, false);
  const wild = PlanInput.parse({ ...plan(), creatives: [{ ...plan().creatives[0], review: { verdict: "launch", ctrFactor: 50, convFactor: -3, confidence: "high" } }] });
  assert.deepEqual([wild.creatives[0].review!.ctrFactor, wild.creatives[0].review!.convFactor], [1.6, 0.5]);
});
