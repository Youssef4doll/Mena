import "server-only";
import { prisma } from "./prisma";
import { loadCatalog } from "./catalog";
import { priceCart, type CartLineInput, type Quote } from "./pricing";
import { normalizeCode } from "./promo";
import { getSettings } from "./settings";
import { isGovernorate } from "./governorates";

/**
 * A basket priced from the database: catalog rows read fresh, delivery fees
 * from the settings, the code looked up by its text. Used by the cart drawer,
 * the checkout page and order placement — the same function, so what the
 * customer is shown is what they are charged.
 */
export async function quoteCart(input: {
  lines: CartLineInput[];
  governorate?: string | null;
  promoCode?: string | null;
  phone?: string | null;
}): Promise<Quote> {
  const settings = await getSettings();
  const catalog = await loadCatalog(input.lines.map((l) => l.productId));
  const gov = input.governorate && isGovernorate(input.governorate) ? input.governorate : null;

  let promo = null;
  let phoneAlreadyUsedPromo = false;
  const code = input.promoCode ? normalizeCode(input.promoCode) : "";
  if (code) {
    promo = await prisma.promoCode.findUnique({ where: { code } });
    if (promo && promo.oncePerPhone && input.phone) {
      const used = await prisma.order.count({ where: { promoCodeId: promo.id, phone: input.phone, status: { not: "CANCELLED" } } });
      phoneAlreadyUsedPromo = used > 0;
    }
  }

  const quote = priceCart({
    lines: input.lines,
    catalog,
    governorate: gov,
    zones: settings.delivery.zones,
    deliveryFee: settings.delivery.fee,
    freeThreshold: settings.delivery.freeThreshold,
    promo,
    phoneAlreadyUsedPromo,
    now: new Date(),
  });
  // An unknown code is reported like any refused one.
  if (code && !promo) quote.promo = { code, result: { ok: false, reason: "inactive" } };
  return quote;
}

/** What the browser may see of a quote: no supplier costs. */
export function publicQuote(q: Quote) {
  return {
    ...q,
    costTotal: undefined,
    lines: q.lines.map((l) => ({ ...l, unitCost: undefined })),
  };
}
export type PublicQuote = ReturnType<typeof publicQuote>;
