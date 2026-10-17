import "server-only";
import { prisma } from "./prisma";
import { daysOf, tunisDay, type Range } from "./analytics-range";
import { abandonedCarts } from "./abandoned";
import { getSettings } from "./settings";
import { profit, spendInRange } from "./profit";

/**
 * Everything the analytics dashboard reads. Three rules, held throughout:
 *
 *  1. Every query is bounded by the chosen date range (and LIMIT for lists).
 *  2. Aggregation happens in Postgres, never by loading rows into JavaScript.
 *  3. Only real data: a metric with nothing behind it is returned empty and
 *     the page says so, rather than drawing a zero that looks like a result.
 *
 * Days are Tunisian calendar days. Raw SQL where date_trunc, COUNT(DISTINCT)
 * and FILTER are needed; every value is bound by Prisma's tagged template.
 */

const n = (v: unknown) => (v == null ? 0 : typeof v === "bigint" ? Number(v) : Number(v));
const TZ = "Africa/Tunis";

/** Order statuses that passed the phone confirmation. */
const CONFIRMED_SQL = `('CONFIRMED','SUPPLIER_ORDERED','SHIPPED','DELIVERED','REFUSED','RETURNED')`;

export type Kpis = {
  visitors: number;
  sessions: number;
  orders: number;
  confirmed: number;
  delivered: number;
  refused: number;
  cancelled: number;
  /** Placed, not cancelled. */
  bookedRevenue: number;
  deliveredRevenue: number;
  /** Delivered: subtotal − discount − supplier cost, over orders whose cost is known. */
  deliveredMargin: number;
  marginKnownOrders: number;
  aov: number | null;
  pending: number;
};

async function kpis(from: Date, to: Date): Promise<Kpis> {
  const [ev] = await prisma.$queryRaw<{ visitors: bigint; sessions: bigint }[]>`
    SELECT COUNT(DISTINCT "visitorId") AS visitors, COUNT(DISTINCT "sessionId") AS sessions
    FROM "AnalyticsEvent" WHERE name = 'page_view' AND "createdAt" >= ${from} AND "createdAt" < ${to}`;
  const [o] = await prisma.$queryRawUnsafe<Record<string, bigint | number | null>[]>(
    `SELECT COUNT(*) AS orders,
       COUNT(*) FILTER (WHERE status IN ${CONFIRMED_SQL}) AS confirmed,
       COUNT(*) FILTER (WHERE status IN ('DELIVERED','RETURNED')) AS delivered,
       COUNT(*) FILTER (WHERE status = 'REFUSED') AS refused,
       COUNT(*) FILTER (WHERE status = 'CANCELLED') AS cancelled,
       COUNT(*) FILTER (WHERE status = 'PENDING') AS pending,
       COALESCE(SUM(total) FILTER (WHERE status <> 'CANCELLED'), 0) AS booked,
       COALESCE(SUM(total) FILTER (WHERE status = 'DELIVERED'), 0) AS delivered_rev,
       COALESCE(SUM(subtotal - discount - "costTotal") FILTER (WHERE status = 'DELIVERED' AND "costTotal" IS NOT NULL), 0) AS margin,
       COUNT(*) FILTER (WHERE status = 'DELIVERED' AND "costTotal" IS NOT NULL) AS margin_n
     FROM "Order" WHERE "createdAt" >= $1 AND "createdAt" < $2`,
    from,
    to,
  );
  const notCancelled = n(o.orders) - n(o.cancelled);
  return {
    visitors: n(ev.visitors),
    sessions: n(ev.sessions),
    orders: n(o.orders),
    confirmed: n(o.confirmed),
    delivered: n(o.delivered),
    refused: n(o.refused),
    cancelled: n(o.cancelled),
    pending: n(o.pending),
    bookedRevenue: n(o.booked),
    deliveredRevenue: n(o.delivered_rev),
    deliveredMargin: n(o.margin),
    marginKnownOrders: n(o.margin_n),
    aov: notCancelled > 0 ? Math.round(n(o.booked) / notCancelled) : null,
  };
}

export type DayRow = { day: string; sessions: number; orders: number; confirmed: number; revenue: number };

