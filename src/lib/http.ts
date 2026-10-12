import "server-only";
import { NextResponse } from "next/server";
import { callerIp, hit } from "./rate-limit";
import { hashIp } from "./tokens";

/** Reads a JSON body without trusting Content-Length; anything over `max` bytes is refused. */
export async function readJson(request: Request, max = 16_384): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return null;
  }
}

export function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(data, { status, headers: { "cache-control": "no-store", ...headers } });
}

/** A per-IP window; returns a 429 response when spent, null otherwise. */
export function limit(request: Request, bucket: string, cfg: { limit: number; windowMs: number }) {
  const ip = callerIp(request.headers);
  const r = hit(`${bucket}:${ip}`, cfg.limit, cfg.windowMs);
  return r.ok ? null : json({ ok: false, error: "rate_limited" }, 429, { "retry-after": String(r.retryAfter) });
}

export function clientContext(request: Request) {
  const ip = callerIp(request.headers);
  return { ip, ipHash: hashIp(ip), ua: request.headers.get("user-agent") };
}

/** Writes from another site are refused: the storefront's own pages are the only legitimate callers. */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // same-origin fetches from older browsers, server-to-server tests
  try {
    return new URL(origin).host === new URL(request.url).host || new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}
