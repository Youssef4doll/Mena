import "server-only";
import { prisma } from "./prisma";
import { loadCatalog } from "./catalog";
import { priceCart, type CartLineInput } from "./pricing";
import { DEFAULT_SETTINGS } from "./settings-schema";

/** An order form left this long, with a product and no order, counts as unfinished. */
export const ABANDON_MINUTES = 60;

/**
 * Abandoned carts with their value at today's prices (read from the catalog,
 * never from the cart). Bounded by date and count.
 */
export async function abandonedCarts(days = 30, take = 200) {
  const cutoff = new Date(Date.now() - ABANDON_MINUTES * 60_000);
  const since = new Date(Date.now() - days * 86_400_000);
  const carts = await prisma.cart.findMany({
    where: { status: "ACTIVE", updatedAt: { lt: cutoff, gte: since } },
    orderBy: { updatedAt: "desc" },
    take,
  });
  const lines = carts.map((c) => (Array.isArray(c.lines) ? (c.lines as CartLineInput[]) : []));
  const catalog = await loadCatalog(lines.flat().map((l) => l.productId));
  return carts
    .map((c, i) => {
      const q = priceCart({ lines: lines[i], catalog, governorate: null, zones: DEFAULT_SETTINGS.delivery.zones, freeThreshold: null, promo: null, phoneAlreadyUsedPromo: false, now: new Date() });
      return { cart: c, value: q.subtotal, items: q.lines.map((l) => ({ name: l.name, qty: l.qty, variant: [l.variantName, l.offerLabel].filter(Boolean).join(" · ") || null })) };
    })
    .filter((x) => x.items.length > 0);
}
