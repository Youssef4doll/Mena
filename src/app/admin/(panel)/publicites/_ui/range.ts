import { parseRange, tunisDay, type Range } from "@/lib/analytics-range";

/**
 * The period of every "Publicités" tab, read from the address (?p=14, or
 * ?p=custom&from=YYYY-MM-DD&to=YYYY-MM-DD) so a tab link, a reload or a
 * shared address keeps it. Ads are read over 7, 14, 30 or 90 days: 14 is
 * the usual window for a cash-on-delivery test, so it is offered here even
 * though the Analytics page does not have it. Pure, safe in client
 * components; the days are Tunisian days, as in analytics-range.
 *
 *   adRange(sp, now?)      → Range         the period and the previous one of the same length
 *   periodQuery(sp)        → string        "p=14" or "p=custom&from=…&to=…" ("" for the default), from raw params
 *   rangeQuery(r)          → string        the same, from a Range (for links built in a page)
 *   withPeriod(href, q)    → string        href with the period appended
 *   periodText(r)          → string        "du 21/9 au 20/10", for a page's hint
 *   AD_PRESETS, DEFAULT_PRESET
 */

export const AD_PRESETS = [
  { key: "7", label: "7 jours", days: 7 },
  { key: "14", label: "14 jours", days: 14 },
  { key: "30", label: "30 jours", days: 30 },
  { key: "90", label: "90 jours", days: 90 },
] as const;

/** Thirty days: long enough for most orders to be called and shipped, short enough to follow a campaign. */
export const DEFAULT_PRESET = "30";

const DAY = 86_400_000;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

type Params = { p?: string | string[]; from?: string | string[]; to?: string | string[] };

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

/**
 * A preset is turned into the custom days it stands for (the last `days`
 * Tunisian days, today included) so that both go through parseRange and
 * end at the same Tunis midnight.
 */
export function adRange(sp: Params, now: Date = new Date()): Range {
  const p = one(sp.p);
  const from = one(sp.from);
  const to = one(sp.to);
  if (p === "custom" && from && to && YMD.test(from) && YMD.test(to)) return parseRange({ p, from, to }, now);
  const preset = AD_PRESETS.find((x) => x.key === p) ?? AD_PRESETS.find((x) => x.key === DEFAULT_PRESET)!;
  const r = parseRange({ p: "custom", from: tunisDay(new Date(now.getTime() - (preset.days - 1) * DAY)), to: tunisDay(now) }, now);
  return { ...r, key: preset.key, label: preset.label };
}

/** The period part of an address, only with values adRange accepts; empty for the default period. */
export function periodQuery(sp: Params): string {
  const p = one(sp.p);
  const from = one(sp.from);
  const to = one(sp.to);
  if (p === "custom" && from && to && YMD.test(from) && YMD.test(to)) return `p=custom&from=${from}&to=${to}`;
  if (p && p !== DEFAULT_PRESET && AD_PRESETS.some((x) => x.key === p)) return `p=${p}`;
  return "";
}

/** The period of a Range as an address part: the last day shown is the day before `to`. */
export function rangeQuery(r: Range): string {
  if (r.key === "custom") return `p=custom&from=${tunisDay(r.from)}&to=${tunisDay(new Date(r.to.getTime() - DAY))}`;
  return r.key === DEFAULT_PRESET ? "" : `p=${r.key}`;
}

/** "/admin/publicites/campagnes?p=14", keeping what the href already has (query, #anchor). */
export function withPeriod(href: string, query: string): string {
  if (!query) return href;
  const [path, hash] = href.split("#");
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}${query}${hash != null ? `#${hash}` : ""}`;
}

/** "du 21/9 au 20/10" (or "le 20/10" for one day), Tunisian days, the last one included. */
export function periodText(r: Range): string {
  const d = (x: Date) => {
    const [, m, day] = tunisDay(x).split("-");
    return `${Number(day)}/${Number(m)}`;
  };
  const last = new Date(r.to.getTime() - DAY);
  return r.days <= 1 ? `le ${d(r.from)}` : `du ${d(r.from)} au ${d(last)}`;
}