async function daily(r: Range): Promise<DayRow[]> {
  const [ev, ord] = await Promise.all([
    prisma.$queryRaw<{ day: string; sessions: bigint }[]>`
      SELECT to_char(date_trunc('day', "createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${TZ}), 'YYYY-MM-DD') AS day, COUNT(DISTINCT "sessionId") AS sessions
      FROM "AnalyticsEvent" WHERE name = 'page_view' AND "createdAt" >= ${r.from} AND "createdAt" < ${r.to}
      GROUP BY 1`,
    prisma.$queryRawUnsafe<{ day: string; orders: bigint; confirmed: bigint; revenue: bigint }[]>(
      `SELECT to_char(date_trunc('day', "createdAt" AT TIME ZONE 'UTC' AT TIME ZONE '${TZ}'), 'YYYY-MM-DD') AS day,
         COUNT(*) FILTER (WHERE status <> 'CANCELLED') AS orders,
         COUNT(*) FILTER (WHERE status IN ${CONFIRMED_SQL}) AS confirmed,
         COALESCE(SUM(total) FILTER (WHERE status <> 'CANCELLED'), 0) AS revenue
       FROM "Order" WHERE "createdAt" >= $1 AND "createdAt" < $2 GROUP BY 1`,
      r.from,
      r.to,
    ),
  ]);
  const e = new Map(ev.map((x) => [x.day, n(x.sessions)]));
  const o = new Map(ord.map((x) => [x.day, x]));
  return daysOf(r).map((day) => ({ day, sessions: e.get(day) ?? 0, orders: n(o.get(day)?.orders), confirmed: n(o.get(day)?.confirmed), revenue: n(o.get(day)?.revenue) }));
}

export type FunnelStep = { key: string; step: string; count: number };

/** Visits → product page → order form started → phone typed (sessions, from events) → order → confirmed → delivered (orders). */
async function funnel(from: Date, to: Date, k: Kpis): Promise<FunnelStep[]> {
  const [f] = await prisma.$queryRaw<{ visits: bigint; product: bigint; checkout: bigint; phone: bigint }[]>`
    SELECT COUNT(DISTINCT "sessionId") FILTER (WHERE name = 'page_view') AS visits,
      COUNT(DISTINCT "sessionId") FILTER (WHERE name = 'product_viewed') AS product,
      COUNT(DISTINCT "sessionId") FILTER (WHERE name = 'checkout_started') AS checkout,
      COUNT(DISTINCT "sessionId") FILTER (WHERE name = 'checkout_phone_entered') AS phone
    FROM "AnalyticsEvent" WHERE "createdAt" >= ${from} AND "createdAt" < ${to} AND "sessionId" <> 'server'`;
  return [
    { key: "visits", step: "Visites", count: n(f.visits) },
    { key: "product", step: "Fiche produit vue", count: n(f.product) },
    { key: "checkout", step: "Formulaire commencé", count: n(f.checkout) },
    { key: "phone", step: "Téléphone saisi", count: n(f.phone) },
    { key: "order", step: "Commande passée", count: k.orders },
    { key: "confirmed", step: "Confirmée", count: k.confirmed },
    { key: "delivered", step: "Livrée", count: k.delivered },
  ];
}

export type SourceRow = { source: string; campaign?: string | null; sessions: number; orders: number; confirmed: number; delivered: number; refused: number; revenue: number };

