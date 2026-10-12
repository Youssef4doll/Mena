import "server-only";
import { unstable_cache } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import type { CatalogProduct } from "./pricing";

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
  images: { orderBy: { sort: "asc" }, take: 2, select: { mediaId: true, alt: true, media: { select: { width: true, height: true, blur: true } } } },
  variants: { select: { stockQty: true, available: true, price: true } },
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
  compareAt: number | null;
  images: ImageRef[];
  stock: StockState;
  rating: { avg: number; count: number } | null;
};

function toCard(p: CardRow, ratings: Map<string, { avg: number; count: number }>): ProductCard {
  const variantPrices = p.variants.map((v) => v.price ?? p.price);
  const minPrice = variantPrices.length ? Math.min(...variantPrices) : p.price;
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    nameAr: p.nameAr,
    price: minPrice,
    priceFrom: variantPrices.some((x) => x !== minPrice),
    compareAt: p.compareAt != null && p.compareAt > minPrice ? p.compareAt : null,
    images: p.images.map((i) => ({ id: i.mediaId, alt: i.alt, width: i.media.width, height: i.media.height, blur: i.media.blur })),
    stock: stockState(p),
    rating: ratings.get(p.id) ?? null,
  };
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
  const ratings = await ratingsFor(rows.map((r) => r.id));
  return rows.map((r) => toCard(r, ratings));
}

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
  ["category-page-v1"],
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

/** Real units sold in the last 60 days (cancelled orders excluded), then the newest. */
async function popularIn(where: Prisma.ProductWhereInput, take: number) {
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
  if (ranked.length >= take) return ranked;
  const rest = await cards({ ...where, id: { notIn: ids } }, orderFor("new"), take - ranked.length);
  return [...ranked, ...rest];
}

export const getShop = unstable_cache(
  async (sort: SortKey) => (sort === "popular" ? popularIn({}, 120) : cards({}, orderFor(sort), 120)),
  ["shop-v1"],
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
      soldCount >= 5 ? popularIn({}, 8) : Promise.resolve([] as ProductCard[]),
      prisma.review.findMany({
        where: { status: "APPROVED", rating: { gte: 4 }, text: { not: null } },
        orderBy: { createdAt: "desc" },
        take: 6,
        select: { id: true, rating: true, text: true, authorName: true, governorate: true, createdAt: true, product: { select: { name: true, nameAr: true, slug: true } } },
      }),
    ]);
    return { featured, newest, bestsellers, reviews: reviews.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })) };
  },
  ["home-v1"],
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
        description: true,
        descriptionAr: true,
        price: true,
        compareAt: true,
        stockMode: true,
        stockQty: true,
        available: true,
        updatedAt: true,
        category: { select: { slug: true, name: true, nameAr: true } },
        images: { orderBy: { sort: "asc" }, select: { mediaId: true, alt: true, media: { select: { width: true, height: true, blur: true } } } },
        variants: { orderBy: { sort: "asc" }, select: { id: true, name: true, price: true, stockQty: true, available: true } },
      },
    });
    if (!p) return null;
    const [reviews, agg, related] = await Promise.all([
      prisma.review.findMany({
        where: { productId: p.id, status: "APPROVED" },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, rating: true, text: true, authorName: true, governorate: true, createdAt: true },
      }),
      prisma.review.aggregate({ where: { productId: p.id, status: "APPROVED" }, _avg: { rating: true }, _count: { _all: true } }),
      cards({ id: { not: p.id }, ...(p.category ? { category: { slug: p.category.slug } } : {}) }, [{ featured: "desc" }, { createdAt: "desc" }], 8),
    ]);
    const variants = p.variants.map((v) => ({
      id: v.id,
      name: v.name,
      price: v.price ?? p.price,
      soldOut: p.stockMode === "SUPPLIER" ? !v.available || !p.available : v.stockQty <= 0,
      lowQty: p.stockMode === "TRACKED" && v.stockQty > 0 && v.stockQty <= 5 ? v.stockQty : null,
    }));
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      nameAr: p.nameAr,
      description: p.description,
      descriptionAr: p.descriptionAr,
      price: p.price,
      compareAt: p.compareAt != null && p.compareAt > p.price ? p.compareAt : null,
      category: p.category,
      images: p.images.map((i) => ({ id: i.mediaId, alt: i.alt, width: i.media.width, height: i.media.height, blur: i.media.blur })),
      variants,
      stock: stockState(p),
      updatedAt: p.updatedAt.toISOString(),
      reviews: reviews.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
      rating: agg._count._all > 0 ? { avg: agg._avg.rating ?? 0, count: agg._count._all } : null,
      related,
    };
  },
  ["product-v1"],
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
      select: { slug: true, name: true, nameAr: true, price: true, images: { orderBy: { sort: "asc" }, take: 1, select: { mediaId: true } } },
    }),
    prisma.category.findMany({
      where: { active: true, OR: [{ name: { contains: term, mode: "insensitive" } }, { nameAr: { contains: term, mode: "insensitive" } }] },
      take: 3,
      select: { slug: true, name: true, nameAr: true },
    }),
  ]);
  return {
    products: products.map((p) => ({ slug: p.slug, name: p.name, nameAr: p.nameAr, price: p.price, imageId: p.images[0]?.mediaId ?? null })),
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
      images: { orderBy: { sort: "asc" }, take: 1, select: { mediaId: true } },
      variants: { select: { id: true, name: true, price: true, stockQty: true, available: true } },
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
      },
    ]),
  );
}

export async function allProductSlugs() {
  return prisma.product.findMany({ where: { active: true }, select: { slug: true, updatedAt: true } });
}
