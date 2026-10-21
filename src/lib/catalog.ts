import "server-only";
import { unstable_cache } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import type { CatalogProduct } from "./pricing";
import { leadOffer, offerCompareAt, offerLastDay, offersApply } from "./offer-display";
import { parseSpecs, parseVideo, soldStep } from "./product-content";
import { complete, normalize, rank, tokenize, type Ranked } from "./search";

/**
 * Storefront reads. Cached under one tag the back office expires on every
 * catalog edit, so a price change shows at once and a busy page costs nothing.
 * Stock shown here may lag by up to a minute; the checkout re-reads it.
 */
export const CATALOG_TAG = "catalog";
const TTL = 60;

const cardSelect = {
  id: true,
  slug: true,
  name: true,
  nameAr: true,
  price: true,
  compareAt: true,
  stockMode: true,
  stockQty: true,
  available: true,
  createdAt: true,
  images: { where: { kind: "GALLERY" }, orderBy: { sort: "asc" }, take: 2, select: { mediaId: true, alt: true, media: { select: { width: true, height: true, blur: true } } } },
  variants: { select: { stockQty: true, available: true, price: true } },
  offers: { where: { active: true }, select: { quantity: true, price: true, endsAt: true, label: true, labelAr: true, freeDelivery: true } },
} satisfies Prisma.ProductSelect;

type CardRow = Prisma.ProductGetPayload<{ select: typeof cardSelect }>;

export type StockState = { kind: "in_stock" } | { kind: "low"; qty: number } | { kind: "out" };

/** What the page may say about stock. A count is shown only when the shop really counts it. */
export function stockState(p: { stockMode: "TRACKED" | "SUPPLIER"; stockQty: number; available: boolean; variants: { stockQty: number; available: boolean }[] }): StockState {
  if (p.stockMode === "SUPPLIER") {
    if (!p.available) return { kind: "out" };
    if (p.variants.length > 0 && !p.variants.some((v) => v.available)) return { kind: "out" };
    return { kind: "in_stock" };
  }
  const qty = p.variants.length > 0 ? p.variants.reduce((s, v) => s + Math.max(0, v.stockQty), 0) : p.stockQty;
  if (qty <= 0) return { kind: "out" };
  if (qty <= 5) return { kind: "low", qty };
  return { kind: "in_stock" };
}

export type ImageRef = { id: string; alt: string | null; width: number; height: number; blur: string | null };

export type ProductCard = {
  id: string;
  slug: string;
  name: string;
  nameAr: string | null;
  price: number;
  /** "From" price when variants differ. */
  priceFrom: boolean;
  /** The price is for a pack of this many (a product sold only in packs). */
  packOf: number | null;
  compareAt: number | null;
  images: ImageRef[];
  stock: StockState;
  rating: { avg: number; count: number } | null;
  /** Confirmed orders in 30 days, rounded down ("+20"); null under 10. */
  sold: number | null;
  /** The card's price includes delivery (its offer says so). */
  freeDelivery: boolean;
  /** The pack that saves the most per unit, as the shop named it. */
  deal: { label: string; labelAr: string | null; quantity: number; freeDelivery: boolean } | null;
};

type PriceRow = {
  price: number;
  compareAt: number | null;
  variants: { price: number | null; stockQty?: number; available?: boolean }[];
  offers: { quantity: number; price: number; endsAt: Date | null; label?: string; labelAr?: string | null; freeDelivery?: boolean }[];
  stockMode?: "TRACKED" | "SUPPLIER";
  stockQty?: number;
};

/**
 * The offers a card may speak of: switched on, not ended, and — when the shop
 * counts its stock — not bigger than what is left, as the product page does.
 */
function liveOffers(p: PriceRow, now: number) {
  if (!offersApply(p.price, p.variants)) return [];
  const cap = p.stockMode === "TRACKED" ? (p.variants.length ? Math.max(0, ...p.variants.map((v) => v.stockQty ?? 0)) : (p.stockQty ?? 0)) : Infinity;
  return p.offers.filter((o) => (!o.endsAt || o.endsAt.getTime() > now) && o.quantity <= cap);
}