async function bySource(from: Date, to: Date, withCampaign: boolean): Promise<SourceRow[]> {
  const sessions = withCampaign
    ? await prisma.$queryRaw<{ source: string; campaign: string | null; sessions: bigint }[]>`
        SELECT COALESCE(source, 'direct') AS source, campaign, COUNT(DISTINCT "sessionId") AS sessions
        FROM "AnalyticsEvent" WHERE name = 'page_view' AND "createdAt" >= ${from} AND "createdAt" < ${to} AND campaign IS NOT NULL
        GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 100`
    : await prisma.$queryRaw<{ source: string; campaign: null; sessions: bigint }[]>`
        SELECT COALESCE(source, 'direct') AS source, NULL AS campaign, COUNT(DISTINCT "sessionId") AS sessions
        FROM "AnalyticsEvent" WHERE name = 'page_view' AND "createdAt" >= ${from} AND "createdAt" < ${to}
        GROUP BY 1 ORDER BY 3 DESC LIMIT 50`;
  const orders = await prisma.$queryRawUnsafe<{ source: string; campaign: string | null; orders: bigint; confirmed: bigint; delivered: bigint; refused: bigint; revenue: bigint }[]>(
    `SELECT COALESCE(source, 'direct') AS source, ${withCampaign ? "campaign" : "NULL"} AS campaign,
       COUNT(*) FILTER (WHERE status <> 'CANCELLED') AS orders,
       COUNT(*) FILTER (WHERE status IN ${CONFIRMED_SQL}) AS confirmed,
       COUNT(*) FILTER (WHERE status IN ('DELIVERED','RETURNED')) AS delivered,
       COUNT(*) FILTER (WHERE status = 'REFUSED') AS refused,
       COALESCE(SUM(total) FILTER (WHERE status = 'DELIVERED'), 0) AS revenue
     FROM "Order" WHERE "createdAt" >= $1 AND "createdAt" < $2 ${withCampaign ? "AND campaign IS NOT NULL" : ""}
     GROUP BY 1, 2 LIMIT 200`,
    from,
    to,
  );
  const key = (s: string, c: string | null) => `${s}|${c ?? ""}`;
  const map = new Map<string, SourceRow>();
  for (const s of sessions) map.set(key(s.source, s.campaign), { source: s.source, campaign: s.campaign, sessions: n(s.sessions), orders: 0, confirmed: 0, delivered: 0, refused: 0, revenue: 0 });
  for (const o of orders) {
    const k = key(o.source, o.campaign);
    const row = map.get(k) ?? { source: o.source, campaign: o.campaign, sessions: 0, orders: 0, confirmed: 0, delivered: 0, refused: 0, revenue: 0 };
    Object.assign(row, { orders: n(o.orders), confirmed: n(o.confirmed), delivered: n(o.delivered), refused: n(o.refused), revenue: n(o.revenue) });
    map.set(k, row);
  }
  return [...map.values()].sort((a, b) => b.orders - a.orders || b.sessions - a.sessions);
}

export type DeviceRow = { device: string; sessions: number; orders: number; revenue: number };

async function byDevice(from: Date, to: Date): Promise<DeviceRow[]> {
  const [s, o] = await Promise.all([
    prisma.$queryRaw<{ device: string; sessions: bigint }[]>`
      SELECT COALESCE(device, 'inconnu') AS device, COUNT(DISTINCT "sessionId") AS sessions
      FROM "AnalyticsEvent" WHERE name = 'page_view' AND "createdAt" >= ${from} AND "createdAt" < ${to} GROUP BY 1`,
    prisma.$queryRaw<{ device: string; orders: bigint; revenue: bigint }[]>`
      SELECT COALESCE(device, 'inconnu') AS device, COUNT(*) FILTER (WHERE status <> 'CANCELLED') AS orders,
        COALESCE(SUM(total) FILTER (WHERE status <> 'CANCELLED'), 0) AS revenue
      FROM "Order" WHERE "createdAt" >= ${from} AND "createdAt" < ${to} GROUP BY 1`,
  ]);
  const order = ["mobile", "desktop", "tablet", "inconnu"];
  const rows = new Map<string, DeviceRow>();
  for (const x of s) rows.set(x.device, { device: x.device, sessions: n(x.sessions), orders: 0, revenue: 0 });
  for (const x of o) rows.set(x.device, { ...(rows.get(x.device) ?? { device: x.device, sessions: 0 }), orders: n(x.orders), revenue: n(x.revenue) });
  return [...rows.values()].sort((a, b) => order.indexOf(a.device) - order.indexOf(b.device));
}

export type ProductRow = { id: string; name: string; views: number; forms: number; units: number; orders: number; revenue: number };

