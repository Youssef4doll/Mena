import { JUDGE_MIN_ORDERS, JUDGE_SPEND_MULTIPLE } from "./advisor";

/**
 * The ads forecast for one product: what a plan (ad sets, their creatives, a
 * daily budget, a number of days) should bring, from impressions to parcels
 * delivered and profit, as a range and never as one number. Pure and
 * deterministic (a seeded simulation), so the same plan always gives the
 * same answer, and it is tested. Money in millimes, rates as fractions.
 *
 * Where each number comes from, best first:
 *  - the shop's own measures (its Meta spend, impressions and clicks, its
 *    visits, orders, confirmations and deliveries), as counts;
 *  - public figures found on the web, each with its page (forecast-prompt.ts),
 *    as a range, used as the prior the shop's counts then correct;
 *  - Claude's reading of the real creatives: a factor on the click rate and
 *    one on the order rate for each creative, uncertain in proportion to how
 *    sure it said it was;
 *  - what past forecasts got wrong (calibrate): the public ranges move by it.
 * A stage with none of these is "missing": nothing is forecast past it.
 *
 *   stageDists(inputs)                     → StageDists          what each stage is believed to be
 *   simulate(plan, dists, econ, opts)      → Simulation          the plan's quantiles, P(profit), learning events
 *   creativeOutlook(c, dists)              → CreativeOutlook     one creative's median rates and cost per order
 *   testPlan(input)                        → TestPlan            the budget that reads each creative, from the advisor's own rule
 *   budgetOptions(plan, dists, econ, …)    → BudgetOption[]      the same plan at several daily budgets
 *   evaluate(forecast, actual)             → Evaluation          one forecast against what really happened
 *   calibrate(evaluations)                 → Calibration         the correction past forecasts call for
 */

// ── Model assumptions (shown on the page) ─────────────────────────────

/** Draws of the simulation: the quantiles move by less than 1 % between seeds. */
export const DRAWS = 4000;
/** Spread of a creative's factor around Claude's value, by how sure it said it was (log scale: 0.25 ≈ ×0.78 to ×1.28 for one standard deviation). */
export const FACTOR_SIGMA = { high: 0.15, medium: 0.25, low: 0.4 } as const;
/** Claude's factors are held to this range: no reading of a creative turns an average ad into a miracle or a disaster. */
export const FACTOR_MIN = 0.5;
export const FACTOR_MAX = 1.6;
/** How much the shop's own CPM varies around its average (log scale), by how many impressions it rests on. */
export const CPM_SHOP_SIGMA = [
  { impressions: 20_000, sigma: 0.15 },
  { impressions: 5_000, sigma: 0.25 },
  { impressions: 0, sigma: 0.4 },
] as const;
/** A public range is read as a 90 % interval (±1.645 standard deviations on the log scale). */
const RANGE_Z = 1.645;
/**
 * A figure measured elsewhere (another shop, another market) says this shop's
 * only roughly: never tighter than ±25 % (of the CPM; of a rate's smaller
 * side, its clicks or its parcels back), however narrow the published range.
 * A single published figure gets that spread.
 */
export const PUBLIC_MIN_SIGMA = 0.25;
/** A public range is never trusted more than this many observations, nor less than this few: the shop's own counts take over past it. */
const PRIOR_STRENGTH_MAX = 5000;
const PRIOR_STRENGTH_MIN = 3;
/** Without a public range, the shop's own counts are used alone only from this many successes and failures. */
const SHOP_ONLY_MIN = 5;
/** Past forecasts weigh against a correction as if this many had come out exactly right. */
const CALIBRATION_PRIOR = 2;
const CALIBRATION_MIN = 0.4;
const CALIBRATION_MAX = 2.5;
/** What a forecast's rates are compared on: below these counts, a real rate says too little. */
export const EVAL_MIN = { impressions: 1000, clicks: 30, sessions: 50 } as const;

// ── Types ──────────────────────────────────────────────────────────────

export type Stage = "cpm" | "ctr" | "landing" | "orderRate" | "confirmRate" | "deliveryRate";
export type RateStage = Exclude<Stage, "cpm">;
export const STAGES: Stage[] = ["cpm", "ctr", "landing", "orderRate", "confirmRate", "deliveryRate"];
export const RATE_STAGES: RateStage[] = ["ctr", "landing", "orderRate", "confirmRate", "deliveryRate"];

