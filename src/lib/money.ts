/**
 * Money is carried as **millimes** (integers): 1 DT = 1 000 millimes.
 * Tunisian prices are written with three decimals — "89,900 DT".
 */

export type Locale = "fr" | "ar";

/**
 * "89,900 DT" (fr) or "89,900 د.ت" (ar). Latin digits in both: that is what Tunisian receipts print.
 * No space between thousands ("2100,000", not "2 100,000"): with three decimals, a spaced
 * thousand reads as two prices, and a line can break inside it.
 */
export function formatTND(millimes: number, locale: Locale = "fr"): string {
  if (!Number.isFinite(millimes)) return "—";
  const dt = millimes / 1000;
  const n = dt.toLocaleString("fr-FR", { minimumFractionDigits: 3, maximumFractionDigits: 3, useGrouping: false });
  return locale === "ar" ? `${n} د.ت` : `${n} DT`;
}

/** Back-office input: "89,9", "89.900", "1 200" → millimes. Null when unreadable. */
export function parseTND(input: string): number | null {
  const clean = input.replace(/\s|DT|TND|د\.ت/gi, "").replace(",", ".");
  if (!/^\d+(\.\d{0,3})?$/.test(clean)) return null;
  const [int, frac = ""] = clean.split(".");
  return Number(int) * 1000 + Number(frac.padEnd(3, "0"));
}

/** Millimes → "89.900" for an <input>. */
export function toInputTND(millimes: number | null | undefined): string {
  if (millimes == null) return "";
  return (millimes / 1000).toFixed(3);
}
