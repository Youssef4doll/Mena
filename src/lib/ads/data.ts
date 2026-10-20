import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { getSettings } from "../settings";
import { spendInRange } from "../profit";
import { TZ, tunisDay } from "../analytics-range";
import { SOURCE_ALIASES, normName, normSource, parseRowKey, rowKey } from "./match";
import { unitMargin } from "./breakeven";
import type { AdRow, Baseline, Costs, DayPoint, Funnel, Level, Platform } from "./types";

/**
 * What the "Publicités" pages read: the shop's own visits and orders per
 * source, campaign (utm_campaign) or ad (utm_content), next to what the ad
 * platform reported for the same row and days. Same rules as analytics.ts:
 * bounded by the period, aggregated in Postgres, only real data — a figure
 * nobody gave is null, never a zero.
 *
 * Orders typed in the back office (device "admin") are not ad traffic and are
 * left out of every funnel; they still count as a customer's history (a
 * returning customer, a repeat order). `from`/`to` are the instants of a
 * Range (Tunis midnights, `to` excluded); days are Tunisian calendar days.
 *
 *   adRows(from: Date, to: Date, level: Level, filter?: AdFilter): Promise<AdRow[]>
 *   baseline(to?: Date, costs?: Costs): Promise<Baseline>   (marginPerDelivered only with costs)
 *   adCosts(): Promise<Costs>
 *   dailyByRow(from: Date, to: Date, level: Level, filter?: AdFilter): Promise<Record<string, DayPoint[]>>
 *   daily(from: Date, to: Date, key: string): Promise<DayPoint[]>
 *   breakdowns(from: Date, to: Date, filter?: AdFilter): Promise<Breakdowns>
 *   customerGrowth(from: Date, to: Date, filter?: AdFilter, now?: Date): Promise<CustomerGrowth>
 *   knownKeys(from: Date, to: Date): Promise<{ campaigns: string[]; ads: string[] }>
 *
 * Keys and name matching come from ./match (rowKey, parseRowKey, normName).
 */

const n = (v: unknown) => (v == null ? 0 : Number(v));
const DAY = 86_400_000;

/** Narrows any query to one source, campaign or ad (names matched as in ./match), or to ad traffic only. */
export type AdFilter = {
  source?: string;
  /** null: visits and orders without a campaign. */
  campaign?: string | null;
  ad?: string | null;
  /** Only visits and orders that came from an ad link: a utm_campaign, or a paid medium (cpc, paid…). */
  paidOnly?: boolean;
};

/** Mediums that mean a paid click: what utm_medium usually says, and what the site writes for click ids without utm. */
const PAID_MEDIA = ["paid", "cpc", "ppc", "cpm", "cpv", "paid_social", "paidsocial", "paid-social", "social_paid", "paid_or_social", "ads", "ad", "sponsored", "display"];

/** Days of order history the shop-wide rates are read over. */
const BASELINE_DAYS = 180;
/** An order this old has had time to be confirmed, shipped and delivered or refused. */
const MATURE_DAYS = 14;
/** Horizons of the revenue per customer (LTV). */
export const LTV_DAYS = [30, 60, 90] as const;

// ------------------------------------------------------------------ SQL bits
// Constant SQL, never built from input: values always go through Prisma's placeholders.

/** A name as matched (see normName): trimmed, lowercased, null when empty. */
const nameSql = (col: string) => `NULLIF(lower(btrim(${col}, E' \\t\\r\\n')), '')`;
/** A source as matched (see normSource): aliases folded, "direct" when none. */
const sourceSql = (col: string) =>
  `COALESCE(CASE ${nameSql(col)} ${Object.entries(SOURCE_ALIASES)
    .map(([alias, s]) => `WHEN '${alias}' THEN '${s}'`)
    .join(" ")} ELSE ${nameSql(col)} END, 'direct')`;
const tunisSql = (col: string) => `(${col} AT TIME ZONE 'UTC' AT TIME ZONE '${TZ}')`;

/** Order statuses past the phone confirmation (confirmedAt is set on the way, this also covers older rows). */
const CONFIRMED_SQL = `("confirmedAt" IS NOT NULL OR status IN ('CONFIRMED','SUPPLIER_ORDERED','SHIPPED','DELIVERED','REFUSED','RETURNED'))`;
/** Not ad traffic: typed in the back office. Null device (older rows) counts as the site. */
const NOT_ADMIN_SQL = `device IS DISTINCT FROM 'admin'`;
/** No earlier order (not cancelled) from the same phone: a new customer. Uses the phone index. */
const NEW_CUSTOMER_SQL = `NOT EXISTS (SELECT 1 FROM "Order" p WHERE p.phone = o.phone AND p.status <> 'CANCELLED' AND (p."createdAt" < o."createdAt" OR (p."createdAt" = o."createdAt" AND p.id < o.id)))`;

/** The source / campaign / ad columns of a level, as `src, camp, ad` (unused parts are NULL), and the GROUP BY positions. */
function dimsSql(level: Level, t: string, contentCol = "content") {
  const camp = level === "source" ? "NULL::text" : nameSql(`${t}.campaign`);
  const ad = level === "ad" ? nameSql(`${t}.${contentCol}`) : "NULL::text";
  return {
    select: Prisma.raw(`${sourceSql(`${t}.source`)} AS src, ${camp} AS camp, ${ad} AS ad`),
    group: Prisma.raw(level === "source" ? "1" : level === "campaign" ? "1, 2" : "1, 2, 3"),
    // A campaign row needs a campaign; an ad row needs an ad.
    need: Prisma.raw(level === "campaign" ? `AND ${camp} IS NOT NULL` : level === "ad" ? `AND ${ad} IS NOT NULL` : ""),
  };
}