/**
 * The price a list may show: what the product page will actually charge.
 * With offers, the one-unit offer (or the smallest pack, said as such);
 * otherwise the lowest option price, "from" when options differ.
 */
export function cardPrice(p: PriceRow, now = Date.now()) {
  const live = liveOffers(p, now);
  const lead = leadOffer(live);
  if (lead) return { price: lead.price, priceFrom: false, packOf: lead.quantity > 1 ? lead.quantity : null, compareAt: offerCompareAt(live, lead, p.compareAt) };
  const variantPrices = p.variants.map((v) => v.price ?? p.price);
  const minPrice = variantPrices.length ? Math.min(...variantPrices) : p.price;
  return { price: minPrice, priceFrom: variantPrices.some((x) => x !== minPrice), packOf: null, compareAt: p.compareAt != null && p.compareAt > minPrice ? p.compareAt : null };
}

/**
 * What a card may add to its price: delivery included in the price shown,
 * and the shop's best pack (lowest price per unit, below the lead offer's).
 */
export function cardDeal(p: PriceRow, now = Date.now()): Pick<ProductCard, "freeDelivery" | "deal"> {
  const live = liveOffers(p, now);
  const lead = leadOffer(live);
  if (!lead) return { freeDelivery: false, deal: null };
  const leadUnit = lead.price / lead.quantity;
  const best = live
    .filter((o) => o.quantity > lead.quantity && o.price / o.quantity < leadUnit && o.label)
    .sort((a, b) => a.price / a.quantity - b.price / b.quantity)[0];
  return {
    freeDelivery: Boolean(lead.freeDelivery),
    deal: best ? { label: best.label!, labelAr: best.labelAr ?? null, quantity: best.quantity, freeDelivery: Boolean(best.freeDelivery) } : null,
  };
}

function toCard(p: CardRow, ratings: Map<string, { avg: number; count: number }>, sold: Map<string, number>): ProductCard {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    nameAr: p.nameAr,
    ...cardPrice(p),
    ...cardDeal(p),
    images: p.images.map((i) => ({ id: i.mediaId, alt: i.alt, width: i.media.width, height: i.media.height, blur: i.media.blur })),
    stock: stockState(p),
    rating: ratings.get(p.id) ?? null,
    sold: soldStep(sold.get(p.id) ?? 0),
  };
}

/**
 * Orders of each product in the last 30 days that the shop confirmed (or got
 * further): an order still waiting for its call, cancelled, refused at the door
 * or returned is not counted as bought.
 */
async function soldFor(ids: string[]) {
  if (ids.length === 0) return new Map<string, number>();
  const since = new Date(Date.now() - 30 * 86_400_000);
  const rows = await prisma.$queryRaw<{ productId: string; n: bigint }[]>`
    SELECT oi."productId", COUNT(DISTINCT oi."orderId") AS n
    FROM "OrderItem" oi JOIN "Order" o ON o.id = oi."orderId"
    WHERE oi."productId" IN (${Prisma.join(ids)})
      AND o."createdAt" >= ${since}
      AND o.status IN ('CONFIRMED', 'SUPPLIER_ORDERED', 'SHIPPED', 'DELIVERED')
    GROUP BY oi."productId"`;
  return new Map(rows.map((r) => [r.productId, Number(r.n)]));
}

async function ratingsFor(ids: string[]) {
  if (ids.length === 0) return new Map<string, { avg: number; count: number }>();
  const rows = await prisma.review.groupBy({
    by: ["productId"],
    where: { productId: { in: ids }, status: "APPROVED" },
    _avg: { rating: true },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.productId, { avg: r._avg.rating ?? 0, count: r._count._all }]));
}

async function cards(where: Prisma.ProductWhereInput, orderBy: Prisma.ProductOrderByWithRelationInput[], take: number) {
  const rows = await prisma.product.findMany({ where: { active: true, ...where }, orderBy, take, select: cardSelect });
  const ids = rows.map((r) => r.id);
  const [ratings, sold] = await Promise.all([ratingsFor(ids), soldFor(ids)]);
  return rows.map((r) => toCard(r, ratings, sold));
}

