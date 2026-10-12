/**
 * In-memory fixed windows. A floor against floods and scripted orders, per
 * server instance — on serverless each instance counts on its own, so the
 * real protections (duplicate detection, phone confirmation) live elsewhere.
 */
type Window = { count: number; resetAt: number };
const buckets = new Map<string, Window>();
const MAX_KEYS = 20_000;

export type RateLimitResult = { ok: boolean; retryAfter: number };

export function hit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const w = buckets.get(key);
  if (!w || w.resetAt <= now) {
    if (buckets.size >= MAX_KEYS) for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
    if (buckets.size >= MAX_KEYS) buckets.clear();
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  w.count += 1;
  const retryAfter = Math.max(1, Math.ceil((w.resetAt - now) / 1000));
  return { ok: w.count <= limit, retryAfter };
}

export const LIMITS = {
  events: { limit: 120, windowMs: 60_000 },
  quote: { limit: 60, windowMs: 60_000 },
  // Loose: Tunisian mobile carriers put many customers behind one address (CGNAT).
  order: { limit: 20, windowMs: 10 * 60_000 },
  lookup: { limit: 10, windowMs: 10 * 60_000 },
  login: { limit: 8, windowMs: 15 * 60_000 },
  cart: { limit: 60, windowMs: 60_000 },
  review: { limit: 10, windowMs: 60 * 60_000 },
  suggest: { limit: 120, windowMs: 60_000 },
} as const;

/** The client address as the platform reports it (Vercel sets x-forwarded-for; the first hop is the client). */
export function callerIp(headers: Headers): string {
  return (
    headers.get("x-real-ip") ??
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}
