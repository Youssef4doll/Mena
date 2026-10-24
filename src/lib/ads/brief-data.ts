import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { getSettings } from "../settings";
import { deliverySpan } from "../delivery";
import { baseline } from "./data";
import { normName, normSource } from "./match";
import { offerLine } from "../offer-label";
import type { BriefAdStat, BriefInput, Reason } from "./brief";

/**
 * What the creative brief and the ad ideas read about one product: its own
 * texts, prices and offers, the shop's real promises (settings), approved
 * reviews, and its real numbers over the last 90 days (product-page visits,
 * order forms, orders and what became of them, per ad, refusal reasons, the
 * searches that led to it). Orders typed in the back office (device
 * "admin") are not ad traffic and are left out. A few bounded queries, run
 * together.
 *
 *   briefProducts(now?)             → BriefProductOption[]   the picker: online first, most ordered first
 *   loadBriefInput(productId, now?) → BriefInput | null      everything buildBrief and ideasRequest need
 */

const n = (v: unknown) => (v == null ? 0 : Number(v));
const DAY = 86_400_000;
/** Days of the product's numbers: long enough for a few dozen orders to be final, short enough to describe today's ads. */
export const BRIEF_DAYS = 90;
/** Reviews read for quotes, and ads, refusal reasons and searches listed. */
const MAX_QUOTES = 6;
const MAX_ADS = 12;
const MAX_REASONS = 5;
const MAX_SEARCHES = 8;

/** A name as matched (see normName), in SQL: trimmed, lowercased, null when empty. */
const nameSql = (col: string) => Prisma.raw(`NULLIF(lower(btrim(${col}, E' \\t\\r\\n')), '')`);
/** Statuses past the phone confirmation, as data.ts counts them. */
const CONFIRMED_SQL = Prisma.raw(`("confirmedAt" IS NOT NULL OR status IN ('CONFIRMED','SUPPLIER_ORDERED','SHIPPED','DELIVERED','REFUSED','RETURNED'))`);

export type BriefProductOption = { id: string; slug: string; name: string; active: boolean; orders: number };

/** Every product for the picker: online first, then the most ordered over BRIEF_DAYS, then by name. */
export async function briefProducts(now: Date = new Date()): Promise<BriefProductOption[]> {
  const since = new Date(now.getTime() - BRIEF_DAYS * DAY);
  const rows = await prisma.$queryRaw<{ id: string; slug: string; name: string; active: boolean; orders: bigint }[]>`
    SELECT p.id, p.slug, p.name, p.active, COUNT(DISTINCT o.id) AS orders
    FROM "Product" p
    LEFT JOIN "OrderItem" i ON i."productId" = p.id
    LEFT JOIN "Order" o ON o.id = i."orderId" AND o."createdAt" >= ${since} AND o.device IS DISTINCT FROM 'admin'
    GROUP BY p.id
    ORDER BY p.active DESC, orders DESC, p.name
    LIMIT 500`;
  return rows.map((r) => ({ id: r.id, slug: r.slug, name: r.name, active: r.active, orders: n(r.orders) }));
}

type OrderGroup = { src: string | null; camp: string | null; ad: string | null; orders: bigint; confirmed: bigint; decided: bigint; delivered: bigint; back: bigint; open: bigint; multi: bigint };