async function products(from: Date, to: Date): Promise<ProductRow[]> {
  const rows = await prisma.$queryRaw<{ id: string; name: string; views: bigint; forms: bigint; units: bigint; orders: bigint; revenue: bigint }[]>`
    WITH ev AS (
      SELECT "productId" AS id,
        COUNT(DISTINCT "sessionId") FILTER (WHERE name = 'product_viewed') AS views,
        COUNT(DISTINCT "sessionId") FILTER (WHERE name = 'checkout_started') AS forms
      FROM "AnalyticsEvent"
      WHERE "productId" IS NOT NULL AND name IN ('product_viewed', 'checkout_started') AND "createdAt" >= ${from} AND "createdAt" < ${to}
      GROUP BY 1
    ), sold AS (
      SELECT i."productId" AS id, SUM(i.qty) AS units, COUNT(DISTINCT i."orderId") AS orders, SUM(i."lineTotal") AS revenue
      FROM "OrderItem" i JOIN "Order" o ON o.id = i."orderId"
      WHERE i."productId" IS NOT NULL AND o.status <> 'CANCELLED' AND o."createdAt" >= ${from} AND o."createdAt" < ${to}
      GROUP BY 1
    )
    SELECT p.id, p.name, COALESCE(ev.views, 0) AS views, COALESCE(ev.forms, 0) AS forms,
      COALESCE(sold.units, 0) AS units, COALESCE(sold.orders, 0) AS orders, COALESCE(sold.revenue, 0) AS revenue
    FROM "Product" p LEFT JOIN ev ON ev.id = p.id LEFT JOIN sold ON sold.id = p.id
    WHERE ev.id IS NOT NULL OR sold.id IS NOT NULL
    ORDER BY revenue DESC, views DESC
    LIMIT 100`;
  return rows.map((r) => ({ id: r.id, name: r.name, views: n(r.views), forms: n(r.forms), units: n(r.units), orders: n(r.orders), revenue: n(r.revenue) }));
}

export type SearchRow = { q: string; count: number; results: number };

async function searches(from: Date, to: Date) {
  const rows = await prisma.$queryRaw<{ q: string; count: bigint; results: number | null }[]>`
    SELECT lower(props->>'q') AS q, COUNT(*) AS count,
      (array_agg((props->>'results')::int ORDER BY "createdAt" DESC))[1] AS results
    FROM "AnalyticsEvent"
    WHERE name = 'search' AND "createdAt" >= ${from} AND "createdAt" < ${to} AND props ? 'q'
    GROUP BY 1 ORDER BY 2 DESC LIMIT 200`;
  const all = rows.map((r) => ({ q: r.q, count: n(r.count), results: n(r.results) }));
  return { top: all.filter((r) => r.results > 0).slice(0, 15), none: all.filter((r) => r.results === 0).slice(0, 30), total: all.reduce((s, r) => s + r.count, 0) };
}

/** Categories opened (from the home cards, the menu or a link): visits and distinct visitors, most opened first. */
async function categories(from: Date, to: Date) {
  const rows = await prisma.$queryRaw<{ slug: string; name: string | null; views: bigint; visitors: bigint }[]>`
    SELECT ev.slug, c.name, COUNT(*) AS views, COUNT(DISTINCT ev."visitorId") AS visitors
    FROM (SELECT props->>'slug' AS slug, "visitorId" FROM "AnalyticsEvent"
          WHERE name = 'category_viewed' AND "createdAt" >= ${from} AND "createdAt" < ${to} AND props ? 'slug') ev
    LEFT JOIN "Category" c ON c.slug = ev.slug
    GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 30`;
  return rows.map((r) => ({ slug: r.slug, name: r.name ?? r.slug, views: n(r.views), visitors: n(r.visitors) }));
}

export type GovRow = { governorate: string; orders: number; delivered: number; refused: number; revenue: number };

async function byGovernorate(from: Date, to: Date): Promise<GovRow[]> {
  const rows = await prisma.$queryRaw<{ governorate: string; orders: bigint; delivered: bigint; refused: bigint; revenue: bigint }[]>`
    SELECT governorate, COUNT(*) FILTER (WHERE status <> 'CANCELLED') AS orders,
      COUNT(*) FILTER (WHERE status IN ('DELIVERED','RETURNED')) AS delivered,
      COUNT(*) FILTER (WHERE status = 'REFUSED') AS refused,
      COALESCE(SUM(total) FILTER (WHERE status = 'DELIVERED'), 0) AS revenue
    FROM "Order" WHERE "createdAt" >= ${from} AND "createdAt" < ${to}
    GROUP BY 1 ORDER BY 2 DESC`;
  return rows.map((r) => ({ governorate: r.governorate, orders: n(r.orders), delivered: n(r.delivered), refused: n(r.refused), revenue: n(r.revenue) }));
}

