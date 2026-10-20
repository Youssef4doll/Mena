/**
 * How much the shop can pay the ad platforms for an order, per product and
 * per offer, before the ads eat the margin. Cash on delivery changes the
 * maths: a placed order is only worth its chance of being confirmed and
 * delivered, every parcel sent costs the carrier, and every parcel refused
 * costs the way back with no money in. Pure, so it is tested. Millimes.
 *
 *   unitMargin(u)                 → number | null    what one delivered order leaves before ads
 *   breakEven(i)                  → BreakEven        every ceiling for one product or offer
 *   productBreakEvens(p, shop)    → OfferBreakEven[] the single unit, then each active offer
 *   levers(i)                     → Lever[]          what a better price, cost, confirmation or delivery gives
 */

export type UnitInput = {
  /** What the customer pays for the goods: the unit price, or the offer's price for its units. */
  price: number;
  units: number;
  /** Supplier cost of one unit; null when unknown. */
  unitCost: number | null;
  /** Delivery fee the customer pays on top; 0 when the offer or the free-delivery threshold makes it free. */
  deliveryFee: number;
  carrierPerParcel: number | null;
  returnPerParcel: number | null;
  /** Share of placed orders confirmed by phone, and of shipped parcels delivered (the shop's own rates). */
  confirmRate: number | null;
  deliveryRate: number | null;
  /** Measured, for the platform ceilings: orders per visit, visits per link click, link clicks per impression. */
  orderRate?: number | null;
  landingRate?: number | null;
  ctr?: number | null;
  /** What a placed order costs in ads today, for the rates the product needs to stay profitable. */
  cpa?: number | null;
};

export type BreakEvenInput = "unitCost" | "carrierCost" | "returnCost" | "confirmRate" | "deliveryRate" | "orderRate" | "landingRate" | "ctr" | "cpa";

export type BreakEven = {
  /** What a delivered order brings in: goods + delivery fee. */
  revenue: number;
  productCost: number | null;
  /** Carrier and returns carried by each delivered order: every parcel pays the carrier, refused ones also pay the way back. */
  shippingPerDelivered: number | null;
  /** What one delivered order leaves before ads. Negative: the product loses money even with free ads. */
  margin: number | null;
  /** Share of placed orders that end delivered (confirmation × delivery). */
  netDeliveryRate: number | null;
  /** Ceilings, never below 0: above them every sale loses money. */
  maxCostPerDelivered: number | null;
  maxCpa: number | null;
  maxCostPerVisit: number | null;
  maxCpc: number | null;
  /** Per 1 000 impressions. */
  maxCpm: number | null;
  /** Delivered revenue per 1 DT of ads under which the ads lose money. */
  minRoas: number | null;
  /** At today's CPA: the delivery rate, and the confirmation rate, under which the product loses money. Above 1: it loses money whatever the rate. */
  minDeliveryRate: number | null;
  minConfirmRate: number | null;
  missing: BreakEvenInput[];
};

/**
 * What one delivered order leaves before ads: revenue − product − carrier and
 * returns spread over the delivered orders. With a delivery rate d, each
 * delivered order carries 1/d parcels sent and (1−d)/d parcels back.
 */
export function unitMargin(u: { revenue: number; productCost: number | null; carrierPerParcel: number | null; returnPerParcel: number | null; deliveryRate: number | null }): number | null {
  const ship = shippingPerDelivered(u.carrierPerParcel, u.returnPerParcel, u.deliveryRate);
  if (u.productCost == null || ship == null) return null;
  return Math.round(u.revenue - u.productCost - ship);
}

function shippingPerDelivered(carrier: number | null, ret: number | null, d: number | null): number | null {
  if (carrier == null || d == null || !(d > 0)) return null;
  const back = Math.max(0, 1 - Math.min(1, d));
  // No parcel comes back: an unknown return cost does not matter.
  const returnCost = back === 0 ? 0 : ret;
  if (returnCost == null) return null;
  return (carrier + returnCost * back) / Math.min(1, d);
}