/** A public range: rates as fractions, the CPM in millimes per 1 000 impressions. */
export type Range = { low: number; high: number };
export type Count = { successes: number; n: number };

export type ForecastInputs = {
  cpm: { prior: Range | null; shop: { spend: number; impressions: number } | null };
  rates: Record<RateStage, { prior: Range | null; shop: Count | null }>;
  /** Multipliers on the public ranges, from calibrate(). */
  calibration?: Partial<Record<Stage, number>>;
};

export type Dist = { kind: "beta"; a: number; b: number } | { kind: "lognormal"; mu: number; sigma: number };
export type Basis = "shop" | "public" | "both";
export type StageDist = { dist: Dist; basis: Basis; median: number; low: number; high: number };
export type StageDists = Record<Stage, StageDist | null>;

export type Confidence = keyof typeof FACTOR_SIGMA;
export type CreativeFactor = { id: string; ctrFactor: number; convFactor: number; confidence: Confidence };
export type AdSetPlan = { id: string; creativeIds: string[]; dailyBudget: number };
export type Plan = { adSets: AdSetPlan[]; days: number; creatives: CreativeFactor[] };

/** One delivered order's money, for the offer the ads push (breakeven.ts). Null when a cost is unknown. */
export type Economics = {
  /** Goods and delivery fee the customer pays. */
  revenue: number;
  productCost: number | null;
  carrierPerParcel: number | null;
  returnPerParcel: number | null;
  /** Of the confirmed orders, the share shipped (breakeven.ts shippedShare); 1 without a measure. */
  shipped: number;
  /** The ceiling a delivered order may cost in ads (breakEven().maxCostPerDelivered). */
  maxCostPerDelivered: number | null;
};

/** What the platform optimises on: the purchase is sent at the order, the confirmation or the delivery. */
export type OptimizedEvent = "placed" | "confirmed" | "delivered";

export type Quantiles = { p10: number; p50: number; p90: number; mean: number };
export type Metric = "spend" | "impressions" | "clicks" | "visits" | "orders" | "confirmed" | "delivered" | "costPerOrder" | "costPerDelivered" | "profit" | "ordersPerDinar";

export type Simulation = {
  draws: number;
  /** Null for profit when a cost is unknown. Costs per order are Infinity in draws without an order. */
  metrics: Record<Metric, Quantiles | null>;
  /** Share of draws that make money, and that keep the cost per delivered order under its ceiling. */
  probProfit: number | null;
  probUnderCeiling: number | null;
  /** Median optimisation events per ad set over 7 days. */
  learningEvents: { adSetId: string; p50: number }[];
  /** Median of the rates the plan runs at (creatives included), spend-weighted, for evaluate(). */
  rates: { cpm: number; ctr: number; landing: number; orderRate: number };
  /** Stages the forecast could not use: nothing past the first one is forecast. */
  missing: Stage[];
};

// ── Random numbers (seeded) ────────────────────────────────────────────

/** A 32-bit hash of a string: the seed of a plan, so the same plan draws the same numbers. */
export function seedOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32: small, fast, good enough for a simulation, and the same on every machine. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(r: () => number): number {
  // Box–Muller; 1 − u keeps the log away from 0.
  const u = 1 - r();
  const v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Marsaglia–Tsang. */
function gamma(r: () => number, shape: number): number {
  if (shape < 1) return gamma(r, shape + 1) * Math.pow(r() || 1e-12, 1 / shape);
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number;
    let v: number;
    do {
      x = normal(r);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = r();
    if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

function beta(r: () => number, a: number, b: number): number {
  const x = gamma(r, a);
  const y = gamma(r, b);
  return x + y > 0 ? x / (x + y) : a / (a + b);
}

function poisson(r: () => number, lambda: number): number {
  if (!(lambda > 0)) return 0;
  if (lambda > 30) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * normal(r)));
  const l = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= r();
  } while (p > l);
  return k - 1;
}

