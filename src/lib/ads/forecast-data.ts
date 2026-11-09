import "server-only";
import { prisma } from "../prisma";
import { getSettings } from "../settings";
import { tunisDay, tunisMidnight } from "../analytics-range";
import { adRows, baseline, adCosts } from "./data";
import { loadBriefInput } from "./brief-data";
import { READ_MIN_DECIDED, READ_MIN_PARCELS, READ_MIN_VISITS, type BriefInput } from "./brief";
import { productBreakEvens, shippedShare } from "./breakeven";
import { META_SOURCE, normName } from "./match";
import { calibrate, evaluate, type Actual, type Calibration, type Evaluation, type OptimizedEvent, type Quantiles, type SavedForecast } from "./forecast-model";
import { type Benchmark } from "./forecast-prompt";
import type { ForecastEnv, OfferEcon, ShopMeasures } from "./forecast-plan";

/**
 * What the "Prévision" tab reads and keeps: the product's economics and the
 * shop's own measures (as counts), the public figures found (one Setting
 * row), and the saved forecasts with what really happened since, which give
 * the next forecasts their correction. Real data only: a measure nobody has
 * is null, never a zero.
 *
 *   forecastEnv(productId, now)     → { input, photos, env } | null
 *   readBenchmarks() / saveBenchmarks(store) / tickBenchmarks(ids)
 *   forecastHistory(now)            → { rows, calibration }
 */

const DAY = 86_400_000;
/** Days of the shop's Meta figures the forecast reads. */
export const MEASURE_DAYS = 90;
/** Gallery photos sent to Claude with the creatives, to check the ads show the same product. */
const PHOTOS = 2;
const BENCH_KEY = "ad-benchmarks";
/** Saved forecasts read for the history and the correction. */
const HISTORY = 30;

export type BenchStore = { updatedAt: string; mode: "api" | "manual"; items: Benchmark[] };

export async function readBenchmarks(): Promise<BenchStore | null> {
  const row = await prisma.setting.findUnique({ where: { key: BENCH_KEY } });
  const v = row?.value as BenchStore | undefined;
  return v && Array.isArray(v.items) ? v : null;
}

export async function saveBenchmarks(store: BenchStore): Promise<void> {
  await prisma.setting.upsert({ where: { key: BENCH_KEY }, create: { key: BENCH_KEY, value: store }, update: { value: store } });
}

/** Ticks exactly these figures for the forecast. */
export async function tickBenchmarks(ids: string[]): Promise<BenchStore | null> {
  const store = await readBenchmarks();
  if (!store) return null;
  const on = new Set(ids);
  const next = { ...store, items: store.items.map((b) => ({ ...b, used: on.has(b.id) })) };
  await saveBenchmarks(next);
  return next;
}

/** The shop's Meta row: what the platform reported, and the visits and orders from ad links. */
async function metaMeasures(now: Date, input: BriefInput): Promise<ShopMeasures> {
  const from = tunisMidnight(new Date(now.getTime() - MEASURE_DAYS * DAY));
  const [rows, base] = await Promise.all([adRows(from, now, "source", { source: META_SOURCE, paidOnly: true }), baseline(now)]);
  const meta = rows.find((r) => r.source === META_SOURCE);
  const p = meta?.platform;
  const f = meta?.funnel;
  const impressions = p?.impressions ?? null;
  const clicks = p?.clicks ?? null;
  const spend = p?.spend ?? null;
  // The product's own ad visits decide its order rate once there are enough; before, every Meta visit of the shop.
  const ads = input.performance.ads.filter((a) => a.source === META_SOURCE);
  const adVisits = ads.reduce((s, a) => s + a.visits, 0);
  const adOrders = ads.reduce((s, a) => s + a.orders, 0);
  const own = adVisits >= READ_MIN_VISITS;
  const perf = input.performance;
  const c = base.counts;
  const confirm = perf.decided >= READ_MIN_DECIDED ? { successes: perf.confirmed, n: perf.decided } : c && c.decided > 0 ? { successes: c.confirmed, n: c.decided } : null;
  const parcels = perf.delivered + perf.back;
  const deliver = parcels >= READ_MIN_PARCELS ? { successes: perf.delivered, n: parcels } : c && c.delivered + c.back > 0 ? { successes: c.delivered, n: c.delivered + c.back } : null;
  return {
    days: MEASURE_DAYS,
    cpm: spend != null && impressions != null && spend > 0 && impressions > 0 ? { spend, impressions } : null,
    ctr: clicks != null && impressions != null && impressions > 0 ? { successes: Math.min(clicks, impressions), n: impressions } : null,
    landing: clicks != null && clicks > 0 && f ? { successes: Math.min(f.sessions, clicks), n: clicks } : null,
    orderRate: own ? { successes: adOrders, n: adVisits } : f && f.sessions > 0 ? { successes: f.orders, n: f.sessions } : null,
    orderScope: own ? "product" : f && f.sessions > 0 ? "shop" : null,
    confirmRate: confirm,
    deliveryRate: deliver,
    shipped: shippedShare({ confirmRate: base.confirmRate, deliveryRate: base.deliveryRate, netDeliveryRate: base.netDeliveryRate }),
  };
}