export function breakEven(i: UnitInput): BreakEven {
  const missing: BreakEvenInput[] = [];
  const revenue = i.price + i.deliveryFee;
  const productCost = i.unitCost == null ? null : i.unitCost * i.units;
  if (productCost == null) missing.push("unitCost");
  if (i.carrierPerParcel == null) missing.push("carrierCost");
  if (i.deliveryRate == null) missing.push("deliveryRate");
  else if (i.returnPerParcel == null && i.deliveryRate < 1) missing.push("returnCost");
  if (i.confirmRate == null) missing.push("confirmRate");

  const ship = shippingPerDelivered(i.carrierPerParcel, i.returnPerParcel, i.deliveryRate);
  const margin = productCost == null || ship == null ? null : Math.round(revenue - productCost - ship);
  const net = i.confirmRate != null && i.deliveryRate != null ? i.confirmRate * i.deliveryRate : null;
  const maxCpd = margin == null ? null : Math.max(0, margin);
  // Ceilings are chained from the unrounded max CPA, rounded once each.
  const maxCpaRaw = maxCpd == null || net == null ? null : maxCpd * net;
  const maxCpa = maxCpaRaw == null ? null : Math.round(maxCpaRaw);

  const orderRate = i.orderRate ?? null;
  const landing = i.landingRate ?? null;
  const ctr = i.ctr ?? null;
  if (orderRate == null) missing.push("orderRate");
  if (landing == null) missing.push("landingRate");
  if (ctr == null) missing.push("ctr");
  const maxCostPerVisit = maxCpaRaw == null || orderRate == null ? null : Math.round(maxCpaRaw * orderRate);
  const maxCpcRaw = maxCpaRaw == null || orderRate == null || landing == null ? null : maxCpaRaw * orderRate * landing;
  const maxCpc = maxCpcRaw == null ? null : Math.round(maxCpcRaw);
  const maxCpm = maxCpcRaw == null || ctr == null ? null : Math.round(maxCpcRaw * ctr * 1000);

  // Per placed order at CPA a, confirmation c, delivery d, revenue R, product P, carrier k, return r:
  //   profit = c · [d·(R − P) − k − r·(1 − d)] − a
  // so the product breaks even at d = (a/c + k + r) / (R − P + r), and at c = a / (d·(R − P) − k − r·(1 − d)).
  const cpa = i.cpa ?? null;
  if (cpa == null) missing.push("cpa");
  const r = i.returnPerParcel;
  let minDeliveryRate: number | null = null;
  let minConfirmRate: number | null = null;
  if (cpa != null && productCost != null && i.carrierPerParcel != null && r != null) {
    const gain = revenue - productCost + r;
    if (i.confirmRate != null && i.confirmRate > 0 && gain > 0) minDeliveryRate = (cpa / i.confirmRate + i.carrierPerParcel + r) / gain;
    if (i.deliveryRate != null) {
      const perShipped = i.deliveryRate * (revenue - productCost) - i.carrierPerParcel - r * (1 - i.deliveryRate);
      if (perShipped > 0) minConfirmRate = cpa / perShipped;
    }
  }

  return {
    revenue,
    productCost,
    shippingPerDelivered: ship == null ? null : Math.round(ship),
    margin,
    netDeliveryRate: net,
    maxCostPerDelivered: maxCpd,
    maxCpa,
    maxCostPerVisit,
    maxCpc,
    maxCpm,
    minRoas: margin != null && margin > 0 ? revenue / margin : null,
    minDeliveryRate,
    minConfirmRate,
    missing,
  };
}

/** The shop's side of the sum, shared by every product: settings and measured rates. */
export type ShopEconomics = {
  deliveryFee: number;
  /** Goods total from which delivery is free; null: never. */
  freeThreshold: number | null;
  carrierPerParcel: number | null;
  returnPerParcel: number | null;
  confirmRate: number | null;
  deliveryRate: number | null;
  orderRate?: number | null;
  landingRate?: number | null;
  ctr?: number | null;
  cpa?: number | null;
};

