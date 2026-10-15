/**
 * What the shop really keeps from a period, in millimes. Pure, so it is
 * tested. A figure the owner has not given (a carrier cost, the ad spend) is
 * not guessed: the result says what is missing, and the total is only
 * returned when nothing is.
 */
export type ProfitInput = {
  /** Totals of delivered orders: what the customers paid, delivery fee included. */
  deliveredRevenue: number;
  delivered: number;
  /** Supplier cost of the delivered orders whose cost is known, and how many are not known. */
  productCost: number;
  costUnknown: number;
  /** Parcels handed to the carrier (delivered, refused, returned, on the way). */
  parcels: number;
  /** Parcels that came back (refused at the door, or returned). */
  backParcels: number;
  carrierPerParcel: number | null;
  returnPerParcel: number | null;
  /** Null when no spend was entered for the period. */
  adSpend: number | null;
};

export type Profit = {
  carrierCost: number | null;
  returnCost: number | null;
  /** Revenue − product cost − carrier − returns, before ads. Null when a cost is missing. */
  beforeAds: number | null;
  /** The same, after ads. */
  contribution: number | null;
  costPerDelivered: number | null;
  missing: ("productCost" | "carrierCost" | "returnCost" | "adSpend")[];
};

export function profit(i: ProfitInput): Profit {
  const missing: Profit["missing"] = [];
  if (i.costUnknown > 0) missing.push("productCost");
  const carrierCost = i.carrierPerParcel == null ? null : i.carrierPerParcel * i.parcels;
  if (carrierCost == null && i.parcels > 0) missing.push("carrierCost");
  const returnCost = i.returnPerParcel == null ? (i.backParcels === 0 ? 0 : null) : i.returnPerParcel * i.backParcels;
  if (returnCost == null) missing.push("returnCost");
  if (i.adSpend == null) missing.push("adSpend");
  const known = !missing.includes("productCost") && !missing.includes("carrierCost") && returnCost != null;
  const beforeAds = known ? i.deliveredRevenue - i.productCost - (carrierCost ?? 0) - returnCost : null;
  return {
    carrierCost,
    returnCost,
    beforeAds,
    contribution: beforeAds != null && i.adSpend != null ? beforeAds - i.adSpend : null,
    costPerDelivered: i.adSpend != null && i.delivered > 0 ? Math.round(i.adSpend / i.delivered) : null,
    missing,
  };
}

/** The part of a spend row inside [from, to): a weekly total counts for the days of it in the period. */
export function spendInRange(row: { day: string; days: number; amount: number }, from: string, to: string): number {
  const DAY = 86_400_000;
  const start = Date.parse(`${row.day}T00:00:00Z`);
  const end = start + Math.max(1, row.days) * DAY;
  const a = Math.max(start, Date.parse(`${from}T00:00:00Z`));
  const b = Math.min(end, Date.parse(`${to}T00:00:00Z`));
  if (b <= a) return 0;
  return Math.round((row.amount * (b - a)) / (end - start));
}