/** The filter as SQL on a table alias whose columns are source, medium, campaign and `contentCol`. */
function filterSql(f: AdFilter | undefined, t: string, contentCol = "content"): Prisma.Sql {
  if (!f) return Prisma.empty;
  const parts: Prisma.Sql[] = [];
  if (f.source != null) parts.push(Prisma.sql`AND ${Prisma.raw(sourceSql(`${t}.source`))} = ${normSource(f.source)}`);
  if (f.campaign !== undefined) {
    const c = normName(f.campaign);
    parts.push(c == null ? Prisma.raw(`AND ${nameSql(`${t}.campaign`)} IS NULL`) : Prisma.sql`AND ${Prisma.raw(nameSql(`${t}.campaign`))} = ${c}`);
  }
  if (f.ad !== undefined) {
    const a = normName(f.ad);
    parts.push(a == null ? Prisma.raw(`AND ${nameSql(`${t}.${contentCol}`)} IS NULL`) : Prisma.sql`AND ${Prisma.raw(nameSql(`${t}.${contentCol}`))} = ${a}`);
  }
  if (f.paidOnly) parts.push(Prisma.sql`AND (${Prisma.raw(nameSql(`${t}.campaign`))} IS NOT NULL OR lower(${Prisma.raw(`${t}.medium`)}) IN (${Prisma.join(PAID_MEDIA)}))`);
  return parts.length ? Prisma.join(parts, " ") : Prisma.empty;
}

/**
 * Visits of the period with the attribution of their first event, and whether
 * they reached a product page and the order form. `server` events (written by
 * the shop itself) are not visits.
 */
function sessionsCte(from: Date, to: Date): Prisma.Sql {
  return Prisma.sql`
    ev AS (
      SELECT "sessionId", "visitorId", name, "createdAt", source, medium, campaign, content, device
      FROM "AnalyticsEvent"
      WHERE "createdAt" >= ${from} AND "createdAt" < ${to} AND "sessionId" <> 'server'
        AND name IN ('page_view', 'product_viewed', 'checkout_started')
    ), s AS (
      SELECT DISTINCT ON ("sessionId") "sessionId", "visitorId", "createdAt", source, medium, campaign, content, device
      FROM ev ORDER BY "sessionId", "createdAt"
    ), steps AS (
      SELECT "sessionId", bool_or(name = 'product_viewed') AS viewed, bool_or(name = 'checkout_started') AS started
      FROM ev GROUP BY 1
    )`;
}

// ------------------------------------------------------------------ spend

type SpendEntry = {
  day: string;
  days: number;
  source: string;
  campaign: string | null;
  ad: string | null;
  amount: number;
  impressions: number | null;
  clicks: number | null;
  reach: number | null;
  purchases: number | null;
  /** Campaign and ad as typed in Ads Manager: the spelling the owner recognises. */
  spelling: { campaign: string | null; ad: string | null };
};

/** Spend rows that may overlap [from, to) (a row covers at most 92 days), with matched names. */
async function spendRows(from: Date, to: Date): Promise<SpendEntry[]> {
  const rows = await prisma.adSpend.findMany({
    where: { day: { lt: new Date(`${tunisDay(to)}T00:00:00Z`), gte: new Date(Date.parse(`${tunisDay(from)}T00:00:00Z`) - 92 * DAY) } },
    select: { day: true, days: true, source: true, campaign: true, ad: true, amount: true, impressions: true, clicks: true, reach: true, purchases: true },
  });
  return rows.map((r) => ({
    ...r,
    day: r.day.toISOString().slice(0, 10),
    source: normSource(r.source),
    campaign: normName(r.campaign),
    ad: normName(r.ad),
    spelling: { campaign: r.campaign?.trim() || null, ad: r.ad?.trim() || null },
  }));
}

/** Days of a spend row inside [fromDay, toDay). */
function daysInside(row: { day: string; days: number }, fromDay: string, toDay: string): number {
  const start = Date.parse(`${row.day}T00:00:00Z`);
  const a = Math.max(start, Date.parse(`${fromDay}T00:00:00Z`));
  const b = Math.min(start + Math.max(1, row.days) * DAY, Date.parse(`${toDay}T00:00:00Z`));
  return b > a ? Math.round((b - a) / DAY) : 0;
}

const METRICS = ["impressions", "clicks", "reach", "purchases"] as const;

/**
 * Adds up the spend rows covering a period for one row. A count is only
 * given when every covering row has it: a total missing one entry's
 * impressions would make the cost per thousand look cheaper than it was.
 * A row spread over several days counts for its days inside the period, like
 * spendInRange. Reach is the sum of the rows' reach (daily rows: the sum of
 * daily reach), so impressions / reach reads as an average daily frequency.
 */
function platformOf(rows: SpendEntry[], fromDay: string, toDay: string): Platform {
  let spend = 0;
  let covered = false;
  const sums = { impressions: 0, clicks: 0, reach: 0, purchases: 0 };
  const missing = { impressions: false, clicks: false, reach: false, purchases: false };
  for (const r of rows) {
    if (daysInside(r, fromDay, toDay) === 0) continue;
    covered = true;
    spend += spendInRange(r, fromDay, toDay);
    for (const m of METRICS) {
      const v = r[m];
      if (v == null) missing[m] = true;
      else sums[m] += spendInRange({ day: r.day, days: r.days, amount: v }, fromDay, toDay);
    }
  }
  if (!covered) return { spend: null, impressions: null, clicks: null, reach: null, purchases: null };
  const metric = (m: (typeof METRICS)[number]) => (missing[m] ? null : sums[m]);
  return { spend, impressions: metric("impressions"), clicks: metric("clicks"), reach: metric("reach"), purchases: metric("purchases") };
}