function binomial(r: () => number, n: number, p: number): number {
  if (n <= 0 || p <= 0) return 0;
  if (p >= 1) return n;
  if (n <= 40) {
    let k = 0;
    for (let i = 0; i < n; i++) if (r() < p) k++;
    return k;
  }
  const mean = n * p;
  const rest = n * (1 - p);
  if (mean < 15) return Math.min(n, poisson(r, mean));
  if (rest < 15) return Math.max(0, n - poisson(r, rest));
  return Math.min(n, Math.max(0, Math.round(mean + Math.sqrt(mean * (1 - p)) * normal(r))));
}

export function sample(r: () => number, d: Dist): number {
  return d.kind === "beta" ? beta(r, d.a, d.b) : Math.exp(d.mu + d.sigma * normal(r));
}

// ── What each stage is believed to be ──────────────────────────────────

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** A range read as a log-normal 90 % interval: its median and log spread, never under PUBLIC_MIN_SIGMA. */
function logRange(r: Range): { mu: number; sigma: number } {
  const lo = Math.min(r.low, r.high);
  const hi = Math.max(r.low, r.high);
  return { mu: (Math.log(lo) + Math.log(hi)) / 2, sigma: Math.max(PUBLIC_MIN_SIGMA, (Math.log(hi) - Math.log(lo)) / (2 * RANGE_Z)) };
}

const validRange = (r: Range | null, max = Infinity): r is Range => r != null && r.low > 0 && r.high > 0 && r.low < max && r.high <= max;

/** A rate stage: the public range as a Beta prior, then the shop's counts. Null when neither says enough. */
export function rateDist(prior: Range | null, shop: Count | null, calibration = 1): StageDist | null {
  const counts = shop && shop.n > 0 ? { s: clamp(Math.round(shop.successes), 0, Math.round(shop.n)), f: Math.round(shop.n) - clamp(Math.round(shop.successes), 0, Math.round(shop.n)) } : null;
  let a: number;
  let b: number;
  let basis: Basis;
  if (validRange(prior, 1)) {
    const lo = Math.min(prior.low, prior.high) * calibration;
    const hi = Math.min(0.99, Math.max(prior.low, prior.high) * calibration);
    // The middle on the smaller side: a click rate by its clicks, a delivery rate by its parcels back.
    const mean = clamp(hi < 0.5 ? Math.sqrt(lo * hi) : lo > 0.5 ? 1 - Math.sqrt((1 - lo) * (1 - hi)) : (lo + hi) / 2, 1e-5, 0.99);
    const sd = Math.max((hi - lo) / (2 * RANGE_Z), PUBLIC_MIN_SIGMA * Math.min(mean, 1 - mean));
    const k = clamp((mean * (1 - mean)) / (sd * sd) - 1, PRIOR_STRENGTH_MIN, PRIOR_STRENGTH_MAX);
    a = mean * k;
    b = (1 - mean) * k;
    basis = counts && counts.s + counts.f > 0 ? "both" : "public";
  } else if (counts && counts.s >= SHOP_ONLY_MIN && counts.f >= SHOP_ONLY_MIN) {
    a = 0.5;
    b = 0.5;
    basis = "shop";
  } else return null;
  if (counts) {
    a += counts.s;
    b += counts.f;
  }
  return withSpread({ kind: "beta", a, b }, basis);
}

/** The CPM: the public range and the shop's own average, weighed by how precise each is, on the log scale. */
export function cpmDist(prior: Range | null, shop: { spend: number; impressions: number } | null, calibration = 1): StageDist | null {
  const parts: { mu: number; sigma: number }[] = [];
  if (validRange(prior)) {
    const p = logRange({ low: prior.low * calibration, high: prior.high * calibration });
    parts.push(p);
  }
  const hasShop = shop != null && shop.impressions > 0 && shop.spend > 0;
  if (hasShop) {
    const sigma = CPM_SHOP_SIGMA.find((s) => shop.impressions >= s.impressions)?.sigma ?? 0.4;
    parts.push({ mu: Math.log((shop.spend / shop.impressions) * 1000), sigma });
  }
  if (!parts.length) return null;
  const w = parts.map((p) => 1 / (p.sigma * p.sigma));
  const total = w.reduce((s, x) => s + x, 0);
  const mu = parts.reduce((s, p, i) => s + p.mu * w[i], 0) / total;
  const basis: Basis = parts.length === 2 ? "both" : hasShop ? "shop" : "public";
  return withSpread({ kind: "lognormal", mu, sigma: Math.sqrt(1 / total) }, basis);
}