/** The brief's input for one product, or null when it does not exist. */
export async function loadBriefInput(productId: string, now: Date = new Date()): Promise<BriefInput | null> {
  const since = new Date(now.getTime() - BRIEF_DAYS * DAY);
  const p = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      slug: true,
      name: true,
      nameAr: true,
      summary: true,
      summaryAr: true,
      specs: true,
      specsAr: true,
      price: true,
      compareAt: true,
      cost: true,
      videoUrl: true,
      active: true,
      available: true,
      category: { select: { name: true, nameAr: true } },
      variants: { where: { available: true }, orderBy: { sort: "asc" }, select: { name: true, nameAr: true } },
      offers: { where: { active: true }, orderBy: { sort: "asc" }, select: { id: true, label: true, labelAr: true, quantity: true, price: true, freeDelivery: true, endsAt: true } },
      _count: { select: { images: { where: { kind: "GALLERY" } } } },
    },
  });
  if (!p) return null;

  // Orders containing the product, by the order's own attribution.
  const ofProduct = Prisma.sql`o."createdAt" >= ${since} AND o.device IS DISTINCT FROM 'admin' AND o.id IN (SELECT "orderId" FROM "OrderItem" WHERE "productId" = ${p.id})`;

  const [settings, base, reviewStats, quotes, [pages], visitsByAd, ordersByAd, refusals, shopRefusals, searches] = await Promise.all([
    getSettings(),
    baseline(now),
    prisma.review.aggregate({ where: { productId: p.id, status: "APPROVED" }, _count: { _all: true }, _avg: { rating: true } }),
    prisma.review.findMany({
      where: { productId: p.id, status: "APPROVED", text: { not: null } },
      orderBy: [{ rating: "desc" }, { createdAt: "desc" }],
      take: MAX_QUOTES,
      select: { rating: true, text: true, authorName: true, governorate: true },
    }),
    // Product-page visits and form starts: this product's, and every product page's (one visit per page and session).
    prisma.$queryRaw<{ visits: bigint; forms: bigint; shop_visits: bigint; shop_forms: bigint }[]>`
      SELECT COUNT(DISTINCT "sessionId") FILTER (WHERE name = 'product_viewed' AND "productId" = ${p.id}) AS visits,
        COUNT(DISTINCT "sessionId") FILTER (WHERE name = 'checkout_started' AND "productId" = ${p.id}) AS forms,
        COUNT(DISTINCT "sessionId" || ':' || "productId") FILTER (WHERE name = 'product_viewed') AS shop_visits,
        COUNT(DISTINCT "sessionId" || ':' || "productId") FILTER (WHERE name = 'checkout_started') AS shop_forms
      FROM "AnalyticsEvent"
      WHERE name IN ('product_viewed', 'checkout_started') AND "createdAt" >= ${since} AND "createdAt" < ${now}
        AND "productId" IS NOT NULL AND "sessionId" <> 'server'`,
    // This product's page visits per ad, with the attribution the visit came with.
    prisma.$queryRaw<{ src: string | null; camp: string | null; ad: string | null; visits: bigint }[]>`
      SELECT src, camp, ad, COUNT(*) AS visits FROM (
        SELECT DISTINCT ON ("sessionId") "sessionId", ${nameSql("source")} AS src, ${nameSql("campaign")} AS camp, ${nameSql("content")} AS ad
        FROM "AnalyticsEvent"
        WHERE name = 'product_viewed' AND "productId" = ${p.id} AND "createdAt" >= ${since} AND "createdAt" < ${now} AND "sessionId" <> 'server'
        ORDER BY "sessionId", "createdAt"
      ) v
      WHERE camp IS NOT NULL OR ad IS NOT NULL
      GROUP BY 1, 2, 3`,
    prisma.$queryRaw<OrderGroup[]>`
      SELECT ${nameSql("o.source")} AS src, ${nameSql("o.campaign")} AS camp, ${nameSql("o.content")} AS ad,
        COUNT(*) AS orders,
        COUNT(*) FILTER (WHERE ${CONFIRMED_SQL}) AS confirmed,
        COUNT(*) FILTER (WHERE ${CONFIRMED_SQL} OR status = 'CANCELLED') AS decided,
        COUNT(*) FILTER (WHERE status = 'DELIVERED') AS delivered,
        COUNT(*) FILTER (WHERE status IN ('REFUSED','RETURNED')) AS back,
        COUNT(*) FILTER (WHERE status IN ('PENDING','CONFIRMED','SUPPLIER_ORDERED','SHIPPED')) AS open,
        COUNT(*) FILTER (WHERE (SELECT COALESCE(SUM(i.qty), 0) FROM "OrderItem" i WHERE i."orderId" = o.id AND i."productId" = ${p.id}) >= 2) AS multi
      FROM "Order" o
      WHERE ${ofProduct} AND o."createdAt" < ${now}
      GROUP BY 1, 2, 3`,
    prisma.$queryRaw<{ reason: string; count: bigint }[]>`
      SELECT COALESCE(NULLIF(btrim("refusalReason"), ''), 'Non précisé') AS reason, COUNT(*) AS count
      FROM "Order" o WHERE status = 'REFUSED' AND ${ofProduct} AND o."createdAt" < ${now}
      GROUP BY 1 ORDER BY 2 DESC LIMIT ${MAX_REASONS}`,
    prisma.$queryRaw<{ reason: string; count: bigint }[]>`
      SELECT COALESCE(NULLIF(btrim("refusalReason"), ''), 'Non précisé') AS reason, COUNT(*) AS count
      FROM "Order" o WHERE status = 'REFUSED' AND o."createdAt" >= ${since} AND o."createdAt" < ${now} AND o.device IS DISTINCT FROM 'admin'
      GROUP BY 1 ORDER BY 2 DESC LIMIT ${MAX_REASONS}`,
    // Searches whose results led to this product (the search page records the query with each click).
    prisma.$queryRaw<{ q: string; count: bigint }[]>`
      SELECT props->>'q' AS q, COUNT(*) AS count FROM "AnalyticsEvent"
      WHERE name = 'list_item_clicked' AND "createdAt" >= ${since} AND "createdAt" < ${now}
        AND props->>'list' = 'search' AND props->>'slug' = ${p.slug} AND COALESCE(props->>'q', '') <> ''
      GROUP BY 1 ORDER BY 2 DESC LIMIT ${MAX_SEARCHES}`,
  ]);

  // Visits and orders per ad, sources folded like ./match ("fb" is "facebook").
  const ads = new Map<string, BriefAdStat>();
  const adOf = (src: string | null, camp: string | null, ad: string | null) => {
    const source = normSource(src);
    const key = [source, normName(camp) ?? "", normName(ad) ?? ""].join("|");
    let row = ads.get(key);
    if (!row) ads.set(key, (row = { source, campaign: camp, ad, visits: 0, orders: 0, confirmed: 0, delivered: 0, back: 0 }));
    return row;
  };
  for (const v of visitsByAd) adOf(v.src, v.camp, v.ad).visits += n(v.visits);
  const totals = { orders: 0, confirmed: 0, decided: 0, delivered: 0, back: 0, open: 0, multi: 0 };
  for (const o of ordersByAd) {
    totals.orders += n(o.orders);
    totals.confirmed += n(o.confirmed);
    totals.decided += n(o.decided);
    totals.delivered += n(o.delivered);
    totals.back += n(o.back);
    totals.open += n(o.open);
    totals.multi += n(o.multi);
    if (o.camp == null && o.ad == null) continue;
    const row = adOf(o.src, o.camp, o.ad);
    row.orders += n(o.orders);
    row.confirmed += n(o.confirmed);
    row.delivered += n(o.delivered);
    row.back += n(o.back);
  }
  const reasons = (rows: { reason: string; count: bigint }[]): Reason[] => rows.map((r) => ({ reason: r.reason, count: n(r.count) }));
  const zones = settings.delivery.zones;

  return {
    product: {
      id: p.id,
      slug: p.slug,
      name: p.name,
      nameAr: p.nameAr,
      summary: p.summary,
      summaryAr: p.summaryAr,
      specs: p.specs,
      specsAr: p.specsAr,
      category: p.category?.name ?? null,
      categoryAr: p.category?.nameAr ?? null,
      price: p.price,
      compareAt: p.compareAt,
      cost: p.cost,
      hasVideo: Boolean(p.videoUrl?.trim()),
      photos: p._count.images,
      variants: p.variants,
      // Ad copy names an offer as the shop does: by its quantity, with the owner's name only when it agrees.
      offers: p.offers.filter((o) => !o.endsAt || o.endsAt > now).map((o) => ({ ...o, label: offerLine(o, "fr"), labelAr: offerLine(o, "ar"), endsAt: o.endsAt?.toISOString() ?? null })),
      active: p.active,
      available: p.available,
    },
    shop: {
      deliveryFee: settings.delivery.fee,
      freeThreshold: settings.delivery.freeThreshold,
      delivery: deliverySpan(zones),
      everywhere: Object.values(zones).every((z) => z.enabled),
      openBeforePaying: settings.delivery.openBeforePaying,
      returnDays: settings.returns.days,
      carrierPerParcel: settings.costs.carrierPerParcel,
      returnPerParcel: settings.costs.returnPerParcel,
    },
    reviews: { count: reviewStats._count._all, average: reviewStats._avg.rating ?? null, quotes },
    performance: {
      days: BRIEF_DAYS,
      visits: n(pages?.visits),
      formStarts: n(pages?.forms),
      shopVisits: n(pages?.shop_visits),
      shopFormStarts: n(pages?.shop_forms),
      orders: totals.orders,
      confirmed: totals.confirmed,
      decided: totals.decided,
      delivered: totals.delivered,
      back: totals.back,
      open: totals.open,
      multiUnitOrders: totals.multi,
      refusals: reasons(refusals),
      shopRefusals: reasons(shopRefusals),
      ads: [...ads.values()].sort((a, b) => b.orders - a.orders || b.visits - a.visits).slice(0, MAX_ADS),
      searches: searches.map((s) => ({ q: s.q, count: n(s.count) })),
    },
    baseline: { confirmRate: base.confirmRate, deliveryRate: base.deliveryRate },
    asOf: now.toISOString(),
  };
}
