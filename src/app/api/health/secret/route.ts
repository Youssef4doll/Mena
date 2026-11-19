import { hasSecret } from "@/lib/tokens";

/**
 * Whether the server has its APP_SECRET, answered as a picture so it can be
 * checked from tools that only fetch images: a 1×1 PNG when it is set, 503
 * when it is not. Says nothing about the value.
 */
const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

export const dynamic = "force-dynamic";

export function GET() {
  if (!hasSecret()) return new Response("APP_SECRET missing", { status: 503, headers: { "cache-control": "no-store" } });
  return new Response(new Uint8Array(PIXEL), { headers: { "content-type": "image/png", "cache-control": "no-store", "netlify-cdn-cache-control": "no-store" } });
}
