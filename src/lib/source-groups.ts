import { normSource } from "./ads/match";

/**
 * Rows counted per source, folded the way the ads matching folds them
 * ("fb" and "facebook.com" are "facebook", "ig" is "instagram"): one row per
 * platform in the reports. A session or an order has one source, so their
 * counts add up; the campaign, when there is one, stays apart.
 */
export function groupSources<T extends { source: string; campaign?: string | null }>(rows: T[], sum: (keyof T)[]): T[] {
  const out = new Map<string, T>();
  for (const r of rows) {
    const source = normSource(r.source);
    const key = `${source}|${r.campaign ?? ""}`;
    const had = out.get(key);
    if (!had) {
      out.set(key, { ...r, source });
      continue;
    }
    for (const k of sum) (had[k] as number) = (had[k] as number) + (r[k] as number);
  }
  return [...out.values()];
}

/**
 * The source that turns the most visits into orders, among those with enough
 * visits to say so (50), or null: never one without any order, which would
 * be "best at 0 %".
 */
export function bestSource<T extends { sessions: number; orders: number }>(rows: T[], minSessions = 50): T | null {
  const enough = rows.filter((s) => s.sessions >= minSessions);
  if (enough.length < 2) return null;
  const best = enough.reduce((x, y) => (y.orders / y.sessions > x.orders / x.sessions ? y : x));
  return best.orders > 0 ? best : null;
}
