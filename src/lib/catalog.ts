import "server-only";
import { unstable_cache } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import type { CatalogProduct } from "./pricing";
import { leadOffer, offerCompareAt, offerLastDay, offersApply } from "./offer-display";
import { parseSpecs, parseVideo, soldStep } from "./product-content";

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

type PriceRow = { price: number; compareAt: number | null; variants: { price: number | null }[]; offers: { quantity: number; price: number; endsAt: Date | null; label?: string; labelAr?: string | null; freeDelivery?: boolean }[] };

/**
 * The price a list may show: what the product page will actually charge.
 * With offers, the one-unit offer (or the smallest pack, said as such);
 * otherwise the lowest option price, "from" when options differ.
 */
export function cardPrice(p: PriceRow, now = Date.now()) {
  const live = offersApply(p.price, p.variants) ? p.offers.filter((o) => !o.endsAt || o.endsAt.getTime() > now) : [];
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
  const live = offersApply(p.price, p.variants) ? p.offers.filter((o) => !o.endsAt || o.endsAt.getTime() > now) : [];
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
  ["home-categories-v3"],
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
    const category = await prisma.category.findFirst({ where: { slug, active: true }, select: { id: true, slug: true, name: true, nameAr: true } });
    if (!category) return null;
    const products = sort === "popular" ? await popularIn({ categoryId: category.id }, 60) : await cards({ categoryId: category.id }, orderFor(sort), 60);
    return { category, products };
  },
  ["category-page-v2"],
  { tags: [CATALOG_TAG], revalidate: TTL },
);

function orderFor(sort: SortKey): Prisma.ProductOrderByWithRelationInput[] {
  switch (sort) {
    case "price_asc":
      return [{ price: "asc" }];
    case "price_desc":
      return [{ price: "desc" }];
    default:
      return [{ featured: "desc" }, { createdAt: "desc" }];
  }
}

/**
 * Real units sold in the last 60 days (cancelled orders excluded). As a sort
 * order the list is topped up with the newest; as a "most ordered" claim
 * (fill = false) it is only what really sold.
 */
async function popularIn(where: Prisma.ProductWhereInput, take: number, fill = true) {
  const since = new Date(Date.now() - 60 * 86_400_000);
  const sold = await prisma.orderItem.groupBy({
    by: ["productId"],
    where: { productId: { not: null }, order: { createdAt: { gte: since }, status: { notIn: ["CANCELLED"] } }, product: { active: true, ...where } },
    _sum: { qty: true },
    orderBy: { _sum: { qty: "desc" } },
    take,
  });
  const ids = sold.map((s) => s.productId!).filter(Boolean);
  const ranked = ids.length ? await cards({ id: { in: ids } }, [], ids.length) : [];
  ranked.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  if (ranked.length >= take || !fill) return ranked;
  const rest = await cards({ ...where, id: { notIn: ids } }, orderFor("new"), take - ranked.length);
  return [...ranked, ...rest];
}

export const getShop = unstable_cache(
  async (sort: SortKey) => (sort === "popular" ? popularIn({}, 120) : cards({}, orderFor(sort), 120)),
  ["shop-v2"],
  { tags: [CATALOG_TAG], revalidate: TTL },
);

export const getHome = unstable_cache(
  async () => {
    const since = new Date(Date.now() - 60 * 86_400_000);
    const soldCount = await prisma.orderItem.count({ where: { order: { createdAt: { gte: since }, status: { not: "CANCELLED" } } } });
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
  ["home-v3"],
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
        price: true,
        compareAt: true,
        stockMode: true,
        stockQty: true,
        available: true,
        updatedAt: true,
        category: { select: { slug: true, name: true, nameAr: true } },
        images: { orderBy: { sort: "asc" }, select: { mediaId: true, alt: true, kind: true, media: { select: { width: true, height: true, blur: true } } } },
        variants: { orderBy: { sort: "asc" }, select: { id: true, name: true, price: true, stockQty: true, available: true } },
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
      cards({ id: { not: p.id }, ...(p.category ? { category: { slug: p.category.slug } } : {}) }, [{ featured: "desc" }, { createdAt: "desc" }], 8),
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
  ["product-v3"],
  { tags: [CATALOG_TAG], revalidate: TTL },
);
export type ProductPage = NonNullable<Awaited<ReturnType<typeof getProduct>>>;

/** Accent-insensitive enough for French and Arabic without an extension: ILIKE on names and descriptions. */
export async function searchProducts(q: string, take = 40) {
  const term = q.trim().slice(0, 80);
  if (term.length < 2) return [];
  const words = term.split(/\s+/).filter((w) => w.length >= 2).slice(0, 5);
  const where: Prisma.ProductWhereInput = {
    AND: words.map((w) => ({
      OR: [
        { name: { contains: w, mode: "insensitive" } },
        { nameAr: { contains: w, mode: "insensitive" } },
        { description: { contains: w, mode: "insensitive" } },
        { category: { name: { contains: w, mode: "insensitive" } } },
      ],
    })),
  };
  return cards(where, [{ featured: "desc" }, { createdAt: "desc" }], take);
}

export async function suggest(q: string) {
  const term = q.trim().slice(0, 60);
  if (term.length < 2) return { products: [], categories: [] };
  const [products, categories] = await Promise.all([
    prisma.product.findMany({
      where: { active: true, OR: [{ name: { contains: term, mode: "insensitive" } }, { nameAr: { contains: term, mode: "insensitive" } }] },
      orderBy: [{ featured: "desc" }, { createdAt: "desc" }],
      take: 6,
      select: { slug: true, name: true, nameAr: true, price: true, compareAt: true, variants: cardSelect.variants, offers: cardSelect.offers, images: { where: { kind: "GALLERY" }, orderBy: { sort: "asc" }, take: 1, select: { mediaId: true } } },
    }),
    prisma.category.findMany({
      where: { active: true, OR: [{ name: { contains: term, mode: "insensitive" } }, { nameAr: { contains: term, mode: "insensitive" } }] },
      take: 3,
      select: { slug: true, name: true, nameAr: true },
    }),
  ]);
  return {
    products: products.map((p) => ({ slug: p.slug, name: p.name, nameAr: p.nameAr, price: cardPrice(p).price, imageId: p.images[0]?.mediaId ?? null })),
    categories,
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
      variants: { select: { id: true, name: true, price: true, stockQty: true, available: true } },
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
