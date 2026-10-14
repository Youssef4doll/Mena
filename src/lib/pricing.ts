import type { DeliveryZone } from "./settings-schema";
import { evaluatePromo, type PromoInput, type PromoResult } from "./promo";

/**
 * The one place a basket becomes a price. Pure: it is handed the catalog rows
 * the server just read, never anything the browser said about prices.
 *
 * The browser sends ids and quantities. Everything else — unit prices, what
 * is in stock, the delivery fee for the governorate, what a code is worth,
 * what an offer contains and costs — is decided here, from the database,
 * every time.
 */

export const MAX_QTY_PER_LINE = 10;
export const MAX_LINES = 30;

/**
 * One line of an order. With an offer, the offer decides the quantity and the
 * price; the qty sent alongside is ignored.
 */
export type CartLineInput = { productId: string; variantId?: string | null; offerId?: string | null; qty: number };

export type CatalogOffer = {
  id: string;
  label: string;
  labelAr: string | null;
  quantity: number;
  price: number;
  freeDelivery: boolean;
  active: boolean;
  endsAt: Date | null;
};

export type CatalogVariant = {
  id: string;
  name: string;
  nameAr?: string | null;
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
  offers?: CatalogOffer[];
};

export type PricedLine = {
  productId: string;
  variantId: string | null;
  slug: string;
  name: string;
  nameAr: string | null;
  variantName: string | null;
  variantNameAr: string | null;
  imageId: string | null;
  /** With an offer: the line total spread over the units, rounded (display and analytics only). */
  unitPrice: number;
  unitCost: number | null;
  qty: number;
  lineTotal: number;
  offerId: string | null;
  offerLabel: string | null;
  offerLabelAr: string | null;
  /** The offer includes delivery. */
  freeDelivery: boolean;
};

export type LineProblem = {
  productId: string;
  variantId: string | null;
  /** The offer of the refused line (null for a line sold by the unit), so a basket knows which line it is. */
  offerId?: string | null;
  kind: "not_found" | "unavailable" | "variant_required" | "qty_reduced" | "offer_unavailable";
  /** For qty_reduced, and for an offer larger than the stock: what is left. */
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

/** An offer can be bought while it is switched on and its end date (if any) has not passed. */
export function offerLive(o: CatalogOffer, now: Date): boolean {
  return o.active && (!o.endsAt || o.endsAt > now);
}

/**
 * Same product + variant twice counts once, quantities added. An offer line
 * stands on its own and is taken once: "2 + 1 offert" twice is not a thing
 * the page lets anyone ask for.
 */
export function mergeLines(lines: CartLineInput[]): CartLineInput[] {
  const map = new Map<string, CartLineInput>();
  for (const l of lines) {
    if (!l.productId || !Number.isInteger(l.qty) || l.qty <= 0) continue;
    const key = `${l.productId}|${l.variantId ?? ""}|${l.offerId ?? ""}`;
    const prev = map.get(key);
    if (l.offerId) {
      if (!prev) map.set(key, { productId: l.productId, variantId: l.variantId ?? null, offerId: l.offerId, qty: 1 });
      continue;
    }
    map.set(key, { productId: l.productId, variantId: l.variantId ?? null, offerId: null, qty: (prev?.qty ?? 0) + l.qty });
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
  // Units already taken by earlier lines of the same product and option: two lines never sell the same stock twice.
  const used = new Map<string, number>();
  const usedKey = (p: CatalogProduct, v: CatalogVariant | null) => `${p.id}|${v?.id ?? ""}`;

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
    if (l.offerId) {
      const offer = (p.offers ?? []).find((o) => o.id === l.offerId);
      // Offers are set at the product's price: an option with its own price is not sold through them.
      const ownPrice = v != null && v.price != null && v.price !== p.price;
      if (!offer || !offerLive(offer, args.now) || offer.quantity < 1 || ownPrice) {
        problems.push({ productId: p.id, variantId: v?.id ?? null, offerId: l.offerId, kind: "offer_unavailable" });
        continue;
      }
      // An offer is all or nothing: never a smaller quantity at the offer's price.
      const left = sellable(p, v) - (used.get(usedKey(p, v)) ?? 0);
      if (left < offer.quantity) {
        problems.push({ productId: p.id, variantId: v?.id ?? null, offerId: offer.id, kind: "unavailable", available: Math.max(0, left) });
        continue;
      }
      used.set(usedKey(p, v), (used.get(usedKey(p, v)) ?? 0) + offer.quantity);
      if (p.cost == null) costKnown = false;
      else costTotal += p.cost * offer.quantity;
      priced.push({
        productId: p.id,
        variantId: v?.id ?? null,
        slug: p.slug,
        name: p.name,
        nameAr: p.nameAr,
        variantName: v?.name ?? null,
        variantNameAr: v?.nameAr ?? null,
        imageId: p.imageId,
        unitPrice: Math.round(offer.price / offer.quantity),
        unitCost: p.cost,
        qty: offer.quantity,
        lineTotal: offer.price,
        offerId: offer.id,
        offerLabel: offer.label,
        offerLabelAr: offer.labelAr,
        freeDelivery: offer.freeDelivery,
      });
      continue;
    }

    const max = Math.min(MAX_QTY_PER_LINE, sellable(p, v) - (used.get(usedKey(p, v)) ?? 0));
    if (max <= 0) {
      problems.push({ productId: p.id, variantId: v?.id ?? null, offerId: null, kind: "unavailable", ...(used.has(usedKey(p, v)) ? { available: 0 } : {}) });
      continue;
    }
    let qty = l.qty;
    if (qty > max) {
      qty = max;
      problems.push({ productId: p.id, variantId: v?.id ?? null, offerId: null, kind: "qty_reduced", available: max });
    }
    used.set(usedKey(p, v), (used.get(usedKey(p, v)) ?? 0) + qty);
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
      variantNameAr: v?.nameAr ?? null,
      imageId: p.imageId,
      unitPrice,
      unitCost: p.cost,
      qty,
      lineTotal: unitPrice * qty,
      offerId: null,
      offerLabel: null,
      offerLabelAr: null,
      freeDelivery: false,
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
  const free = promoFreeDelivery || thresholdMet || priced.some((l) => l.freeDelivery);

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