async function refusalReasons(from: Date, to: Date) {
  const rows = await prisma.$queryRaw<{ reason: string; count: bigint }[]>`
    SELECT COALESCE("refusalReason", 'Non précisé') AS reason, COUNT(*) AS count
    FROM "Order" WHERE status = 'REFUSED' AND "createdAt" >= ${from} AND "createdAt" < ${to}
    GROUP BY 1 ORDER BY 2 DESC LIMIT 10`;
  return rows.map((r) => ({ reason: r.reason, count: n(r.count) }));
}

/** New vs returning: an order is "returning" when the same customer had an earlier, non-cancelled order. */
async function customers(from: Date, to: Date) {
  const [r] = await prisma.$queryRaw<{ orders: bigint; returning: bigint; customers: bigint; repeaters: bigint }[]>`
    SELECT COUNT(*) AS orders,
      COUNT(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM "Order" p WHERE p."customerId" = o."customerId" AND p."createdAt" < o."createdAt" AND p.status <> 'CANCELLED'
      )) AS returning,
      COUNT(DISTINCT o."customerId") AS customers,
      (SELECT COUNT(*) FROM (
        SELECT "customerId" FROM "Order" WHERE status = 'DELIVERED' GROUP BY 1 HAVING COUNT(*) >= 2
      ) x) AS repeaters
    FROM "Order" o WHERE o.status <> 'CANCELLED' AND o."createdAt" >= ${from} AND o."createdAt" < ${to}`;
  return { orders: n(r.orders), returning: n(r.returning), customers: n(r.customers), repeatersAllTime: n(r.repeaters) };
}

export type Cohort = { month: string; size: number; retained: (number | null)[] };

/**
 * Monthly cohorts by first non-cancelled order, last 6 months: how many came
 * back to order again in each following month. Future months are null, not 0.
 */
async function cohorts(): Promise<Cohort[]> {
  const rows = await prisma.$queryRaw<{ cohort: string; k: number; customers: bigint }[]>`
    WITH o AS (
      SELECT "customerId", date_trunc('month', "createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${TZ}) AS m
      FROM "Order" WHERE status <> 'CANCELLED' AND "createdAt" >= now() - interval '7 months'
    ), first AS (
      SELECT "customerId", MIN(m) AS c FROM o GROUP BY 1
    )
    SELECT to_char(f.c, 'YYYY-MM') AS cohort,
      ((EXTRACT(YEAR FROM o.m) - EXTRACT(YEAR FROM f.c)) * 12 + EXTRACT(MONTH FROM o.m) - EXTRACT(MONTH FROM f.c))::int AS k,
      COUNT(DISTINCT o."customerId") AS customers
    FROM o JOIN first f USING ("customerId")
    WHERE f.c >= date_trunc('month', now() AT TIME ZONE ${TZ}) - interval '5 months'
    GROUP BY 1, 2 ORDER BY 1, 2`;
  const months = [...new Set(rows.map((r) => r.cohort))].sort();
  const nowMonth = new Date().toISOString().slice(0, 7);
  const monthsBetween = (a: string, b: string) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));
  return months.map((m) => {
    const size = n(rows.find((r) => r.cohort === m && r.k === 0)?.customers);
    const span = monthsBetween(m, nowMonth);
    const retained = [1, 2, 3, 4, 5].map((k) => (k > span ? null : n(rows.find((r) => r.cohort === m && r.k === k)?.customers)));
    return { month: m, size, retained };
  });
}

async function byHour(from: Date, to: Date) {
  const rows = await prisma.$queryRaw<{ h: number; orders: bigint }[]>`
    SELECT EXTRACT(HOUR FROM "createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${TZ})::int AS h, COUNT(*) AS orders
    FROM "Order" WHERE "createdAt" >= ${from} AND "createdAt" < ${to} GROUP BY 1`;
  const m = new Map(rows.map((r) => [r.h, n(r.orders)]));
  return Array.from({ length: 24 }, (_, h) => ({ hour: h, orders: m.get(h) ?? 0 }));
}