/** The 5th, 50th and 95th percentiles of a distribution, from a fixed sample: what the page shows. */
function withSpread(dist: Dist, basis: Basis): StageDist {
  if (dist.kind === "lognormal") return { dist, basis, median: Math.exp(dist.mu), low: Math.exp(dist.mu - RANGE_Z * dist.sigma), high: Math.exp(dist.mu + RANGE_Z * dist.sigma) };
  const r = rng(seedOf(`${dist.a}|${dist.b}`));
  const xs = Array.from({ length: 2000 }, () => beta(r, dist.a, dist.b)).sort((x, y) => x - y);
  return { dist, basis, median: xs[1000], low: xs[100], high: xs[1899] };
}

export function stageDists(i: ForecastInputs): StageDists {
  const c = i.calibration ?? {};
  const out = { cpm: cpmDist(i.cpm.prior, i.cpm.shop, c.cpm ?? 1) } as StageDists;
  for (const s of RATE_STAGES) out[s] = rateDist(i.rates[s].prior, i.rates[s].shop, c[s] ?? 1);
  return out;
}

// ── The simulation ─────────────────────────────────────────────────────

function quantiles(xs: number[]): Quantiles {
  const s = [...xs].sort((a, b) => a - b);
  const at = (q: number) => s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))];
  const finite = s.filter(Number.isFinite);
  return { p10: at(0.1), p50: at(0.5), p90: at(0.9), mean: finite.length ? finite.reduce((a, b) => a + b, 0) / finite.length : Infinity };
}

const factorOf = (c: CreativeFactor | undefined, key: "ctrFactor" | "convFactor") => clamp(c?.[key] ?? 1, FACTOR_MIN, FACTOR_MAX);

export type SimulateOptions = { draws?: number; seed?: number; optimized?: OptimizedEvent };