/** Whether a spend row belongs to the filter (names matched like the SQL). */
function spendMatches(r: SpendEntry, f: AdFilter | undefined): boolean {
  if (!f) return true;
  if (f.source != null && r.source !== normSource(f.source)) return false;
  if (f.campaign !== undefined && r.campaign !== normName(f.campaign)) return false;
  if (f.ad !== undefined && r.ad !== normName(f.ad)) return false;
  return true;
}

/** The key a spend row counts for at a level, or null when it does not reach that level (no campaign, no ad). */
function spendKey(r: SpendEntry, level: Level): string | null {
  if (level === "campaign" && r.campaign == null) return null;
  if (level === "ad" && r.ad == null) return null;
  return rowKey(level, r.source, r.campaign, r.ad);
}

// ------------------------------------------------------------------ rows

// pending is counted, not left to the engine's estimate (orders − confirmed − cancelled), which
// misses an order confirmed then cancelled and so reads the confirmation rate too low.
const emptyFunnel = (): Funnel => ({
  sessions: 0, visitors: 0, productViews: 0, formStarts: 0, orders: 0, confirmed: 0, cancelled: 0, shipped: 0, delivered: 0, back: 0, open: 0, pending: 0,
  revenuePlaced: 0, revenueDelivered: 0, productCostDelivered: 0, costUnknownDelivered: 0, units: 0, multiUnitOrders: 0, newCustomers: 0,
});

/** The order counts of a Funnel, shared by rows and breakdowns. */
const ORDER_COUNTS_SQL = Prisma.raw(`
  COUNT(*) AS orders,
  COUNT(*) FILTER (WHERE ${CONFIRMED_SQL}) AS confirmed,
  COUNT(*) FILTER (WHERE status = 'PENDING') AS pending,
  COUNT(*) FILTER (WHERE status = 'CANCELLED') AS cancelled,
  COUNT(*) FILTER (WHERE status IN ('SHIPPED','DELIVERED','REFUSED','RETURNED')) AS shipped,
  COUNT(*) FILTER (WHERE status = 'DELIVERED') AS delivered,
  COUNT(*) FILTER (WHERE status IN ('REFUSED','RETURNED')) AS back,
  COUNT(*) FILTER (WHERE status IN ('PENDING','CONFIRMED','SUPPLIER_ORDERED','SHIPPED')) AS open,
  COALESCE(SUM(total) FILTER (WHERE status = 'DELIVERED'), 0) AS rev_delivered`);

type OrderCounts = { orders: bigint; confirmed: bigint; pending: bigint; cancelled: bigint; shipped: bigint; delivered: bigint; back: bigint; open: bigint; rev_delivered: bigint };

/**
 * One row per source, campaign or ad of the period: visits from the events
 * (grouped by the visit's first-touch attribution), orders by the order's
 * attribution, and the platform's figures from the spend rows whose source,
 * campaign and ad match (case does not matter). A campaign that spent with no
 * visit carrying its name is still a row: that is a tracking problem to show.
 */