/** How long orders wait for their confirmation call, and how many calls it takes. */
async function confirmation(from: Date, to: Date) {
  const [r] = await prisma.$queryRaw<{ median_h: number | null; avg_calls: number | null; confirmed: bigint; never: bigint }[]>`
    SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM ("confirmedAt" - "createdAt")) / 3600) AS median_h,
      AVG("confirmAttempts") FILTER (WHERE "confirmAttempts" > 0) AS avg_calls,
      COUNT(*) FILTER (WHERE "confirmedAt" IS NOT NULL) AS confirmed,
      COUNT(*) FILTER (WHERE status = 'CANCELLED' AND "confirmedAt" IS NULL) AS never
    FROM "Order" WHERE "createdAt" >= ${from} AND "createdAt" < ${to}`;
  return { medianHours: r.median_h == null ? null : Number(r.median_h), avgCalls: r.avg_calls == null ? null : Number(r.avg_calls), confirmed: n(r.confirmed), cancelledBeforeConfirm: n(r.never) };
}

/** Taps on the shop's WhatsApp, Messenger and phone links. */
async function contacts(from: Date, to: Date) {
  const [r] = await prisma.$queryRaw<{ whatsapp: bigint; messenger: bigint; phone: bigint }[]>`
    SELECT COUNT(*) FILTER (WHERE name = 'whatsapp_clicked') AS whatsapp, COUNT(*) FILTER (WHERE name = 'messenger_clicked') AS messenger,
      COUNT(*) FILTER (WHERE name = 'phone_clicked') AS phone
    FROM "AnalyticsEvent" WHERE "createdAt" >= ${from} AND "createdAt" < ${to} AND name IN ('whatsapp_clicked', 'messenger_clicked', 'phone_clicked')`;
  return { whatsapp: n(r.whatsapp), messenger: n(r.messenger), phone: n(r.phone) };
}

/**
 * The basket and the product page's pictures: sessions that added to the
 * basket or opened it, orders by where they were placed (product page, quick
 * form on a card, basket), and how often the video and the full-screen
 * pictures were used.
 */
async function basket(from: Date, to: Date) {
  const [r] = await prisma.$queryRaw<{ added: bigint; viewed: bigint; product: bigint; unknown: bigint; quick: bigint; cart: bigint; videos: bigint; zooms: bigint }[]>`
    SELECT COUNT(DISTINCT "sessionId") FILTER (WHERE name = 'add_to_cart') AS added,
      COUNT(DISTINCT "sessionId") FILTER (WHERE name = 'cart_viewed') AS viewed,
      COUNT(*) FILTER (WHERE name = 'order_placed' AND props->>'origin' = 'product') AS product,
      COUNT(*) FILTER (WHERE name = 'order_placed' AND props->>'origin' IS NULL) AS unknown,
      COUNT(*) FILTER (WHERE name = 'order_placed' AND props->>'origin' = 'quick') AS quick,
      COUNT(*) FILTER (WHERE name = 'order_placed' AND props->>'origin' = 'cart') AS cart,
      COUNT(DISTINCT "sessionId") FILTER (WHERE name = 'video_played') AS videos,
      COUNT(DISTINCT "sessionId") FILTER (WHERE name = 'gallery_zoomed') AS zooms
    FROM "AnalyticsEvent" WHERE "createdAt" >= ${from} AND "createdAt" < ${to}
      AND name IN ('add_to_cart', 'cart_viewed', 'order_placed', 'video_played', 'gallery_zoomed')`;
  return { added: n(r.added), viewed: n(r.viewed), orders: { product: n(r.product), quick: n(r.quick), cart: n(r.cart), unknown: n(r.unknown) }, videos: n(r.videos), zooms: n(r.zooms) };
}

/**
 * What the period leaves after every cost the owner gave: products, carrier,
 * parcels that came back, ads. Orders are those placed in the period (as for
 * every other figure here); ad spend is the part of each entry inside it.
 */
