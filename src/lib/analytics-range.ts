/**
 * Date ranges for the analytics, in Tunisian time (UTC+1, no daylight saving
 * since 2009). Pure, so it is tested.
 */
export const TZ = "Africa/Tunis";
const OFFSET_MS = 60 * 60_000;
const DAY = 86_400_000;

export type Range = { key: string; from: Date; to: Date; days: number; label: string; prevFrom: Date; prevTo: Date };

/** Midnight in Tunis of the day containing `d`, as a UTC instant. */
export function tunisMidnight(d: Date): Date {
  const local = d.getTime() + OFFSET_MS;
  return new Date(Math.floor(local / DAY) * DAY - OFFSET_MS);
}

/** "2026-10-12" for the Tunis calendar day of `d`. */
export function tunisDay(d: Date): string {
  return new Date(d.getTime() + OFFSET_MS).toISOString().slice(0, 10);
}

export const PRESETS = [
  { key: "today", label: "Aujourd'hui", days: 1 },
  { key: "7", label: "7 jours", days: 7 },
  { key: "30", label: "30 jours", days: 30 },
  { key: "90", label: "90 jours", days: 90 },
] as const;

/**
 * A preset ("today", "7", "30", "90") or a custom from/to (YYYY-MM-DD,
 * inclusive), clamped to 366 days. The previous period has the same length
 * and ends where this one starts, for the deltas.
 */
export function parseRange(sp: { p?: string; from?: string; to?: string }, now = new Date()): Range {
  const today = tunisMidnight(now);
  const tomorrow = new Date(today.getTime() + DAY);
  let from: Date;
  let to: Date;
  let key: string;
  let label: string;
  const ymd = /^\d{4}-\d{2}-\d{2}$/;
  if (sp.p === "custom" && sp.from && sp.to && ymd.test(sp.from) && ymd.test(sp.to)) {
    from = new Date(Date.parse(`${sp.from}T00:00:00Z`) - OFFSET_MS);
    to = new Date(Date.parse(`${sp.to}T00:00:00Z`) - OFFSET_MS + DAY);
    if (!(to > from)) [from, to] = [to, from];
    if (to.getTime() - from.getTime() > 366 * DAY) from = new Date(to.getTime() - 366 * DAY);
    key = "custom";
    label = `${sp.from} → ${sp.to}`;
  } else {
    const preset = PRESETS.find((x) => x.key === sp.p) ?? PRESETS[2];
    to = tomorrow;
    from = new Date(tomorrow.getTime() - preset.days * DAY);
    key = preset.key;
    label = preset.label;
  }
  const len = to.getTime() - from.getTime();
  return { key, from, to, days: Math.round(len / DAY), label, prevFrom: new Date(from.getTime() - len), prevTo: from };
}

/** Relative change; null when there is nothing to compare with. */
export function delta(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return (current - previous) / previous;
}

export function ratio(n: number, d: number): number | null {
  return d > 0 ? n / d : null;
}

/** Every calendar day of the range, so a day without orders is a zero, not a gap. */
export function daysOf(r: Range): string[] {
  const out: string[] = [];
  for (let t = r.from.getTime(); t < r.to.getTime(); t += DAY) out.push(tunisDay(new Date(t)));
  return out;
}

/** An instant `n` days before now. (Kept out of components: the lint treats Date.now() in a render as impure.) */
export function daysAgo(n: number, now = Date.now()): Date {
  return new Date(now - n * DAY);
}

export function minutesAgo(n: number, now = Date.now()): Date {
  return new Date(now - n * 60_000);
}