export async function adRows(from: Date, to: Date, level: Level, filter?: AdFilter): Promise<AdRow[]> {
  const ed = dimsSql(level, "s");
  const od = dimsSql(level, "o");
  type Dims = { src: string; camp: string | null; ad: string | null; camp_name: string | null; ad_name: string | null };
  const [visits, orders, spend] = await Promise.all([
    prisma.$queryRaw<(Dims & { sessions: bigint; visitors: bigint; views: bigint; starts: bigint })[]>`
      WITH ${sessionsCte(from, to)}
      SELECT ${ed.select}, MIN(btrim(s.campaign)) AS camp_name, MIN(btrim(s.content)) AS ad_name,
        COUNT(*) AS sessions, COUNT(DISTINCT s."visitorId") AS visitors,
        COUNT(*) FILTER (WHERE steps.viewed) AS views, COUNT(*) FILTER (WHERE steps.started) AS starts
      FROM s JOIN steps USING ("sessionId")
      WHERE true ${ed.need} ${filterSql(filter, "s")}
      GROUP BY ${ed.group}
      LIMIT 2000`,
    prisma.$queryRaw<(Dims & OrderCounts & { rev_placed: bigint; cost_delivered: bigint; cost_unknown: bigint; units: bigint; multi: bigint; new_customers: bigint })[]>`
      SELECT ${od.select}, MIN(btrim(o.campaign)) AS camp_name, MIN(btrim(o.content)) AS ad_name, ${ORDER_COUNTS_SQL},
        COALESCE(SUM(o.total) FILTER (WHERE o.status <> 'CANCELLED'), 0) AS rev_placed,
        COALESCE(SUM(o."costTotal") FILTER (WHERE o.status = 'DELIVERED' AND o."costTotal" IS NOT NULL), 0) AS cost_delivered,
        COUNT(*) FILTER (WHERE o.status = 'DELIVERED' AND o."costTotal" IS NULL) AS cost_unknown,
        COALESCE(SUM(u.units) FILTER (WHERE o.status <> 'CANCELLED'), 0) AS units,
        COUNT(*) FILTER (WHERE o.status <> 'CANCELLED' AND u.units > 1) AS multi,
        COUNT(*) FILTER (WHERE o.status <> 'CANCELLED' AND ${Prisma.raw(NEW_CUSTOMER_SQL)}) AS new_customers
      FROM "Order" o
      LEFT JOIN LATERAL (SELECT SUM(i.qty) AS units FROM "OrderItem" i WHERE i."orderId" = o.id) u ON true
      WHERE o."createdAt" >= ${from} AND o."createdAt" < ${to} AND ${Prisma.raw(`o.${NOT_ADMIN_SQL}`)} ${od.need} ${filterSql(filter, "o")}
      GROUP BY ${od.group}
      LIMIT 2000`,
    spendRows(from, to),
  ]);

  // Names are shown as typed: Ads Manager's spelling first, then the order's, then the visit's.
  type Names = { campaign: string | null; ad: string | null };
  const rows = new Map<string, AdRow & { names: { spend: Names; order: Names; visit: Names } }>();
  const rowFor = (src: string, camp: string | null, ad: string | null) => {
    const key = rowKey(level, src, camp, ad);
    let r = rows.get(key);
    if (!r) {
      const p = parseRowKey(key);
      const none = () => ({ campaign: null, ad: null });
      r = { level, key, source: p.source, campaign: p.campaign, ad: p.ad, funnel: emptyFunnel(), platform: { spend: null, impressions: null, clicks: null, reach: null, purchases: null }, names: { spend: none(), order: none(), visit: none() } };
      rows.set(key, r);
    }
    return r;
  };

  for (const v of visits) {
    const r = rowFor(v.src, v.camp, v.ad);
    const f = r.funnel;
    f.sessions += n(v.sessions);
    f.visitors += n(v.visitors);
    f.productViews += n(v.views);
    f.formStarts += n(v.starts);
    r.names.visit = { campaign: r.names.visit.campaign ?? v.camp_name, ad: r.names.visit.ad ?? v.ad_name };
  }
  for (const o of orders) {
    const r = rowFor(o.src, o.camp, o.ad);
    const f = r.funnel;
    f.orders += n(o.orders);
    f.confirmed += n(o.confirmed);
    f.cancelled += n(o.cancelled);
    f.pending = (f.pending ?? 0) + n(o.pending);
    f.shipped += n(o.shipped);
    f.delivered += n(o.delivered);
    f.back += n(o.back);
    f.open += n(o.open);
    f.revenuePlaced += n(o.rev_placed);
    f.revenueDelivered += n(o.rev_delivered);
    f.productCostDelivered += n(o.cost_delivered);
    f.costUnknownDelivered += n(o.cost_unknown);
    f.units += n(o.units);
    f.multiUnitOrders += n(o.multi);
    f.newCustomers += n(o.new_customers);
    r.names.order = { campaign: r.names.order.campaign ?? o.camp_name, ad: r.names.order.ad ?? o.ad_name };
  }

  // Spend: grouped by the row's key, then added up over the period.
  const fromDay = tunisDay(from);
  const toDay = tunisDay(to);
  const byKey = new Map<string, SpendEntry[]>();
  for (const s of spend) {
    if (!spendMatches(s, filter)) continue;
    const key = spendKey(s, level);
    if (!key || daysInside(s, fromDay, toDay) === 0) continue;
    byKey.set(key, [...(byKey.get(key) ?? []), s]);
  }
  for (const list of byKey.values()) {
    const first = list[0];
    const r = rowFor(first.source, first.campaign, first.ad);
    r.platform = platformOf(list, fromDay, toDay);
    r.names.spend = first.spelling;
  }

  return [...rows.values()]
    .map(({ names, ...r }) => ({
      ...r,
      campaign: r.campaign == null ? null : (names.spend.campaign ?? names.order.campaign ?? names.visit.campaign ?? r.campaign),
      ad: r.ad == null ? null : (names.spend.ad ?? names.order.ad ?? names.visit.ad ?? r.ad),
    }))
    .sort((a, b) => (b.platform.spend ?? -1) - (a.platform.spend ?? -1) || b.funnel.orders - a.funnel.orders || b.funnel.sessions - a.funnel.sessions);
}

// ------------------------------------------------------------------ baseline

/**
 * The shop's usual rates over the last 180 days (site orders only), to read
 * rows too young or too small to speak for themselves. Each rate is taken
 * over the orders where it is decided: confirmation over orders confirmed or
 * cancelled, delivery over parcels delivered or back, net delivery over
 * orders at least 14 days old.
 *
 * With the shop's costs, also what a delivered order leaves before ads
 * (marginPerDelivered, as kpis computes it for a row): the average delivered
 * order whose product cost is known, minus the carrier and return costs of
 * the parcels sent per delivered one. A row with no delivered order yet is
 * then judged on this margin instead of the account's average cost.
 */