async function profitability(from: Date, to: Date) {
  const [[o], sourceRows, spendRows, settings] = await Promise.all([
    prisma.$queryRaw<{ revenue: bigint; delivered: bigint; cost: bigint; unknown: bigint; parcels: bigint; back: bigint; open: bigint }[]>`
      SELECT COALESCE(SUM(total) FILTER (WHERE status = 'DELIVERED'), 0) AS revenue,
        COUNT(*) FILTER (WHERE status IN ('PENDING','CONFIRMED','SUPPLIER_ORDERED','SHIPPED')) AS open,
        COUNT(*) FILTER (WHERE status = 'DELIVERED') AS delivered,
        COALESCE(SUM("costTotal") FILTER (WHERE status = 'DELIVERED' AND "costTotal" IS NOT NULL), 0) AS cost,
        COUNT(*) FILTER (WHERE status = 'DELIVERED' AND "costTotal" IS NULL) AS unknown,
        COUNT(*) FILTER (WHERE status IN ('SHIPPED','DELIVERED','REFUSED','RETURNED')) AS parcels,
        COUNT(*) FILTER (WHERE status IN ('REFUSED','RETURNED')) AS back
      FROM "Order" WHERE "createdAt" >= ${from} AND "createdAt" < ${to}`,
    prisma.$queryRaw<{ source: string; delivered: bigint }[]>`
      SELECT COALESCE(source, 'direct') AS source, COUNT(*) FILTER (WHERE status = 'DELIVERED') AS delivered
      FROM "Order" WHERE "createdAt" >= ${from} AND "createdAt" < ${to} GROUP BY 1`,
    // Entries that may overlap the period (a row covers at most 92 days). `day` is a calendar date:
    // compared with the Tunisian days of the period, not with instants.
    prisma.adSpend.findMany({
      where: { day: { lt: new Date(`${tunisDay(to)}T00:00:00Z`), gte: new Date(Date.parse(`${tunisDay(from)}T00:00:00Z`) - 92 * 86_400_000) } },
      select: { day: true, days: true, source: true, amount: true },
    }),
    getSettings(),
  ]);
  const f = tunisDay(from);
  const t = tunisDay(to);
  const bySource = new Map<string, number>();
  let spend = 0;
  let covered = false;
  for (const row of spendRows) {
    const part = spendInRange({ day: row.day.toISOString().slice(0, 10), days: row.days, amount: row.amount }, f, t);
    if (part === 0) continue;
    covered = true;
    spend += part;
    bySource.set(row.source, (bySource.get(row.source) ?? 0) + part);
  }
  // No entry covers the period: unknown, not zero.
  const adSpend = covered ? spend : null;
  const delivered = new Map(sourceRows.map((s) => [s.source, n(s.delivered)]));
  return {
    revenue: n(o.revenue),
    delivered: n(o.delivered),
    productCost: n(o.cost),
    costUnknown: n(o.unknown),
    parcels: n(o.parcels),
    backParcels: n(o.back),
    /** Orders of the period not delivered or refused yet: their money is not in yet, their costs partly are. */
    open: n(o.open),
    adSpend,
    ...profit({
      deliveredRevenue: n(o.revenue),
      delivered: n(o.delivered),
      productCost: n(o.cost),
      costUnknown: n(o.unknown),
      parcels: n(o.parcels),
      backParcels: n(o.back),
      carrierPerParcel: settings.costs.carrierPerParcel,
      returnPerParcel: settings.costs.returnPerParcel,
      adSpend,
    }),
    sources: [...bySource.entries()]
      .map(([source, amount]) => ({ source, spend: amount, delivered: delivered.get(source) ?? 0, costPerDelivered: (delivered.get(source) ?? 0) > 0 ? Math.round(amount / delivered.get(source)!) : null }))
      .sort((a, b) => b.spend - a.spend),
  };
}

