import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { IMG_WIDTHS } from "@/lib/image-loader";

/**
 * Product pictures, resized on first request and then served from the CDN
 * for a year (the id changes when the picture does): `s-maxage` is what keeps
 * them on the CDN, `max-age` in the phone. Only the widths the
 * loader asks for are produced, so the cache holds a handful per image.
 *
 * Without a CDN in front (Cloud Run), every new visitor would ask the server
 * again: the resized pictures are also kept in memory, the most recent first,
 * up to MEMORY_BYTES, so each size is made once per server start and the
 * database is not read again for it.
 */
const MEMORY_BYTES = 64 * 1024 * 1024;
const memory = new Map<string, Uint8Array<ArrayBuffer>>();
let held = 0;

function remember(key: string, bytes: Uint8Array<ArrayBuffer>) {
  // Two first visitors at once both resize: count the picture once.
  if (bytes.length > MEMORY_BYTES / 8 || memory.has(key)) return;
  memory.set(key, bytes);
  held += bytes.length;
  for (const [k, v] of memory) {
    if (held <= MEMORY_BYTES) break;
    memory.delete(k);
    held -= v.length;
  }
}

function recall(key: string) {
  const bytes = memory.get(key);
  if (bytes) {
    // Most recently used goes last, so the oldest is the first dropped.
    memory.delete(key);
    memory.set(key, bytes);
  }
  return bytes;
}

const answer = (bytes: Uint8Array<ArrayBuffer>) =>
  new Response(bytes, {
    headers: {
      "content-type": "image/webp",
      "cache-control": "public, max-age=31536000, s-maxage=31536000, immutable",
      // Netlify's CDN: kept for a year and shared by all its edges ("durable"), so the function runs once per size.
      "netlify-cdn-cache-control": "public, max-age=31536000, immutable, durable",
      "content-length": String(bytes.length),
    },
  });

export async function GET(_request: Request, ctx: RouteContext<"/api/img/[id]/[w]">) {
  const { id, w } = await ctx.params;
  const width = Number(w);
  if (!/^[a-z0-9]{20,40}$/.test(id) || !IMG_WIDTHS.includes(width)) return new Response("Not found", { status: 404 });
  const key = `${id}/${width}`;
  const known = recall(key);
  if (known) return answer(known);
  const m = await prisma.media.findUnique({ where: { id }, select: { bytes: true, width: true } });
  if (!m) return new Response("Not found", { status: 404 });
  const out = new Uint8Array(width >= m.width ? Buffer.from(m.bytes) : await sharp(Buffer.from(m.bytes)).resize({ width }).webp({ quality: 78 }).toBuffer());
  remember(key, out);
  return answer(out);
}