export async function baseline(to: Date = new Date(), costs?: Costs): Promise<Baseline> {
  const since = new Date(to.getTime() - BASELINE_DAYS * DAY);
  const mature = new Date(to.getTime() - MATURE_DAYS * DAY);
  const [b] = await prisma.$queryRaw<
    {
      orders: bigint; confirmed: bigint; decided: bigint; delivered: bigint; back: bigint; mature: bigint; mature_delivered: bigint; placed: bigint; not_cancelled: bigint; days_to_deliver: number | null;
      costed: bigint; costed_revenue: bigint; costed_cost: bigint;
    }[]
  >`
    SELECT COUNT(*) AS orders,
      COUNT(*) FILTER (WHERE ${Prisma.raw(CONFIRMED_SQL)}) AS confirmed,
      COUNT(*) FILTER (WHERE ${Prisma.raw(CONFIRMED_SQL)} OR status = 'CANCELLED') AS decided,
      COUNT(*) FILTER (WHERE status = 'DELIVERED') AS delivered,
      COUNT(*) FILTER (WHERE status IN ('REFUSED','RETURNED')) AS back,
      COUNT(*) FILTER (WHERE "createdAt" < ${mature}) AS mature,
      COUNT(*) FILTER (WHERE "createdAt" < ${mature} AND status = 'DELIVERED') AS mature_delivered,
      COALESCE(SUM(total) FILTER (WHERE status <> 'CANCELLED'), 0) AS placed,
      COUNT(*) FILTER (WHERE status <> 'CANCELLED') AS not_cancelled,
      AVG(EXTRACT(EPOCH FROM ("deliveredAt" - "createdAt")) / 86400) FILTER (WHERE "deliveredAt" IS NOT NULL) AS days_to_deliver,
      COUNT(*) FILTER (WHERE status = 'DELIVERED' AND "costTotal" IS NOT NULL) AS costed,
      COALESCE(SUM(total) FILTER (WHERE status = 'DELIVERED' AND "costTotal" IS NOT NULL), 0) AS costed_revenue,
      COALESCE(SUM("costTotal") FILTER (WHERE status = 'DELIVERED' AND "costTotal" IS NOT NULL), 0) AS costed_cost
    FROM "Order" o
    WHERE "createdAt" >= ${since} AND "createdAt" < ${to} AND ${Prisma.raw(`o.${NOT_ADMIN_SQL}`)}`;
  const rate = (a: bigint, d: bigint) => (n(d) > 0 ? n(a) / n(d) : null);
  const deliveryRate = n(b.delivered) + n(b.back) > 0 ? n(b.delivered) / (n(b.delivered) + n(b.back)) : null;
  const costed = n(b.costed);
  return {
    orders: n(b.orders),
    confirmRate: rate(b.confirmed, b.decided),
    deliveryRate,
    netDeliveryRate: rate(b.mature_delivered, b.mature),
    aov: n(b.not_cancelled) > 0 ? Math.round(n(b.placed) / n(b.not_cancelled)) : null,
    daysToDeliver: b.days_to_deliver == null ? null : Math.round(Number(b.days_to_deliver) * 10) / 10,
    // Null: no delivered order with a known product cost, or a carrier or return cost not given.
    marginPerDelivered:
      costs && costed > 0
        ? unitMargin({ revenue: n(b.costed_revenue) / costed, productCost: n(b.costed_cost) / costed, carrierPerParcel: costs.carrierPerParcel, returnPerParcel: costs.returnPerParcel, deliveryRate })
        : null,
  };
}

/** The shop's own costs from the settings (null: not given yet). */
export async function adCosts(): Promise<Costs> {
  const s = await getSettings();
  return { carrierPerParcel: s.costs.carrierPerParcel, returnPerParcel: s.costs.returnPerParcel };
}

// ------------------------------------------------------------------ days

/** Tunisian calendar days of [from, to). */
function daysBetween(from: Date, to: Date): string[] {
  const out: string[] = [];
  for (let t = from.getTime(); t < to.getTime(); t += DAY) out.push(tunisDay(new Date(t)));
  return out;
}

/**
 * Each day of the period for every row of a level: platform figures (a
 * weekly spend row spread evenly over its days; null on a day no spend row
 * covers), visits by the day they started, orders placed and, among them,
 * those delivered since. For creative fatigue and pacing.
 */
export async function dailyByRow(from: Date, to: Date, level: Level, filter?: AdFilter): Promise<Record<string, DayPoint[]>> {
  const ed = dimsSql(level, "s");
  const od = dimsSql(level, "o");
  const day = (col: string) => Prisma.raw(`to_char(${tunisSql(col)}::date, 'YYYY-MM-DD')`);
  type Dims = { src: string; camp: string | null; ad: string | null; day: string };
  const [visits, orders, spend] = await Promise.all([
    prisma.$queryRaw<(Dims & { sessions: bigint })[]>`
      WITH ${sessionsCte(from, to)}
      SELECT ${ed.select}, ${day(`s."createdAt"`)} AS day, COUNT(*) AS sessions
      FROM s WHERE true ${ed.need} ${filterSql(filter, "s")}
      GROUP BY ${ed.group}, day`,
    prisma.$queryRaw<(Dims & { orders: bigint; delivered: bigint })[]>`
      SELECT ${od.select}, ${day(`o."createdAt"`)} AS day, COUNT(*) AS orders, COUNT(*) FILTER (WHERE o.status = 'DELIVERED') AS delivered
      FROM "Order" o
      WHERE o."createdAt" >= ${from} AND o."createdAt" < ${to} AND ${Prisma.raw(`o.${NOT_ADMIN_SQL}`)} ${od.need} ${filterSql(filter, "o")}
      GROUP BY ${od.group}, day`,
    spendRows(from, to),
  ]);
  const days = daysBetween(from, to);
  const index = new Map(days.map((d, i) => [d, i]));
  const series = new Map<string, DayPoint[]>();
  const seriesFor = (key: string) => {
    let s = series.get(key);
    if (!s) {
      s = days.map((d) => ({ day: d, spend: null, impressions: null, clicks: null, sessions: 0, orders: 0, delivered: 0 }));
      series.set(key, s);
    }
    return s;
  };
  for (const v of visits) {
    const i = index.get(v.day);
    if (i != null) seriesFor(rowKey(level, v.src, v.camp, v.ad))[i].sessions += n(v.sessions);
  }
  for (const o of orders) {
    const i = index.get(o.day);
    if (i == null) continue;
    const p = seriesFor(rowKey(level, o.src, o.camp, o.ad))[i];
    p.orders += n(o.orders);
    p.delivered += n(o.delivered);
  }
  // Per day and key: the covering rows' share of that day; a count is null when one covering row lacks it.
  const missing = new Map<string, Set<"impressions" | "clicks">>();
  for (const s of spend) {
    if (!spendMatches(s, filter)) continue;
    const key = spendKey(s, level);
    if (!key) continue;
    for (let k = 0; k < s.days; k++) {
      const d = new Date(Date.parse(`${s.day}T00:00:00Z`) + k * DAY).toISOString().slice(0, 10);
      const i = index.get(d);
      if (i == null) continue;
      const next = new Date(Date.parse(`${d}T00:00:00Z`) + DAY).toISOString().slice(0, 10);
      const p = seriesFor(key)[i];
      p.spend = (p.spend ?? 0) + spendInRange(s, d, next);
      for (const m of ["impressions", "clicks"] as const) {
        const v = s[m];
        const gap = `${key}\u0000${d}`;
        if (v == null) {
          missing.set(gap, (missing.get(gap) ?? new Set()).add(m));
          p[m] = null;
        } else if (!missing.get(gap)?.has(m)) {
          p[m] = (p[m] ?? 0) + spendInRange({ day: s.day, days: s.days, amount: v }, d, next);
        }
      }
    }
  }
  return Object.fromEntries(series);
}