/** Products that can be bought first, the others after them, each group in its order: the first taps go to what can be ordered. */
export function outLast<T extends { stock: StockState }>(list: T[]): T[] {
  return [...list.filter((p) => p.stock.kind !== "out"), ...list.filter((p) => p.stock.kind === "out")];
}

/** The price a card shows, per unit for a pack, so "cheapest first" follows what the customer reads. */
const shownUnit = (p: ProductCard) => (p.packOf ? p.price / p.packOf : p.price);

/**
 * A list in the order the customer asked for. Prices are sorted on the price
 * each card shows, not on the stored one, over every product of the list
 * (then cut), so the cheapest are never left out of "cheapest first".
 */
async function sorted(where: Prisma.ProductWhereInput, sort: SortKey, take: number) {
  if (sort === "popular") return outLast(await popularIn(where, take));
  if (sort === "new") return outLast(await cards(where, NEWEST, take));
  const list = await cards(where, NEWEST, 2000);
  list.sort((a, b) => (sort === "price_asc" ? shownUnit(a) - shownUnit(b) : shownUnit(b) - shownUnit(a)));
  return outLast(list).slice(0, take);
}

/** An order counts as a sale once the shop confirmed it; waiting, cancelled, refused and returned orders do not. */
const SOLD: Prisma.EnumOrderStatusFilter = { in: ["CONFIRMED", "SUPPLIER_ORDERED", "SHIPPED", "DELIVERED"] };

/**
 * The home page's category boxes: each category with up to four of its
 * products (the shop's selection first), like Amazon's "2 × 2" cards.
 */
export const getHomeCategories = unstable_cache(
  async () => {
    const cats = await prisma.category.findMany({
      where: { active: true, products: { some: { active: true } } },
      orderBy: [{ sort: "asc" }, { name: "asc" }],
      select: {
        id: true,
        slug: true,
        name: true,
        nameAr: true,
        headline: true,
        headlineAr: true,
        imageId: true,
        products: {
          where: { active: true },
          orderBy: [{ featured: "desc" }, { createdAt: "desc" }],
          take: 4,
          select: cardSelect,
        },
      },
    });
    const ids = cats.flatMap((c) => c.products.map((p) => p.id));
    const [ratings, sold] = await Promise.all([ratingsFor(ids), soldFor(ids)]);
    return cats.map((c) => ({ ...c, products: c.products.map((p) => toCard(p, ratings, sold)) }));
  },
  ["home-categories-v4"],
  { tags: [CATALOG_TAG], revalidate: TTL },
);

export const getCategories = unstable_cache(
  async () =>
    prisma.category.findMany({
      where: { active: true, products: { some: { active: true } } },
      orderBy: [{ sort: "asc" }, { name: "asc" }],
      select: { id: true, slug: true, name: true, nameAr: true, imageId: true, _count: { select: { products: { where: { active: true } } } } },
    }),
  ["categories-v1"],
  { tags: [CATALOG_TAG], revalidate: TTL },
);

export type SortKey = "new" | "price_asc" | "price_desc" | "popular";

export const getCategoryPage = unstable_cache(
  async (slug: string, sort: SortKey) => {
    const category = await prisma.category.findFirst({ where: { slug, active: true }, select: { id: true, slug: true, name: true, nameAr: true, headline: true, headlineAr: true, imageId: true } });
    if (!category) return null;
    const products = await sorted({ categoryId: category.id }, sort, 60);
    return { category, products };
  },
  ["category-page-v5"],
  { tags: [CATALOG_TAG], revalidate: TTL },
);

/** The shop's own order: its selection first, then the newest. */
const NEWEST: Prisma.ProductOrderByWithRelationInput[] = [{ featured: "desc" }, { createdAt: "desc" }];

/**
 * Real units sold in the last 60 days, in orders the shop confirmed. As a sort
 * order the list is topped up with the newest; as a "most ordered" claim
 * (fill = false) it is only what really sold.
 */
