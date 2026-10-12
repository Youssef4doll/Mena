import type { DeliveryZone } from "./settings-schema";
import { evaluatePromo, type PromoInput, type PromoResult } from "./promo";

/**
 * The one place a basket becomes a price. Pure: it is handed the catalog rows
 * the server just read, never anything the browser said about prices.
 *
 * The browser sends ids and quantities. Everything else — unit prices, what
 * is in stock, the delivery fee for the governorate, what a code is worth —
 * is decided here, from the database, every time.
 */

export const MAX_QTY_PER_LINE = 10;
export const MAX_LINES = 30;

export type CartLineInput = { productId: string; variantId?: string | null; qty: number };

export type CatalogVariant = {
  id: string;
  name: string;
  price: number | null;
  stockQty: number;
  available: boolean;
};

export type CatalogProduct = {
  id: string;
  slug: string;
  name: string;
  nameAr: string | null;
  price: number;
  cost: number | null;
  active: boolean;
  stockMode: "TRACKED" | "SUPPLIER";
  stockQty: number;
  available: boolean;
  imageId: string | null;
  variants: CatalogVariant[];
};

export type PricedLine = {
  productId: string;
  variantId: string | null;
  slug: string;
  name: string;
  nameAr: string | null;
  variantName: string | null;
  imageId: string | null;
  unitPrice: number;
  unitCost: number | null;
  qty: number;
  lineTotal: number;
};

export type LineProblem = {
  productId: string;
  variantId: string | null;
  kind: "not_found" | "unavailable" | "variant_required" | "qty_reduced";
  /** For qty_reduced: what is left. */
  available?: number;
};

export type Quote = {
  lines: PricedLine[];
  problems: LineProblem[];
  subtotal: number;
  discount: number;
  deliveryFee: number;
  total: number;
  /** Null until a governorate is chosen, or when the shop does not deliver there. */
  delivery: { minDays: number; maxDays: number; fee: number; free: boolean } | null;
  deliveryUnavailable: boolean;
  freeThreshold: number | null;
  /** Millimes still to add for free delivery; null when not applicable. */
  freeDeliveryRemaining: number | null;
  promo: { code: string; result: PromoResult } | null;
  costTotal: number | null;
};

/** How many of this product/variant can be sold right now. Infinity for supplier stock that is available. */
export function sellable(p: CatalogProduct, v: CatalogVariant | null): number {
  if (!p.active) return 0;
  if (p.stockMode === "SUPPLIER") {
    if (!p.available) return 0;
    if (v && !v.available) return 0;
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(0, v ? v.stockQty : p.stockQty);
}

/** Same product + variant twice in a basket counts once, quantities added. */
export function mergeLines(lines: CartLineInput[]): CartLineInput[] {
  const map = new Map<string, CartLineInput>();
  for (const l of lines) {
    if (!l.productId || !Number.isInteger(l.qty) || l.qty <= 0) continue;
    const key = `${l.productId}|${l.variantId ?? ""}`;
    const prev = map.get(key);
    map.set(key, { productId: l.productId, variantId: l.variantId ?? null, qty: (prev?.qty ?? 0) + l.qty });
  }
  return [...map.values()].slice(0, MAX_LINES);
}

export function priceCart(args: {
  lines: CartLineInput[];
  catalog: Map<string, CatalogProduct>;
  governorate: string | null;
  zones: Record<string, DeliveryZone>;
  freeThreshold: number | null;
  promo: PromoInput | null;
  phoneAlreadyUsedPromo: boolean;
  now: Date;
}): Quote {
  const problems: LineProblem[] = [];
  const priced: PricedLine[] = [];
  let costKnown = true;
  let costTotal = 0;

  for (const l of mergeLines(args.lines)) {
    const p = args.catalog.get(l.productId);
    if (!p || !p.active) {
      problems.push({ productId: l.productId, variantId: l.variantId ?? null, kind: "not_found" });
      continue;
    }
    let v: CatalogVariant | null = null;
    if (p.variants.length > 0) {
      v = p.variants.find((x) => x.id === l.variantId) ?? null;
      if (!v) {
        problems.push({ productId: p.id, variantId: l.variantId ?? null, kind: "variant_required" });
        continue;
      }
    }
    const max = Math.min(MAX_QTY_PER_LINE, sellable(p, v));
    if (max <= 0) {
      problems.push({ productId: p.id, variantId: v?.id ?? null, kind: "unavailable" });
      continue;
    }
    let qty = l.qty;
    if (qty > max) {
      qty = max;
      problems.push({ productId: p.id, variantId: v?.id ?? null, kind: "qty_reduced", available: max });
    }
    const unitPrice = v?.price ?? p.price;
    if (p.cost == null) costKnown = false;
    else costTotal += p.cost * qty;
    priced.push({
      productId: p.id,
      variantId: v?.id ?? null,
      slug: p.slug,
      name: p.name,
      nameAr: p.nameAr,
      variantName: v?.name ?? null,
      imageId: p.imageId,
      unitPrice,
      unitCost: p.cost,
      qty,
      lineTotal: unitPrice * qty,
    });
  }

  const subtotal = priced.reduce((s, l) => s + l.lineTotal, 0);

  let promo: Quote["promo"] = null;
  let discount = 0;
  let promoFreeDelivery = false;
  if (args.promo) {
    const result = evaluatePromo(args.promo, { subtotal, now: args.now, phoneAlreadyUsed: args.phoneAlreadyUsedPromo });
    promo = { code: args.promo.code, result };
    if (result.ok) {
      discount = result.discount;
      promoFreeDelivery = result.freeDelivery;
    }
  }

  const afterDiscount = subtotal - discount;
  const zone = args.governorate ? args.zones[args.governorate] : undefined;
  const deliveryUnavailable = Boolean(args.governorate) && (!zone || !zone.enabled);
  const thresholdMet = args.freeThreshold != null && afterDiscount >= args.freeThreshold;
  const free = promoFreeDelivery || thresholdMet;

  let delivery: Quote["delivery"] = null;
  let deliveryFee = 0;
  if (zone && zone.enabled && priced.length > 0) {
    deliveryFee = free ? 0 : zone.fee;
    delivery = { minDays: zone.minDays, maxDays: Math.max(zone.minDays, zone.maxDays), fee: deliveryFee, free };
  }

  const freeDeliveryRemaining =
    args.freeThreshold != null && !free && priced.length > 0 ? Math.max(0, args.freeThreshold - afterDiscount) : null;

  return {
    lines: priced,
    problems,
    subtotal,
    discount,
    deliveryFee,
    total: afterDiscount + deliveryFee,
    delivery,
    deliveryUnavailable,
    freeThreshold: args.freeThreshold,
    freeDeliveryRemaining,
    promo,
    costTotal: costKnown && priced.length > 0 ? costTotal : null,
  };
}