/** The days of one row (a key from adRows). A row with nothing in the period gets its days with zeros and no spend. */
export async function daily(from: Date, to: Date, key: string): Promise<DayPoint[]> {
  const p = parseRowKey(key);
  const filter: AdFilter = { source: p.source, ...(p.level !== "source" ? { campaign: p.campaign } : {}), ...(p.level === "ad" ? { ad: p.ad } : {}) };
  const all = await dailyByRow(from, to, p.level, filter);
  return all[key] ?? daysBetween(from, to).map((d) => ({ day: d, spend: null, impressions: null, clicks: null, sessions: 0, orders: 0, delivered: 0 }));
}

// ------------------------------------------------------------------ audience

/** Orders of one governorate, device, hour or weekday: the order part of a Funnel, plus visits where they are known. */
export type BreakdownRow = {
  /** Governorate name, device ("mobile", "desktop", "tablet", "inconnu"), hour "0"–"23" (Tunis time) or ISO weekday "1" (Monday)–"7". */
  key: string;
  /** Visits that started there. Null for governorates: a visit has no address. */
  sessions: number | null;
  orders: number;
  confirmed: number;
  /** Not called or not reached yet: confirmation is undecided for them. */
  pending: number;
  cancelled: number;
  shipped: number;
  delivered: number;
  back: number;
  open: number;
  revenueDelivered: number;
};

/** Confirmation calls by the hour they were made (Tunis time): when customers pick up. */
export type CallHour = {
  hour: number;
  calls: number;
  /** The customer answered: confirmed, cancelled or asked to be called back. */
  reached: number;
  confirmed: number;
};

export type Breakdowns = { governorate: BreakdownRow[]; device: BreakdownRow[]; hour: BreakdownRow[]; weekday: BreakdownRow[]; callHours: CallHour[] };

/**
 * Orders of the period by governorate, device, hour and weekday of the order
 * (and visits for the last three), plus confirmation calls by hour. Every hour
 * and weekday is listed, with its measured zero; governorates and devices
 * only where something happened.
 */
export async function breakdowns(from: Date, to: Date, filter?: AdFilter): Promise<Breakdowns> {
  const hour = (col: string) => `EXTRACT(HOUR FROM ${tunisSql(col)})::int::text`;
  const dow = (col: string) => `EXTRACT(ISODOW FROM ${tunisSql(col)})::int::text`;
  const [orders, visits, calls] = await Promise.all([
    prisma.$queryRaw<(OrderCounts & { dim: string; val: string })[]>`
      SELECT d.dim, d.val, ${ORDER_COUNTS_SQL}
      FROM "Order" o
      CROSS JOIN LATERAL (VALUES ('governorate', o.governorate), ('device', COALESCE(o.device, 'inconnu')),
        ('hour', ${Prisma.raw(hour(`o."createdAt"`))}), ('weekday', ${Prisma.raw(dow(`o."createdAt"`))})) AS d(dim, val)
      WHERE o."createdAt" >= ${from} AND o."createdAt" < ${to} AND ${Prisma.raw(`o.${NOT_ADMIN_SQL}`)} ${filterSql(filter, "o")}
      GROUP BY 1, 2`,
    prisma.$queryRaw<{ dim: string; val: string; sessions: bigint }[]>`
      WITH ${sessionsCte(from, to)}
      SELECT d.dim, d.val, COUNT(*) AS sessions
      FROM s CROSS JOIN LATERAL (VALUES ('device', COALESCE(s.device, 'inconnu')),
        ('hour', ${Prisma.raw(hour(`s."createdAt"`))}), ('weekday', ${Prisma.raw(dow(`s."createdAt"`))})) AS d(dim, val)
      WHERE true ${filterSql(filter, "s")}
      GROUP BY 1, 2`,
    prisma.$queryRaw<{ h: number; calls: bigint; reached: bigint; confirmed: bigint }[]>`
      SELECT EXTRACT(HOUR FROM ${Prisma.raw(tunisSql(`c."createdAt"`))})::int AS h, COUNT(*) AS calls,
        COUNT(*) FILTER (WHERE c.outcome IN ('CONFIRMED', 'CALL_BACK', 'CANCELLED_BY_CUSTOMER')) AS reached,
        COUNT(*) FILTER (WHERE c.outcome = 'CONFIRMED') AS confirmed
      FROM "OrderCall" c JOIN "Order" o ON o.id = c."orderId"
      WHERE c."createdAt" >= ${from} AND c."createdAt" < ${to} AND ${Prisma.raw(`o.${NOT_ADMIN_SQL}`)} ${filterSql(filter, "o")}
      GROUP BY 1`,
  ]);
  const sessions = new Map(visits.map((v) => [`${v.dim}\u0000${v.val}`, n(v.sessions)]));
  const empty = (dim: string, key: string): BreakdownRow => ({ key, sessions: dim === "governorate" ? null : (sessions.get(`${dim}\u0000${key}`) ?? 0), orders: 0, confirmed: 0, pending: 0, cancelled: 0, shipped: 0, delivered: 0, back: 0, open: 0, revenueDelivered: 0 });
  const by = (dim: string) => {
    const m = new Map<string, BreakdownRow>();
    for (const o of orders.filter((x) => x.dim === dim)) {
      m.set(o.val, { ...empty(dim, o.val), orders: n(o.orders), confirmed: n(o.confirmed), pending: n(o.pending), cancelled: n(o.cancelled), shipped: n(o.shipped), delivered: n(o.delivered), back: n(o.back), open: n(o.open), revenueDelivered: n(o.rev_delivered) });
    }
    return m;
  };
  const gov = by("governorate");
  const dev = by("device");
  for (const v of visits) if (v.dim === "device" && !dev.has(v.val)) dev.set(v.val, empty("device", v.val));
  const hours = by("hour");
  const days = by("weekday");
  const callMap = new Map(calls.map((c) => [c.h, c]));
  const DEVICE_ORDER = ["mobile", "desktop", "tablet", "inconnu"];
  return {
    governorate: [...gov.values()].sort((a, b) => b.orders - a.orders),
    device: [...dev.values()].sort((a, b) => (DEVICE_ORDER.indexOf(a.key) + 1 || 99) - (DEVICE_ORDER.indexOf(b.key) + 1 || 99)),
    hour: Array.from({ length: 24 }, (_, h) => hours.get(String(h)) ?? empty("hour", String(h))),
    weekday: Array.from({ length: 7 }, (_, d) => days.get(String(d + 1)) ?? empty("weekday", String(d + 1))),
    callHours: Array.from({ length: 24 }, (_, h) => {
      const c = callMap.get(h);
      return { hour: h, calls: n(c?.calls), reached: n(c?.reached), confirmed: n(c?.confirmed) };
    }),
  };
}

