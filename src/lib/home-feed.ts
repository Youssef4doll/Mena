import type { ProductCard } from "./catalog";

/**
 * The order of the home page's products, from what the shop really knows:
 * confirmed orders and views of the last 30 days (orders per view, smoothed
 * so a product seen twice and ordered once is not crowned), how new it is,
 * the shop's own selection, a real saving, a complete page. Then spread so
 * the same category never fills a screen. Nothing here is shown as a claim:
 * it only decides the order.
 */
export type FeedItem = {
  card: ProductCard;
  category: string | null;
  featured: boolean;
  /** Milliseconds. */
  createdAt: number;
  /** Confirmed orders and product views, last 30 days. */
  orders: number;
  views: number;
  photos: number;
  details: number;
};

const DAY = 86_400_000;

/** A real saving the card shows: a struck price, or a pack cheaper per unit. */
export const saving = (c: ProductCard): number => {
  const struck = c.compareAt && c.compareAt > c.price ? (c.compareAt - c.price) / c.compareAt : 0;
  const lead = c.packOf ? c.price / c.packOf : c.price;
  const pack = c.deal ? 1 - c.deal.price / c.deal.quantity / lead : 0;
  return Math.max(0, struck, pack);
};

export function score(i: FeedItem, now: number): number {
  const age = Math.max(0, (now - i.createdAt) / DAY);
  return (
    3 * Math.log1p(i.orders) +
    // Orders per view, with 20 views and 1 order of prior: a few lucky views weigh little.
    40 * ((i.orders + 0.2) / (i.views + 20)) +
    0.6 * Math.log1p(i.views) +
    2 * Math.max(0, 1 - age / 30) +
    (i.featured ? 1.5 : 0) +
    Math.min(1.2, 3 * saving(i.card)) +
    (i.photos >= 3 ? 0.5 : 0) +
    (i.details > 0 ? 0.5 : 0)
  );
}

/**
 * Best first, but never more than two of one category in a row while another
 * category still has products to show.
 */
export function diversify<T extends { category: string | null }>(ranked: T[]): T[] {
  const left = [...ranked];
  const out: T[] = [];
  while (left.length) {
    const [a, b] = [out.at(-1)?.category, out.at(-2)?.category];
    const blocked = a != null && a === b ? a : undefined;
    const i = blocked === undefined ? 0 : left.findIndex((x) => x.category !== blocked);
    out.push(...left.splice(i < 0 ? 0 : i, 1));
  }
  return out;
}

/** The whole feed: buyable products only, ranked, spread. */
export function rankFeed(items: FeedItem[], now: number): FeedItem[] {
  const buyable = items.filter((i) => i.card.stock.kind !== "out" && i.card.images.length > 0);
  const scored = buyable.map((i) => ({ i, s: score(i, now) })).sort((a, b) => b.s - a.s || b.i.createdAt - a.i.createdAt);
  return diversify(scored.map((x) => x.i));
}

/**
 * The visitor's own feed, in the browser: products of the categories they
 * looked at move up, what they already saw moves down (it is in "Vus
 * récemment"). Without history, the shop's order as it is.
 */
export function personalize<T extends { card: { id: string }; category: string | null }>(feed: T[], seen: string[]): T[] {
  if (!seen.length) return feed;
  const cats = new Map<string, number>();
  for (const id of seen) {
    const c = feed.find((f) => f.card.id === id)?.category;
    if (c) cats.set(c, (cats.get(c) ?? 0) + 1);
  }
  const rankOf = (f: T, n: number) => n - 4 * Math.min(2, cats.get(f.category ?? "") ?? 0) + (seen.includes(f.card.id) ? 40 : 0);
  return diversify(feed.map((f, n) => ({ f, r: rankOf(f, n), category: f.category })).sort((a, b) => a.r - b.r)).map((x) => x.f);
}