export function simulate(plan: Plan, dists: StageDists, econ: Economics, opts: SimulateOptions = {}): Simulation {
  const draws = opts.draws ?? DRAWS;
  const missing = STAGES.filter((s) => dists[s] == null);
  const order: Stage[] = ["cpm", "ctr", "landing", "orderRate", "confirmRate", "deliveryRate"];
  const firstMissing = order.findIndex((s) => dists[s] == null);
  const reach = firstMissing < 0 ? order.length : firstMissing;
  const r = rng(opts.seed ?? seedOf(JSON.stringify({ plan, econ })));
  const byId = new Map(plan.creatives.map((c) => [c.id, c]));
  const days = Math.max(1, Math.round(plan.days));
  const keys: Metric[] = ["spend", "impressions", "clicks", "visits", "orders", "confirmed", "delivered", "costPerOrder", "costPerDelivered", "profit", "ordersPerDinar"];
  const cols: Record<Metric, number[]> = Object.fromEntries(keys.map((k) => [k, [] as number[]])) as Record<Metric, number[]>;
  const events: number[][] = plan.adSets.map(() => []);
  const rateCols = { cpm: [] as number[], ctr: [] as number[], landing: [] as number[], orderRate: [] as number[] };
  let profitable = 0;
  let underCeiling = 0;
  const knownCosts = econ.productCost != null && econ.carrierPerParcel != null && econ.returnPerParcel != null;
  const optimized = opts.optimized ?? "placed";

  for (let d = 0; d < draws; d++) {
    const v = (s: Stage) => (dists[s] ? sample(r, dists[s]!.dist) : NaN);
    const cpm = v("cpm");
    const ctr = v("ctr");
    const landing = v("landing");
    const orderRate = v("orderRate");
    const confirm = v("confirmRate");
    const delivery = v("deliveryRate");
    const f = new Map(
      plan.creatives.map((c) => {
        const sd = FACTOR_SIGMA[c.confidence] ?? FACTOR_SIGMA.medium;
        return [c.id, { ctr: factorOf(c, "ctrFactor") * Math.exp(sd * normal(r)), conv: factorOf(c, "convFactor") * Math.exp(sd * normal(r)) }];
      }),
    );
    const t = { spend: 0, impressions: 0, clicks: 0, visits: 0, orders: 0, confirmed: 0, delivered: 0, shipped: 0, back: 0 };
    let wCtr = 0;
    let wConv = 0;
    plan.adSets.forEach((set, i) => {
      const spend = Math.max(0, set.dailyBudget) * days;
      const ids = set.creativeIds.filter((id) => byId.has(id));
      const mean = (k: "ctr" | "conv") => (ids.length ? ids.reduce((s, id) => s + f.get(id)![k], 0) / ids.length : 1);
      const setCtr = clamp(ctr * mean("ctr"), 0, 0.5);
      const setConv = clamp(orderRate * mean("conv"), 0, 0.9);
      const impressions = reach > 0 ? Math.round((spend / cpm) * 1000) : 0;
      const clicks = reach > 1 ? poisson(r, impressions * setCtr) : 0;
      const visits = reach > 2 ? binomial(r, clicks, landing) : 0;
      const orders = reach > 3 ? binomial(r, visits, setConv) : 0;
      const confirmed = reach > 4 ? binomial(r, orders, confirm) : 0;
      const shipped = reach > 5 ? binomial(r, confirmed, clamp(econ.shipped, 0, 1)) : 0;
      const delivered = reach > 5 ? binomial(r, shipped, delivery) : 0;
      const ev = optimized === "placed" ? orders : optimized === "confirmed" ? confirmed : delivered;
      events[i].push((ev * 7) / days);
      t.spend += spend;
      t.impressions += impressions;
      t.clicks += clicks;
      t.visits += visits;
      t.orders += orders;
      t.confirmed += confirmed;
      t.shipped += shipped;
      t.delivered += delivered;
      t.back += shipped - delivered;
      wCtr += spend * setCtr;
      wConv += spend * setConv;
    });
    cols.spend.push(t.spend);
    cols.impressions.push(t.impressions);
    cols.clicks.push(t.clicks);
    cols.visits.push(t.visits);
    cols.orders.push(t.orders);
    cols.confirmed.push(t.confirmed);
    cols.delivered.push(t.delivered);
    cols.costPerOrder.push(t.orders > 0 ? t.spend / t.orders : Infinity);
    cols.costPerDelivered.push(t.delivered > 0 ? t.spend / t.delivered : Infinity);
    cols.ordersPerDinar.push(t.spend > 0 ? (t.orders / t.spend) * 1000 : 0);
    if (knownCosts) {
      const profit = t.delivered * (econ.revenue - econ.productCost!) - t.shipped * econ.carrierPerParcel! - t.back * econ.returnPerParcel! - t.spend;
      cols.profit.push(profit);
      if (profit > 0) profitable++;
    }
    if (econ.maxCostPerDelivered != null && t.delivered > 0 && t.spend / t.delivered <= econ.maxCostPerDelivered) underCeiling++;
    if (t.spend > 0) {
      rateCols.cpm.push(cpm);
      rateCols.ctr.push(wCtr / t.spend);
      rateCols.landing.push(landing);
      rateCols.orderRate.push(wConv / t.spend);
    }
  }

  // A metric past the first missing stage is not forecast.
  const needs: Record<Metric, number> = { spend: 0, impressions: 1, clicks: 2, visits: 3, orders: 4, confirmed: 5, delivered: 6, costPerOrder: 4, costPerDelivered: 6, profit: 6, ordersPerDinar: 4 };
  const metrics = Object.fromEntries(keys.map((k) => [k, needs[k] <= reach && cols[k].length ? quantiles(cols[k]) : null])) as Record<Metric, Quantiles | null>;
  if (!knownCosts) metrics.profit = null;
  const med = (xs: number[]) => (xs.length ? quantiles(xs).p50 : NaN);
  return {
    draws,
    metrics,
    probProfit: knownCosts && reach === order.length ? profitable / draws : null,
    probUnderCeiling: econ.maxCostPerDelivered != null && reach === order.length ? underCeiling / draws : null,
    learningEvents: reach > 3 ? plan.adSets.map((s, i) => ({ adSetId: s.id, p50: quantiles(events[i]).p50 })) : [],
    rates: { cpm: med(rateCols.cpm), ctr: med(rateCols.ctr), landing: med(rateCols.landing), orderRate: med(rateCols.orderRate) },
    missing,
  };
}

