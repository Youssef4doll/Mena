import "server-only";
import sharp from "sharp";
import { prisma } from "./prisma";

/** Stored at most this wide; /api/img resizes down from it. */
const MAX_W = 1600;
export const MAX_UPLOAD = 8 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"]);

/**
 * Any accepted upload is re-encoded to WebP (which also drops EXIF, GPS
 * included), with a 16-px blurred preview for the placeholder.
 */
export async function storeImage(buf: Buffer, mime: string) {
  if (!ALLOWED.has(mime)) throw new Error("Format non accepté (JPEG, PNG, WebP, AVIF).");
  if (buf.length > MAX_UPLOAD) throw new Error("Image trop lourde (8 Mo maximum).");
  const img = sharp(buf, { failOn: "error" }).rotate();
  const out = await img.resize({ width: MAX_W, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
  const tiny = await sharp(out.data).resize(16).webp({ quality: 40 }).toBuffer();
  return prisma.media.create({
    data: {
      mime: "image/webp",
      width: out.info.width,
      height: out.info.height,
      bytes: new Uint8Array(out.data),
      blur: `data:image/webp;base64,${tiny.toString("base64")}`,
    },
    select: { id: true, width: true, height: true },
  });
}

/** Supplier pictures: fetched once and stored, so the shop never depends on the supplier's server. */
export async function importImageFromUrl(url: string) {
  const u = new URL(url);
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("Adresse invalide.");
  // Not an internal address: this runs on the server.
  if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[)/.test(u.hostname)) throw new Error("Adresse refusée.");
  const res = await fetch(u, { signal: AbortSignal.timeout(15_000), redirect: "follow" });
  if (!res.ok) throw new Error(`Téléchargement impossible (HTTP ${res.status}).`);
  const type = (res.headers.get("content-type") ?? "").split(";")[0];
  const buf = Buffer.from(await res.arrayBuffer());
  return storeImage(buf, type || "image/jpeg");
}