// ------------------------------------------------------------------ customers

/** Revenue of the customers acquired in the period, `days` after their first order, among those acquired at least that long ago. */
export type LtvPoint = {
  days: (typeof LTV_DAYS)[number];
  /** Customers whose first order is at least `days` old: the ones this horizon can be measured on. */
  customers: number;
  /** Their delivered orders placed within `days` of the first one (the first included). */
  deliveredOrders: number;
  /** Totals of those orders. */
  revenue: number;
  /** revenue / customers; null when no customer is old enough. */
  perCustomer: number | null;
};

export type Cohort = {
  /** Source of the customer's first order (as matched). */
  source: string;
  /** Customers whose first order (not cancelled) was placed in the period. */
  customers: number;
  /** Among them, those who ordered again since (any channel, cancelled orders aside). */
  repeaters: number;
  repeatRate: number | null;
  ltv: LtvPoint[];
};

export type CustomerGrowth = {
  /** Site orders of the period (cancelled aside) by the order's source: from new customers and from returning ones. */
  bySource: { source: string; orders: number; fromNew: number; fromReturning: number; customers: number }[];
  /** Customers acquired in the period, by the source of their first order. */
  cohorts: Cohort[];
  /** All sources together. */
  total: Omit<Cohort, "source">;
  /** Customers of the period whose first order was typed in the back office: no traffic source, left out of the cohorts. */
  backOffice: number;
};

/**
 * New against returning customers, and what a customer is worth after 30, 60
 * and 90 days by the source that brought them: every count is a real phone
 * number and a real delivered order. A customer is a phone number; "new" means
 * no earlier order from it (cancelled ones aside), whatever the channel.
 */
