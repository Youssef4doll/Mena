import { formatTND } from "@/lib/money";
import { fmt } from "@/lib/viz";
import type { Quantiles } from "@/lib/ads/forecast-model";

/** Whole dinars: "38 DT". A forecast is never precise to the millime. */
export const dt = (m: number | null | undefined): string => (m == null || !Number.isFinite(m) ? "—" : formatTND(Math.round(m / 1000) * 1000).replace(/,000 DT$/, " DT"));
/** Small amounts (a CPM, a click) to the hundredth: "3,1 DT". */
export const dtFine = (m: number | null | undefined): string => (m == null || !Number.isFinite(m) ? "—" : `${(m / 1000).toLocaleString("fr-FR", { maximumFractionDigits: m < 10_000 ? 2 : 0 })} DT`);
export const pct = (x: number | null | undefined): string => fmt(x ?? null, "pct");
export const num = (x: number | null | undefined): string => (x == null || !Number.isFinite(x) ? "—" : Math.round(x).toLocaleString("fr-FR"));

/** "8 (4 à 13)": the median, then the 80 % range. A cost without an order in half the draws reads `none`. */
export function spread(q: Quantiles | null | undefined, f: (x: number) => string, none = "aucune commande dans la moitié des cas"): string {
  if (!q) return "—";
  const hi = Number.isFinite(q.p90) ? f(q.p90) : "beaucoup plus";
  if (!Number.isFinite(q.p50)) return none;
  return `${f(q.p50)} (${f(q.p10)} à ${hi})`;
}

/** "DT" in a text field → millimes; null when empty or unreadable. */
export function parseDt(s: string): number | null {
  const v = Number(s.replace(/\s/g, "").replace(",", "."));
  return s.trim() === "" || !Number.isFinite(v) || v < 0 ? null : Math.round(v * 1000);
}