export type ProductEconomics = {
  price: number;
  cost: number | null;
  offers?: { id: string; label: string; quantity: number; price: number; freeDelivery: boolean; active?: boolean }[];
};

export type OfferBreakEven = { key: string; label: string; units: number; input: UnitInput; result: BreakEven };

/** The single unit ("unit"), then each active offer: a pack often has the room a single unit lacks. */
export function productBreakEvens(p: ProductEconomics, shop: ShopEconomics): OfferBreakEven[] {
  const fee = (goods: number, free: boolean) => (free || (shop.freeThreshold != null && goods >= shop.freeThreshold) ? 0 : shop.deliveryFee);
  const rates = {
    carrierPerParcel: shop.carrierPerParcel,
    returnPerParcel: shop.returnPerParcel,
    confirmRate: shop.confirmRate,
    deliveryRate: shop.deliveryRate,
    orderRate: shop.orderRate,
    landingRate: shop.landingRate,
    ctr: shop.ctr,
    cpa: shop.cpa,
  };
  const entry = (key: string, label: string, units: number, price: number, free: boolean): OfferBreakEven => {
    const input: UnitInput = { ...rates, price, units, unitCost: p.cost, deliveryFee: fee(price, free) };
    return { key, label, units, input, result: breakEven(input) };
  };
  return [
    entry("unit", "1 article", 1, p.price, false),
    ...(p.offers ?? []).filter((o) => o.active !== false && o.quantity > 0).map((o) => entry(o.id, o.label, o.quantity, o.price, o.freeDelivery)),
  ];
}

/** +5 DT on the price: a step a customer barely notices on a 50–90 DT product. */
export const LEVER_PRICE_STEP = 5_000;
/** −10 % on the supplier cost: what a second supplier quote or a bigger order often gives. */
export const LEVER_COST_CUT = 0.1;
/** +5 points of confirmation or delivery: what calling within the hour or a reminder the day before usually moves. */
export const LEVER_RATE_STEP = 0.05;
/** A rate is never pushed above this in a what-if: no shop delivers every parcel. */
const RATE_CAP = 0.98;

export type Lever = { key: "price" | "unitCost" | "confirmRate" | "deliveryRate"; label: string; maxCpa: number | null; maxCostPerDelivered: number | null; gain: number | null };

/** What each lever adds to the max CPA (and the max cost per delivered order), all else equal. Sorted by gain, largest first. */
export function levers(i: UnitInput): Lever[] {
  const now = breakEven(i);
  const one = (key: Lever["key"], label: string, change: Partial<UnitInput>): Lever => {
    const r = breakEven({ ...i, ...change });
    return { key, label, maxCpa: r.maxCpa, maxCostPerDelivered: r.maxCostPerDelivered, gain: r.maxCpa != null && now.maxCpa != null ? r.maxCpa - now.maxCpa : null };
  };
  const step = (v: number | null) => (v == null ? null : Math.min(RATE_CAP, v + LEVER_RATE_STEP));
  const out: Lever[] = [one("price", "Prix +5 DT", { price: i.price + LEVER_PRICE_STEP })];
  if (i.unitCost != null) out.push(one("unitCost", "Coût fournisseur −10 %", { unitCost: Math.round(i.unitCost * (1 - LEVER_COST_CUT)) }));
  if (i.confirmRate != null && i.confirmRate < RATE_CAP) out.push(one("confirmRate", "Confirmation +5 points", { confirmRate: step(i.confirmRate) }));
  if (i.deliveryRate != null && i.deliveryRate < RATE_CAP) out.push(one("deliveryRate", "Livraison +5 points", { deliveryRate: step(i.deliveryRate) }));
  return out.sort((a, b) => (b.gain ?? -Infinity) - (a.gain ?? -Infinity));
}
