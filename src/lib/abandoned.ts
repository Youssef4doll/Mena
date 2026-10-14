import "server-only";
import { prisma } from "./prisma";
import { loadCatalog } from "./catalog";
import { mergeLines, priceCart, type CartLineInput } from "./pricing";
import { DEFAULT_SETTINGS } from "./settings-schema";

/** An order form left this long, with a product and no order, counts as unfinished. */
export const ABANDON_MINUTES = 60;

/** Shown in place of the option when the customer left before choosing one. */
const NO_OPTION = "option non choisie";

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
  // loadCatalog reads 50 products per call: past that, carts would drop out unpriced.
  const ids = [...new Set(lines.flat().map((l) => l.productId))];
  const parts = await Promise.all(Array.from({ length: Math.ceil(ids.length / 50) }, (_, k) => loadCatalog(ids.slice(k * 50, k * 50 + 50))));
  const catalog = new Map(parts.flatMap((m) => [...m]));
  const now = new Date();
  const quote = (l: CartLineInput[]) =>
    priceCart({ lines: l, catalog, governorate: null, zones: DEFAULT_SETTINGS.delivery.zones, freeThreshold: null, promo: null, phoneAlreadyUsedPromo: false, now });
  return carts
    .map((c, i) => {
      const q = quote(lines[i]);
      const items = q.lines.map((l) => ({ name: l.name, nameAr: l.nameAr, qty: l.qty, variant: [l.variantName, l.offerLabel].filter(Boolean).join(" · ") || null }));
      let value = q.subtotal;
      // Left before choosing an option (variant_required): valued at the cheapest option that can be sold.
      for (const l of mergeLines(lines[i])) {
        const p = catalog.get(l.productId);
        if (!p?.active || p.variants.length === 0 || p.variants.some((v) => v.id === l.variantId)) continue;
        const byPrice = [...p.variants].sort((a, b) => (a.price ?? p.price) - (b.price ?? p.price));
        const line = byPrice.map((v) => quote([{ ...l, variantId: v.id }]).lines[0]).find(Boolean);
        if (!line) continue;
        items.push({ name: line.name, nameAr: line.nameAr, qty: line.qty, variant: [NO_OPTION, line.offerLabel].filter(Boolean).join(" · ") });
        value += line.lineTotal;
      }
      return { cart: c, value, items };
    })
    .filter((x) => x.items.length > 0);
}