// ── One creative, in medians ───────────────────────────────────────────

export type CreativeOutlook = { id: string; ctr: number | null; orderRate: number | null; costPerOrder: number | null; costPerDelivered: number | null };

/** A creative's median rates and costs if it ran alone: to rank them, not to promise anything. */
export function creativeOutlook(c: CreativeFactor, dists: StageDists, econ: Pick<Economics, "shipped">): CreativeOutlook {
  const m = (s: Stage) => dists[s]?.median ?? null;
  const ctr = m("ctr") == null ? null : clamp(m("ctr")! * factorOf(c, "ctrFactor"), 0, 0.5);
  const orderRate = m("orderRate") == null ? null : clamp(m("orderRate")! * factorOf(c, "convFactor"), 0, 0.9);
  const cpm = m("cpm");
  const landing = m("landing");
  const perOrder = cpm != null && ctr && landing && orderRate ? cpm / 1000 / (ctr * landing * orderRate) : null;
  const net = m("confirmRate") != null && m("deliveryRate") != null ? m("confirmRate")! * clamp(econ.shipped, 0, 1) * m("deliveryRate")! : null;
  return { id: c.id, ctr, orderRate, costPerOrder: perOrder == null ? null : Math.round(perOrder), costPerDelivered: perOrder != null && net ? Math.round(perOrder / net) : null };
}

// ── The test ───────────────────────────────────────────────────────────

export type TestPlan = {
  /** What each creative must spend before the advisor judges it (JUDGE_SPEND_MULTIPLE × the ceiling), or JUDGE_MIN_ORDERS orders first. */
  perCreative: number;
  /** Creatives in the test (the best first, when the loss cap cuts the list). */
  creatives: number;
  dropped: number;
  total: number;
  days: number;
  daily: number;
  /** The most the test can lose: everything spent, if not one parcel is delivered. */
  worstCase: number;
};

/**
 * The budget that gets each creative to a verdict in `days`: the advisor
 * judges an ad once it has spent twice what a delivered order may cost, so the
 * test gives each creative that much (or stops early at 10 orders). A loss
 * cap tests fewer creatives rather than starving each one.
 */
export function testPlan(i: { maxCostPerDelivered: number; creatives: number; days: number; maxLoss?: number | null }): TestPlan | null {
  if (!(i.maxCostPerDelivered > 0) || i.creatives < 1) return null;
  const days = Math.max(3, Math.round(i.days));
  const perCreative = Math.round(JUDGE_SPEND_MULTIPLE * i.maxCostPerDelivered);
  let n = i.creatives;
  if (i.maxLoss != null && i.maxLoss > 0) n = Math.max(1, Math.min(n, Math.floor(i.maxLoss / perCreative)));
  const total = perCreative * n;
  return { perCreative, creatives: n, dropped: i.creatives - n, total, days, daily: Math.ceil(total / days / 1000) * 1000, worstCase: total };
}

export { JUDGE_MIN_ORDERS };

// ── Several budgets ────────────────────────────────────────────────────

export type BudgetOption = {
  daily: number;
  /** Days for every creative to reach its verdict spend at this budget. */
  daysToVerdict: number | null;
  orders: Quantiles | null;
  delivered: Quantiles | null;
  costPerDelivered: Quantiles | null;
  profit: Quantiles | null;
  probProfit: number | null;
  learning: number | null;
};