/** Everything a forecast of this product needs, read from the database. */
export async function forecastEnv(productId: string, now: Date = new Date(), calibration?: Calibration): Promise<{ input: BriefInput; photos: string[]; env: ForecastEnv } | null> {
  const input = await loadBriefInput(productId, now);
  if (!input) return null;
  const [shop, costs, settings, store, history, images] = await Promise.all([
    metaMeasures(now, input),
    adCosts(),
    getSettings(),
    readBenchmarks(),
    calibration ? { calibration } : forecastHistory(now),
    prisma.productImage.findMany({ where: { productId, kind: "GALLERY" }, orderBy: { sort: "asc" }, take: PHOTOS, select: { mediaId: true } }),
  ]);
  const p = input.product;
  const offers: OfferEcon[] = productBreakEvens(
    { price: p.price, cost: p.cost, offers: p.offers.map((o) => ({ id: o.id, label: o.label, quantity: o.quantity, price: o.price, freeDelivery: o.freeDelivery })) },
    {
      deliveryFee: input.shop.deliveryFee,
      freeThreshold: input.shop.freeThreshold,
      carrierPerParcel: costs.carrierPerParcel,
      returnPerParcel: costs.returnPerParcel,
      confirmRate: input.baseline.confirmRate,
      deliveryRate: input.baseline.deliveryRate,
    },
  ).map((o) => ({
    key: o.key,
    label: o.label,
    units: o.units,
    price: o.input.price,
    revenue: o.result.revenue,
    productCost: o.result.productCost,
    margin: o.result.margin,
    maxCostPerDelivered: o.result.maxCostPerDelivered,
    maxCpa: o.result.maxCpa,
  }));
  const optimized: OptimizedEvent = settings.tracking.purchaseAt;
  return {
    input,
    photos: images.map((i) => i.mediaId),
    env: { offers, shop, benchmarks: store?.items ?? [], calibration: history.calibration, optimized, carrierPerParcel: costs.carrierPerParcel, returnPerParcel: costs.returnPerParcel },
  };
}

// ── Saved forecasts ────────────────────────────────────────────────────

/** What a saved row's `forecast` holds. */
export type StoredForecast = SavedForecast & { orders: Quantiles | null; delivered: Quantiles | null; costPerDelivered: Quantiles | null; profit: Quantiles | null; probProfit: number | null; daily: number; total: number };

export type HistoryRow = {
  id: string;
  productId: string;
  productName: string;
  startDay: string;
  days: number;
  campaign: string | null;
  adNames: string[];
  mode: string;
  createdAt: string;
  forecast: StoredForecast;
  /** "waiting": not started yet; "running": started, not over; "done": over; "none": over, but no spend of these ads in the imports. */
  status: "waiting" | "running" | "done" | "none";
  actual: Actual | null;
  evaluation: Evaluation | null;
};

/** The Tunisian midnight that starts a "YYYY-MM-DD" day. */
const dayStart = (day: string) => tunisMidnight(new Date(`${day}T12:00:00Z`));

/** The ads' real figures over [from, to): the platform's import for spend, impressions and clicks, the shop's own visits and orders. */
async function actualOf(from: Date, to: Date, names: string[]): Promise<Actual | null> {
  const wanted = new Set(names.map((n) => normName(n)).filter(Boolean));
  if (!wanted.size) return null;
  const rows = (await adRows(from, to, "ad", { source: META_SOURCE })).filter((r) => wanted.has(normName(r.ad)));
  if (!rows.length) return null;
  const sum = (f: (r: (typeof rows)[number]) => number | null) => rows.reduce((s, r) => s + (f(r) ?? 0), 0);
  const spend = sum((r) => r.platform.spend);
  if (!(spend > 0)) return null;
  return { spend, impressions: sum((r) => r.platform.impressions), clicks: sum((r) => r.platform.clicks), sessions: sum((r) => r.funnel.sessions), orders: sum((r) => r.funnel.orders) };
}

/** The last saved forecasts, each against what its ads really did, and the correction they call for (from finished ones only). */
export async function forecastHistory(now: Date = new Date()): Promise<{ rows: HistoryRow[]; calibration: Calibration }> {
  const saved = await prisma.adForecast.findMany({ orderBy: { createdAt: "desc" }, take: HISTORY });
  const today = tunisMidnight(now).getTime();
  const rows = await Promise.all(
    saved.map(async (f): Promise<HistoryRow> => {
      const startDay = f.startDay.toISOString().slice(0, 10);
      const from = dayStart(startDay);
      const end = new Date(from.getTime() + f.days * DAY);
      const forecast = f.forecast as unknown as StoredForecast;
      const started = from.getTime() <= today;
      const over = end.getTime() <= today;
      const actual = started ? await actualOf(from, new Date(Math.min(end.getTime(), now.getTime())), f.adNames) : null;
      return {
        id: f.id,
        productId: f.productId,
        productName: f.productName,
        startDay,
        days: f.days,
        campaign: f.campaign,
        adNames: f.adNames,
        mode: f.mode,
        createdAt: f.createdAt.toISOString(),
        forecast,
        status: !started ? "waiting" : !over ? "running" : actual ? "done" : "none",
        actual,
        evaluation: actual && forecast?.rates ? evaluate(forecast, actual) : null,
      };
    }),
  );
  return { rows, calibration: calibrate(rows.filter((r) => r.status === "done" && r.evaluation).map((r) => r.evaluation!)) };
}

export const today = (now: Date = new Date()) => tunisDay(now);