async function popularIn(where: Prisma.ProductWhereInput, take: number, fill = true) {
  const since = new Date(Date.now() - 60 * 86_400_000);
  const sold = await prisma.orderItem.groupBy({
    by: ["productId"],
    where: { productId: { not: null }, order: { createdAt: { gte: since }, status: SOLD }, product: { active: true, ...where } },
    _sum: { qty: true },
    orderBy: { _sum: { qty: "desc" } },
    take,
  });
  const ids = sold.map((s) => s.productId!).filter(Boolean);
  const ranked = ids.length ? await cards({ id: { in: ids } }, [], ids.length) : [];
  ranked.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  if (ranked.length >= take || !fill) return ranked;
  const rest = await cards({ ...where, id: { notIn: ids } }, NEWEST, take - ranked.length);
  return [...ranked, ...rest];
}

export const getShop = unstable_cache(
  async (sort: SortKey) => sorted({}, sort, 120),
  ["shop-v4"],
  { tags: [CATALOG_TAG], revalidate: TTL },
);

export const getHome = unstable_cache(
  async () => {
    const since = new Date(Date.now() - 60 * 86_400_000);
    const soldCount = await prisma.orderItem.count({ where: { order: { createdAt: { gte: since }, status: SOLD } } });
    const [featured, newest, bestsellers, reviews] = await Promise.all([
      cards({ featured: true }, [{ createdAt: "desc" }], 8),
      cards({}, [{ createdAt: "desc" }], 8),
      // "Most ordered" is only claimed when there are orders behind it.
      soldCount >= 5 ? popularIn({}, 8, false) : Promise.resolve([] as ProductCard[]),
      prisma.review.findMany({
        where: { status: "APPROVED", rating: { gte: 4 }, text: { not: null } },
        orderBy: { createdAt: "desc" },
        take: 6,
        select: { id: true, rating: true, text: true, authorName: true, governorate: true, createdAt: true, product: { select: { name: true, nameAr: true, slug: true } } },
      }),
    ]);
    return { featured, newest, bestsellers, reviews: reviews.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })) };
  },
  ["home-v5"],
  { tags: [CATALOG_TAG], revalidate: TTL },
);