/** The plan at several total daily budgets, split across its ad sets as the plan splits it. */
export function budgetOptions(plan: Plan, dists: StageDists, econ: Economics, dailies: number[], opts: SimulateOptions & { verdictSpend?: number | null } = {}): BudgetOption[] {
  const total = plan.adSets.reduce((s, a) => s + a.dailyBudget, 0);
  return [...new Set(dailies.filter((d) => d > 0).map((d) => Math.round(d / 1000) * 1000))]
    .sort((a, b) => a - b)
    .map((daily) => {
      const share = (a: AdSetPlan) => (total > 0 ? a.dailyBudget / total : 1 / plan.adSets.length);
      const scaled: Plan = { ...plan, adSets: plan.adSets.map((a) => ({ ...a, dailyBudget: daily * share(a) })) };
      const s = simulate(scaled, dists, econ, { ...opts, draws: opts.draws ?? 1500 });
      return {
        daily,
        daysToVerdict: opts.verdictSpend ? Math.ceil(opts.verdictSpend / daily) : null,
        orders: s.metrics.orders,
        delivered: s.metrics.delivered,
        costPerDelivered: s.metrics.costPerDelivered,
        profit: s.metrics.profit,
        probProfit: s.probProfit,
        learning: s.learningEvents.length ? Math.min(...s.learningEvents.map((e) => e.p50)) : null,
      };
    });
}

// ── Learning from what happened ────────────────────────────────────────

/** What a saved forecast expected, per stage, and its range of orders per dinar spent (spend-free, so a different budget can still be compared). */
export type SavedForecast = {
  rates: { cpm: number; ctr: number; landing: number; orderRate: number };
  ordersPerDinar: { p10: number; p90: number } | null;
};

/** What the ads really did over the forecast's window (the platform's export and the shop's own visits and orders). */
export type Actual = { spend: number; impressions: number; clicks: number; sessions: number; orders: number };

export type StageCheck = { stage: "cpm" | "ctr" | "landing" | "orderRate"; predicted: number; actual: number; ratio: number };
export type Evaluation = { checks: StageCheck[]; inRange: boolean | null; ordersPerDinar: number | null };

/** One forecast against reality, stage by stage, on what the counts are large enough to say. */
export function evaluate(f: SavedForecast, a: Actual): Evaluation {
  const checks: StageCheck[] = [];
  const add = (stage: StageCheck["stage"], predicted: number, actual: number | null) => {
    if (actual == null || !(predicted > 0) || !(actual > 0)) return;
    checks.push({ stage, predicted, actual, ratio: actual / predicted });
  };
  add("cpm", f.rates.cpm, a.impressions >= EVAL_MIN.impressions && a.spend > 0 ? (a.spend / a.impressions) * 1000 : null);
  add("ctr", f.rates.ctr, a.impressions >= EVAL_MIN.impressions ? a.clicks / a.impressions : null);
  add("landing", f.rates.landing, a.clicks >= EVAL_MIN.clicks ? Math.min(1, a.sessions / a.clicks) : null);
  add("orderRate", f.rates.orderRate, a.sessions >= EVAL_MIN.sessions ? a.orders / a.sessions : null);
  const opd = a.spend > 0 ? (a.orders / a.spend) * 1000 : null;
  const inRange = opd == null || !f.ordersPerDinar ? null : opd >= f.ordersPerDinar.p10 && opd <= f.ordersPerDinar.p90;
  return { checks, inRange, ordersPerDinar: opd };
}

export type Calibration = Partial<Record<Stage, { factor: number; forecasts: number }>>;

/**
 * The correction past forecasts call for, stage by stage: the geometric mean
 * of real ÷ forecast, pulled toward 1 as if CALIBRATION_PRIOR forecasts had
 * been exact, within ×0.4 to ×2.5. It moves the public ranges only: the
 * shop's own counts already carry what happened.
 */
export function calibrate(evals: Evaluation[]): Calibration {
  const out: Calibration = {};
  for (const stage of ["cpm", "ctr", "landing", "orderRate"] as const) {
    const logs = evals.flatMap((e) => e.checks.filter((c) => c.stage === stage).map((c) => Math.log(c.ratio)));
    if (!logs.length) continue;
    const factor = clamp(Math.exp(logs.reduce((s, x) => s + x, 0) / (logs.length + CALIBRATION_PRIOR)), CALIBRATION_MIN, CALIBRATION_MAX);
    out[stage] = { factor, forecasts: logs.length };
  }
  return out;
}

/** The calibration as stageDists takes it. */
export const calibrationFactors = (c: Calibration): Partial<Record<Stage, number>> => Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v!.factor]));