export async function getAnalytics(r: Range) {
  const [k, prev] = await Promise.all([kpis(r.from, r.to), kpis(r.prevFrom, r.prevTo)]);
  const [days, steps, sources, campaigns, devices, prods, search, cats, govs, reasons, cust, cohortRows, hours, conf, contact, carts, bask, money] = await Promise.all([
    daily(r),
    funnel(r.from, r.to, k),
    bySource(r.from, r.to, false),
    bySource(r.from, r.to, true),
    byDevice(r.from, r.to),
    products(r.from, r.to),
    searches(r.from, r.to),
    categories(r.from, r.to),
    byGovernorate(r.from, r.to),
    refusalReasons(r.from, r.to),
    customers(r.from, r.to),
    cohorts(),
    byHour(r.from, r.to),
    confirmation(r.from, r.to),
    contacts(r.from, r.to),
    abandonedCarts(Math.max(1, r.days), 500),
    basket(r.from, r.to),
    profitability(r.from, r.to),
  ]);
  const cartsInRange = carts.filter((c) => c.cart.updatedAt >= r.from && c.cart.updatedAt < r.to);
  return {
    kpis: k,
    prev,
    days,
    funnel: steps,
    basket: bask,
    profit: money,
    sources,
    campaigns,
    devices,
    products: prods,
    searches: search,
    categories: cats,
    governorates: govs,
    refusalReasons: reasons,
    customers: cust,
    cohorts: cohortRows,
    hours,
    confirmation: conf,
    contacts: contact,
    abandoned: { count: cartsInRange.length, value: cartsInRange.reduce((s, c) => s + c.value, 0), withPhone: cartsInRange.filter((c) => c.cart.phone).length },
  };
}
export type Analytics = Awaited<ReturnType<typeof getAnalytics>>;

/** The last minutes, for the real-time panel. */
export async function getLive() {
  const since5 = new Date(Date.now() - 5 * 60_000);
  const since30 = new Date(Date.now() - 30 * 60_000);
  const [[a], pages, perMinute, orders, sources] = await Promise.all([
    prisma.$queryRaw<{ visitors: bigint; forms: bigint; phones: bigint }[]>`
      SELECT COUNT(DISTINCT "visitorId") AS visitors,
        COUNT(DISTINCT "sessionId") FILTER (WHERE name = 'checkout_started') AS forms,
        COUNT(DISTINCT "sessionId") FILTER (WHERE name = 'checkout_phone_entered') AS phones
      FROM "AnalyticsEvent" WHERE "createdAt" >= ${since5} AND "sessionId" <> 'server'`,
    prisma.$queryRaw<{ path: string; visitors: bigint }[]>`
      SELECT path, COUNT(DISTINCT "visitorId") AS visitors FROM "AnalyticsEvent"
      WHERE name = 'page_view' AND "createdAt" >= ${since5} AND path IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 8`,
    prisma.$queryRaw<{ m: number; visitors: bigint }[]>`
      SELECT FLOOR(EXTRACT(EPOCH FROM (now() - "createdAt")) / 60)::int AS m, COUNT(DISTINCT "visitorId") AS visitors
      FROM "AnalyticsEvent" WHERE "createdAt" >= ${since30} AND "sessionId" <> 'server' GROUP BY 1`,
    prisma.order.findMany({ where: { createdAt: { gte: since30 } }, orderBy: { createdAt: "desc" }, take: 5, select: { ref: true, total: true, governorate: true, source: true, createdAt: true } }),
    prisma.$queryRaw<{ source: string; visitors: bigint }[]>`
      SELECT COALESCE(source, 'direct') AS source, COUNT(DISTINCT "visitorId") AS visitors FROM "AnalyticsEvent"
      WHERE "createdAt" >= ${since5} AND "sessionId" <> 'server' GROUP BY 1 ORDER BY 2 DESC LIMIT 5`,
  ]);
  const pm = new Map(perMinute.map((x) => [x.m, n(x.visitors)]));
  return {
    visitors: n(a.visitors),
    forms: n(a.forms),
    phones: n(a.phones),
    pages: pages.map((p) => ({ path: p.path, visitors: n(p.visitors) })),
    sources: sources.map((s) => ({ source: s.source, visitors: n(s.visitors) })),
    minutes: Array.from({ length: 30 }, (_, i) => ({ ago: 29 - i, visitors: pm.get(29 - i) ?? 0 })),
    orders: orders.map((o) => ({ ...o, createdAt: o.createdAt.toISOString() })),
    at: new Date().toISOString(),
  };
}
export type Live = Awaited<ReturnType<typeof getLive>>;