export const getProduct = unstable_cache(
  async (slug: string) => {
    const p = await prisma.product.findFirst({
      where: { slug, active: true },
      select: {
        id: true,
        slug: true,
        name: true,
        nameAr: true,
        summary: true,
        summaryAr: true,
        description: true,
        descriptionAr: true,
        specs: true,
        specsAr: true,
        videoUrl: true,
        seoTitle: true,
        seoTitleAr: true,
        seoDescription: true,
        seoDescriptionAr: true,
        price: true,
        compareAt: true,
        stockMode: true,
        stockQty: true,
        available: true,
        updatedAt: true,
        category: { select: { slug: true, name: true, nameAr: true } },
        images: { orderBy: { sort: "asc" }, select: { mediaId: true, alt: true, kind: true, media: { select: { width: true, height: true, blur: true } } } },
        variants: { orderBy: { sort: "asc" }, select: { id: true, name: true, nameAr: true, colorHex: true, price: true, stockQty: true, available: true } },
        offers: {
          where: { active: true, OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] },
          orderBy: [{ sort: "asc" }, { quantity: "asc" }],
          select: { id: true, label: true, labelAr: true, quantity: true, price: true, freeDelivery: true, endsAt: true },
        },
      },
    });
    if (!p) return null;
    const [reviews, agg, related, offerSales, sold] = await Promise.all([
      prisma.review.findMany({
        where: { productId: p.id, status: "APPROVED" },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, rating: true, text: true, authorName: true, governorate: true, createdAt: true },
      }),
      prisma.review.aggregate({ where: { productId: p.id, status: "APPROVED" }, _avg: { rating: true }, _count: { _all: true } }),
      relatedTo(p.id, p.category?.slug ?? null),
      p.offers.length > 1
        ? prisma.orderItem.groupBy({
            by: ["offerId"],
            where: { offerId: { in: p.offers.map((o) => o.id) }, order: { status: { not: "CANCELLED" }, createdAt: { gte: new Date(Date.now() - 60 * 86_400_000) } } },
            _count: { _all: true },
          })
        : Promise.resolve([] as { offerId: string | null; _count: { _all: number } }[]),
      soldFor([p.id]),
    ]);
    // "Le plus choisi" is a fact or it is not shown: the offer ordered most in
    // 60 days, with at least 3 orders and clearly ahead of the next one.
    const ranked = [...offerSales].sort((a, b) => b._count._all - a._count._all);
    const mostChosen = ranked[0] && ranked[0]._count._all >= 3 && ranked[0]._count._all > (ranked[1]?._count._all ?? 0) ? ranked[0].offerId : null;
    const tracked = p.stockMode === "TRACKED";
    const variants = p.variants.map((v) => ({
      id: v.id,
      name: v.name,
      nameAr: v.nameAr,
      /** A dot beside the name in the list; null for an option without a colour. */
      colorHex: v.colorHex,
      price: v.price ?? p.price,
      soldOut: tracked ? v.stockQty <= 0 : !v.available || !p.available,
      lowQty: tracked && v.stockQty > 0 && v.stockQty <= 5 ? v.stockQty : null,
      /** Units that can be ordered; null when the supplier has stock. Used to grey out packs, never printed. */
      maxUnits: tracked ? Math.max(0, v.stockQty) : !v.available || !p.available ? 0 : null,
    }));
    const maxUnits = variants.length ? (variants.some((v) => v.maxUnits == null) ? null : Math.max(0, ...variants.map((v) => v.maxUnits ?? 0))) : tracked ? Math.max(0, p.stockQty) : p.available ? null : 0;
    const offers = offersApply(p.price, p.variants) ? p.offers : [];
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      nameAr: p.nameAr,
      summary: p.summary,
      summaryAr: p.summaryAr,
      description: p.description,
      descriptionAr: p.descriptionAr,
      specs: parseSpecs(p.specs),
      specsAr: p.specsAr?.trim() ? parseSpecs(p.specsAr) : null,
      video: parseVideo(p.videoUrl),
      seoTitle: p.seoTitle,
      seoTitleAr: p.seoTitleAr,
      seoDescription: p.seoDescription,
      seoDescriptionAr: p.seoDescriptionAr,
      price: p.price,
      compareAt: p.compareAt != null && p.compareAt > p.price ? p.compareAt : null,
      category: p.category,
      images: p.images.filter((i) => i.kind === "GALLERY").map((i) => ({ id: i.mediaId, alt: i.alt, width: i.media.width, height: i.media.height, blur: i.media.blur })),
      /** The long pictures under the description, in their order. */
      detailImages: p.images.filter((i) => i.kind === "DETAIL").map((i) => ({ id: i.mediaId, alt: i.alt, width: i.media.width, height: i.media.height, blur: i.media.blur })),
      sold: soldStep(sold.get(p.id) ?? 0),
      variants,
      stock: stockState(p),
      updatedAt: p.updatedAt.toISOString(),
      reviews: reviews.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
      rating: agg._count._all > 0 ? { avg: agg._avg.rating ?? 0, count: agg._count._all } : null,
      maxUnits,
      offers: offers.map(({ endsAt, ...o }) => ({ ...o, lastDay: endsAt ? offerLastDay(endsAt) : null, compareAt: offerCompareAt(offers, o, p.compareAt), mostChosen: o.id === mostChosen })),
      related,
    };
  },
  ["product-v7"],
  { tags: [CATALOG_TAG], revalidate: TTL },
);
export type ProductPage = NonNullable<Awaited<ReturnType<typeof getProduct>>>;

/** Others from the same category first; a small category is topped up with the shop's selection, so a page never ends on nothing. */
async function relatedTo(id: string, categorySlug: string | null) {
  const same = categorySlug ? await cards({ id: { not: id }, category: { slug: categorySlug } }, NEWEST, 8) : [];
  const more = same.length < 4 ? await cards({ id: { notIn: [id, ...same.map((c) => c.id)] } }, NEWEST, 8 - same.length) : [];
  return outLast([...same, ...more]);
}

/** A product's former address → its current one (the shop renamed it): old links and Google results still arrive. */
export const productMovedTo = unstable_cache(
  async (slug: string) => (await prisma.product.findFirst({ where: { oldSlugs: { has: slug }, active: true }, select: { slug: true } }))?.slug ?? null,
  ["product-moved-v1"],
  { tags: [CATALOG_TAG], revalidate: TTL },
);