export async function customerGrowth(from: Date, to: Date, filter?: AdFilter, now: Date = new Date()): Promise<CustomerGrowth> {
  const cut = Object.fromEntries(LTV_DAYS.map((d) => [d, new Date(now.getTime() - d * DAY)])) as Record<(typeof LTV_DAYS)[number], Date>;
  const [bySource, cohorts] = await Promise.all([
    prisma.$queryRaw<{ src: string; orders: bigint; from_new: bigint; customers: bigint }[]>`
      SELECT ${Prisma.raw(sourceSql("o.source"))} AS src, COUNT(*) AS orders,
        COUNT(*) FILTER (WHERE ${Prisma.raw(NEW_CUSTOMER_SQL)}) AS from_new, COUNT(DISTINCT o.phone) AS customers
      FROM "Order" o
      WHERE o."createdAt" >= ${from} AND o."createdAt" < ${to} AND o.status <> 'CANCELLED' AND ${Prisma.raw(`o.${NOT_ADMIN_SQL}`)} ${filterSql(filter, "o")}
      GROUP BY 1 ORDER BY 2 DESC LIMIT 200`,
    prisma.$queryRaw<
      { src: string | null; customers: bigint; repeaters: bigint; m30: bigint; o30: bigint; r30: bigint; m60: bigint; o60: bigint; r60: bigint; m90: bigint; o90: bigint; r90: bigint }[]
    >`
      WITH firsts AS (
        SELECT o.id, o.phone, o."createdAt" AS at, o.device, o.source, o.medium, o.campaign, o.content
        FROM "Order" o
        WHERE o."createdAt" >= ${from} AND o."createdAt" < ${to} AND o.status <> 'CANCELLED' AND ${Prisma.raw(NEW_CUSTOMER_SQL)} ${filterSql(filter, "o")}
      ), c AS (
        SELECT f.at, f.device, f.source, x.*
        FROM firsts f CROSS JOIN LATERAL (
          SELECT COUNT(*) FILTER (WHERE p.id <> f.id AND p.status <> 'CANCELLED') AS later,
            COUNT(*) FILTER (WHERE p.status = 'DELIVERED' AND p."createdAt" < f.at + interval '30 days') AS o30,
            COALESCE(SUM(p.total) FILTER (WHERE p.status = 'DELIVERED' AND p."createdAt" < f.at + interval '30 days'), 0) AS r30,
            COUNT(*) FILTER (WHERE p.status = 'DELIVERED' AND p."createdAt" < f.at + interval '60 days') AS o60,
            COALESCE(SUM(p.total) FILTER (WHERE p.status = 'DELIVERED' AND p."createdAt" < f.at + interval '60 days'), 0) AS r60,
            COUNT(*) FILTER (WHERE p.status = 'DELIVERED' AND p."createdAt" < f.at + interval '90 days') AS o90,
            COALESCE(SUM(p.total) FILTER (WHERE p.status = 'DELIVERED' AND p."createdAt" < f.at + interval '90 days'), 0) AS r90
          FROM "Order" p WHERE p.phone = f.phone AND p."createdAt" >= f.at
        ) x
      )
      SELECT CASE WHEN device = 'admin' THEN NULL ELSE ${Prisma.raw(sourceSql("c.source"))} END AS src,
        COUNT(*) AS customers, COUNT(*) FILTER (WHERE later > 0) AS repeaters,
        COUNT(*) FILTER (WHERE at <= ${cut[30]}) AS m30, COALESCE(SUM(o30) FILTER (WHERE at <= ${cut[30]}), 0) AS o30, COALESCE(SUM(r30) FILTER (WHERE at <= ${cut[30]}), 0) AS r30,
        COUNT(*) FILTER (WHERE at <= ${cut[60]}) AS m60, COALESCE(SUM(o60) FILTER (WHERE at <= ${cut[60]}), 0) AS o60, COALESCE(SUM(r60) FILTER (WHERE at <= ${cut[60]}), 0) AS r60,
        COUNT(*) FILTER (WHERE at <= ${cut[90]}) AS m90, COALESCE(SUM(o90) FILTER (WHERE at <= ${cut[90]}), 0) AS o90, COALESCE(SUM(r90) FILTER (WHERE at <= ${cut[90]}), 0) AS r90
      FROM c GROUP BY 1`,
  ]);

  const FIELDS = ["customers", "repeaters", "m30", "o30", "r30", "m60", "o60", "r60", "m90", "o90", "r90"] as const;
  type Counts = Record<(typeof FIELDS)[number], number>;
  const counts = (c: (typeof cohorts)[number]) => Object.fromEntries(FIELDS.map((k) => [k, n(c[k])])) as Counts;
  const cohort = (c: Counts): Omit<Cohort, "source"> => {
    const point = (days: (typeof LTV_DAYS)[number], m: number, o: number, r: number): LtvPoint => ({ days, customers: m, deliveredOrders: o, revenue: r, perCustomer: m > 0 ? Math.round(r / m) : null });
    return {
      customers: c.customers,
      repeaters: c.repeaters,
      repeatRate: c.customers > 0 ? c.repeaters / c.customers : null,
      ltv: [point(30, c.m30, c.o30, c.r30), point(60, c.m60, c.o60, c.r60), point(90, c.m90, c.o90, c.r90)],
    };
  };
  const site = cohorts.filter((c) => c.src != null).map((c) => ({ source: c.src!, ...counts(c) }));
  // Each customer has one first order, so the sources add up exactly.
  const sum = Object.fromEntries(FIELDS.map((k) => [k, site.reduce((t, c) => t + c[k], 0)])) as Counts;
  return {
    bySource: bySource.map((s) => ({ source: s.src, orders: n(s.orders), fromNew: n(s.from_new), fromReturning: n(s.orders) - n(s.from_new), customers: n(s.customers) })),
    cohorts: site.map((c) => ({ source: c.source, ...cohort(c) })).sort((a, b) => b.customers - a.customers),
    total: cohort(sum),
    backOffice: n(cohorts.find((c) => c.src == null)?.customers),
  };
}

// ------------------------------------------------------------------ import preview

/**
 * Campaign and ad keys the site has seen in the period (orders and visits),
 * so the import preview can say which exported rows will meet real traffic.
 */
export async function knownKeys(from: Date, to: Date): Promise<{ campaigns: string[]; ads: string[] }> {
  const rows = await prisma.$queryRaw<{ src: string; camp: string | null; ad: string | null }[]>`
    SELECT DISTINCT ${Prisma.raw(sourceSql("o.source"))} AS src, ${Prisma.raw(nameSql("o.campaign"))} AS camp, ${Prisma.raw(nameSql("o.content"))} AS ad
    FROM "Order" o WHERE o."createdAt" >= ${from} AND o."createdAt" < ${to} AND ${Prisma.raw(`o.${NOT_ADMIN_SQL}`)} AND (o.campaign IS NOT NULL OR o.content IS NOT NULL)
    UNION
    SELECT DISTINCT ${Prisma.raw(sourceSql("e.source"))}, ${Prisma.raw(nameSql("e.campaign"))}, ${Prisma.raw(nameSql("e.content"))}
    FROM "AnalyticsEvent" e WHERE e.name = 'page_view' AND e."createdAt" >= ${from} AND e."createdAt" < ${to} AND (e.campaign IS NOT NULL OR e.content IS NOT NULL)
    LIMIT 5000`;
  const campaigns = new Set<string>();
  const ads = new Set<string>();
  for (const r of rows) {
    if (r.camp) campaigns.add(rowKey("campaign", r.src, r.camp));
    if (r.ad) ads.add(rowKey("ad", r.src, r.camp, r.ad));
  }
  return { campaigns: [...campaigns], ads: [...ads] };
}
