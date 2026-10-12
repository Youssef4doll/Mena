import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { IMG_WIDTHS } from "@/lib/image-loader";

/**
 * Product pictures, resized on first request and then served from the CDN
 * for a year (the id changes when the picture does). Only the widths the
 * loader asks for are produced, so the cache holds a handful per image.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/img/[id]/[w]">) {
  const { id, w } = await ctx.params;
  const width = Number(w);
  if (!/^[a-z0-9]{20,40}$/.test(id) || !IMG_WIDTHS.includes(width)) return new Response("Not found", { status: 404 });
  const m = await prisma.media.findUnique({ where: { id }, select: { bytes: true, width: true } });
  if (!m) return new Response("Not found", { status: 404 });
  const out = width >= m.width ? Buffer.from(m.bytes) : await sharp(Buffer.from(m.bytes)).resize({ width }).webp({ quality: 78 }).toBuffer();
  return new Response(new Uint8Array(out), {
    headers: {
      "content-type": "image/webp",
      "cache-control": "public, max-age=31536000, immutable",
      "content-length": String(out.length),
    },
  });
}