/**
 * What the search looks through, kept in memory for a few minutes: for each
 * product on sale its words (names in both languages, the keywords the shop
 * typed, the category, the short description), and the phrases offered as
 * completions. See ./search for how a query is matched.
 */
const getSearchIndex = unstable_cache(
  async () => {
    const [rows, cats] = await Promise.all([
      prisma.product.findMany({
        where: { active: true },
        orderBy: [{ featured: "desc" }, { createdAt: "desc" }],
        select: { id: true, name: true, nameAr: true, keywords: true, summary: true, summaryAr: true, featured: true, category: { select: { name: true, nameAr: true } }, variants: { select: { name: true, nameAr: true } } },
      }),
      prisma.category.findMany({ where: { active: true, products: { some: { active: true } } }, select: { slug: true, name: true, nameAr: true } }),
    ]);
    return {
      docs: rows.map((r) => ({
        id: r.id,
        featured: r.featured,
        fields: [
          { tokens: tokenize(`${r.name} ${r.nameAr ?? ""}`), weight: 3 },
          { tokens: tokenize(r.keywords), weight: 2.5 },
          { tokens: tokenize(`${r.category?.name ?? ""} ${r.category?.nameAr ?? ""}`), weight: 1.5 },
          // "montre dorée", "لمبة كحلة": the options are words of the product too.
          { tokens: tokenize(r.variants.map((v) => `${v.name} ${v.nameAr ?? ""}`).join(" ")), weight: 1.5 },
          { tokens: tokenize(`${r.summary} ${r.summaryAr ?? ""}`), weight: 1 },
        ],
      })),
      categories: cats.map((c) => ({ ...c, doc: { id: c.slug, fields: [{ tokens: tokenize(`${c.name} ${c.nameAr ?? ""}`), weight: 3 }] } })),
      // Completions, in the language of what is typed (Arabic letters get Arabic phrases): the shop's
      // own names. Keywords help to find, but are not offered as text (they hold misspellings on purpose).
      phrases: {
        fr: [...cats.map((c) => c.name), ...rows.map((r) => r.name)],
        ar: [...cats.map((c) => c.nameAr ?? ""), ...rows.map((r) => r.nameAr ?? "")].filter(Boolean),
      },
    };
  },
  ["search-index-v2"],
  { tags: [CATALOG_TAG], revalidate: 300 },
);

const ARABIC = /[\u0600-\u06ff]/;

/**
 * The products a query finds, best first, even with a typing mistake. Results
 * far below the best one are dropped (a carpet for "montre" because its text
 * says "entretenir"). When every word cannot be found ("sac femme": the shop
 * never wrote "femme"), the word that finds the most in the names and keywords
 * is used alone, and said so: `relaxed` is that word.
 */
async function findProducts(q: string, opts: { prefix: boolean; limit: number }) {
  const index = await getSearchIndex();
  const featured = new Set(index.docs.filter((d) => d.featured).map((d) => d.id));
  const boost = (r: Ranked) => ({ ...r, score: r.score + (featured.has(r.id) ? 0.02 : 0) });
  let ranked = rank(q, index.docs, opts).map(boost);
  let relaxed: string | null = null;
  const words = tokenize(q).filter((w, i, a) => a.indexOf(w) === i);
  if (ranked.length === 0 && words.length >= 2) {
    // Names and keywords only: "noire" alone must not bring every black product.
    const strong = index.docs.map((d) => ({ id: d.id, fields: d.fields.slice(0, 2) }));
    const best = words
      .map((w, i) => ({ w, r: rank(w, strong, { ...opts, prefix: opts.prefix && i === words.length - 1 }) }))
      .filter((x) => x.r.length > 0)
      .sort((a, b) => b.r[0].score - a.r[0].score)[0];
    if (best) {
      ranked = best.r.map(boost);
      relaxed = best.r[0].corrected.get(best.w) ?? best.w;
    }
  }
  ranked.sort((a, b) => b.score - a.score);
  const top = ranked[0]?.score ?? 0;
  ranked = ranked.filter((r) => r.score >= top * 0.5);
  return { ranked, index, relaxed };
}

