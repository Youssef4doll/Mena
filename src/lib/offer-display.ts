/**
 * How offers are shown, in one place for the cards, the product page and
 * Google's structured data. Pure: imported on the server and in the browser.
 * The checkout never relies on it; pricing.ts decides what is charged.
 */

type Priced = { quantity: number; price: number };

/**
 * Offers are set at the product's price. A product whose options carry their
 * own prices is sold option by option, so its offers are not shown.
 */
export function offersApply(price: number, variants: { price: number | null }[]): boolean {
  return variants.every((v) => v.price == null || v.price === price);
}

/** The offer a list shows first: one unit when the shop sells one, otherwise the smallest pack. */
export function leadOffer<T extends Priced>(offers: T[]): T | null {
  return offers.find((o) => o.quantity === 1) ?? [...offers].sort((a, b) => a.quantity - b.quantity || a.price - b.price)[0] ?? null;
}

/**
 * "Instead of": the same units bought one by one at the shop's own one-unit
 * offer. Null when the shop sells no single unit (there is then no real price
 * to compare with) or when the pack saves nothing.
 */
export function offerCompareAt(offers: Priced[], o: Priced): number | null {
  if (o.quantity <= 1) return null;
  const one = offers.find((x) => x.quantity === 1);
  if (!one) return null;
  const separately = one.price * o.quantity;
  return separately > o.price ? separately : null;
}

/** The last day an offer can be ordered, in Tunis ("YYYY-MM-DD"). It ends at midnight after that day. */
export function offerLastDay(endsAt: Date): string {
  return new Date(endsAt.getTime() - 1).toLocaleDateString("en-CA", { timeZone: "Africa/Tunis" });
}

/** "15 octobre" from "2026-10-15", the same on the server and in any browser. */
export function formatDay(day: string, locale: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString(locale, { day: "numeric", month: "long", timeZone: "UTC" });
}