/**
 * The results page. When the best result was found by correcting a word,
 * the corrected query is returned, for "Résultats pour « lampe »".
 */
export async function searchProducts(q: string, take = 40): Promise<{ products: ProductCard[]; corrected: string | null; relaxed: string | null }> {
  const term = q.trim().slice(0, 80);
  if (term.length < 2) return { products: [], corrected: null, relaxed: null };
  const { ranked, relaxed } = await findProducts(term, { prefix: true, limit: take });
  if (ranked.length === 0) return { products: [], corrected: null, relaxed: null };
  if (relaxed) {
    const order = ranked.map((r) => r.id);
    const found = await cards({ id: { in: order } }, [], order.length);
    found.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    return { products: outLast(found), corrected: null, relaxed };
  }
  const order = ranked.map((r) => r.id);
  const found = await cards({ id: { in: order } }, [], order.length);
  found.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  const list = outLast(found);
  const fix = ranked[0].corrected;
  const corrected = fix.size ? tokenize(term).filter((w, i, a) => a.indexOf(w) === i).map((w) => fix.get(w) ?? w).join(" ") : null;
  return { products: list, corrected: corrected && corrected !== normalize(term) ? corrected : null, relaxed: null };
}

/** As the customer types: completions (Google's grey lines), products with their picture and price, categories. */
export async function suggest(q: string) {
  const term = q.trim().slice(0, 60);
  if (term.length < 2) return { completions: [], products: [], categories: [] };
  const { ranked, index } = await findProducts(term, { prefix: true, limit: 6 });
  const ids = ranked.map((r) => r.id);
  const rows = ids.length
    ? await prisma.product.findMany({
        where: { id: { in: ids }, active: true },
        select: { id: true, slug: true, name: true, nameAr: true, price: true, compareAt: true, variants: cardSelect.variants, offers: cardSelect.offers, images: { where: { kind: "GALLERY" }, orderBy: { sort: "asc" }, take: 1, select: { mediaId: true } } },
      })
    : [];
  rows.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  const categories = rank(term, index.categories.map((c) => c.doc), { prefix: true, limit: 3 }).map((r) => index.categories.find((c) => c.slug === r.id)!);
  return {
    completions: complete(term, ARABIC.test(term) ? index.phrases.ar : index.phrases.fr, 4),
    products: rows.map((p) => ({ slug: p.slug, name: p.name, nameAr: p.nameAr, price: cardPrice(p).price, imageId: p.images[0]?.mediaId ?? null })),
    categories: categories.map(({ slug, name, nameAr }) => ({ slug, name, nameAr })),
  };
}

/** The rows pricing needs, read fresh (never cached): this is the checkout. */
export async function loadCatalog(ids: string[]): Promise<Map<string, CatalogProduct>> {
  const unique = [...new Set(ids)].slice(0, 50);
  if (unique.length === 0) return new Map();
  const rows = await prisma.product.findMany({
    where: { id: { in: unique } },
    select: {
      id: true,
      slug: true,
      name: true,
      nameAr: true,
      price: true,
      cost: true,
      active: true,
      stockMode: true,
      stockQty: true,
      available: true,
      images: { where: { kind: "GALLERY" }, orderBy: { sort: "asc" }, take: 1, select: { mediaId: true } },
      variants: { select: { id: true, name: true, nameAr: true, price: true, stockQty: true, available: true } },
      offers: { select: { id: true, label: true, labelAr: true, quantity: true, price: true, freeDelivery: true, active: true, endsAt: true } },
    },
  });
  return new Map(
    rows.map((r) => [
      r.id,
      {
        id: r.id,
        slug: r.slug,
        name: r.name,
        nameAr: r.nameAr,
        price: r.price,
        cost: r.cost,
        active: r.active,
        stockMode: r.stockMode,
        stockQty: r.stockQty,
        available: r.available,
        imageId: r.images[0]?.mediaId ?? null,
        variants: r.variants,
        offers: r.offers,
      },
    ]),
  );
}

export async function allProductSlugs() {
  return prisma.product.findMany({ where: { active: true }, select: { slug: true, updatedAt: true } });
}
