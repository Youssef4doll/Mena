import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import sharp from "sharp";
import { prisma } from "./prisma";
import { originalImageUrl } from "./supplier-page";

/** Stored at most this wide; /api/img resizes down from it. Long description pictures stop at MAX_H tall (WebP's limit is 16 383). */
const MAX_W = 1600;
const MAX_H = 16_000;
export const MAX_UPLOAD = 8 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"]);

/**
 * Any accepted upload is re-encoded to WebP (which also drops EXIF, GPS
 * included), with a 16-px blurred preview for the placeholder.
 */
export async function storeImage(buf: Buffer, mime: string, max = MAX_UPLOAD) {
  if (!ALLOWED.has(mime)) throw new Error("Format non accepté (JPEG, PNG, WebP, AVIF).");
  if (buf.length > max) throw new Error(`Image trop lourde (${Math.round(max / 1024 / 1024)} Mo maximum).`);
  const img = sharp(buf, { failOn: "error" }).rotate();
  const out = await img.resize({ width: MAX_W, height: MAX_H, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
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

/** A fetched picture may be larger than an upload: it is made smaller here, never stored as it came. */
const MAX_FETCH = 20 * 1024 * 1024;

/**
 * Share links that point to a page, turned into the picture itself:
 * Google Drive ("…/file/d/ID/view") and Dropbox ("?dl=0"); and a site's
 * resized copy ("…/_next/image?url=…&w=384") turned into the original.
 */
export function directImageUrl(raw: string): string {
  const url = originalImageUrl(raw) ?? raw.trim();
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return url;
  }
  if (u.hostname === "drive.google.com" || u.hostname === "docs.google.com") {
    const id = u.pathname.match(/\/d\/([\w-]{10,})/)?.[1] ?? u.searchParams.get("id");
    if (id) return `https://drive.google.com/uc?export=download&id=${id}`;
  }
  if (u.hostname.endsWith("dropbox.com") && u.searchParams.has("dl")) {
    u.searchParams.set("dl", "1");
    return u.toString();
  }
  return url;
}

/** Private, loopback and reserved addresses: a link to them would make the server read its own network. */
function privateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return privateAddress(v.slice(7));
  return v === "::" || v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe8") || v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb") || v.startsWith("ff");
}

/** The tests serve their pictures from this machine. Never in production, whatever the setting. */
const LOCAL_OK = process.env.NODE_ENV !== "production" && process.env.MEDIA_ALLOW_LOCAL === "1";

export async function checkHost(u: URL) {
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("Adresse invalide.");
  if (LOCAL_OK) return;
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) throw new Error("Adresse refusée.");
  const ips = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => { throw new Error("Site introuvable : vérifiez l'adresse de l'image."); })).map((r) => r.address);
  if (ips.length === 0 || ips.some(privateAddress)) throw new Error("Adresse refusée.");
}

/** Supplier pictures: fetched once and stored, so the shop never depends on the supplier's server. */
export async function importImageFromUrl(raw: string) {
  let u = new URL(directImageUrl(raw));
  // Redirects are followed one by one, each checked like the first address.
  let res: Response | null = null;
  for (let hop = 0; hop < 5; hop++) {
    await checkHost(u);
    res = await fetch(u, {
      signal: AbortSignal.timeout(20_000),
      redirect: "manual",
      // Some suppliers refuse requests that do not look like a browser's.
      headers: { "user-agent": "Mozilla/5.0 (compatible; MenaShop/1.0; +product-import)", accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8" },
    });
    const next = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
    if (!next) break;
    u = new URL(next, u);
    res = null;
  }
  if (!res) throw new Error("Trop de redirections.");
  if (!res.ok) throw new Error(`Téléchargement impossible (erreur ${res.status}).`);
  if (Number(res.headers.get("content-length") ?? 0) > MAX_FETCH) throw new Error("Image trop lourde (20 Mo maximum).");
  const buf = await readCapped(res, MAX_FETCH);
  const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  // A server that says "octet-stream" or "text/html" for a picture: the bytes decide.
  const mime = ALLOWED.has(type) ? type : await sniff(buf);
  if (!mime) throw new Error(type.startsWith("text/") ? "Ce lien mène à une page, pas à une image : ouvrez l'image seule et copiez son adresse." : "Ce fichier n'est pas une image reconnue (JPEG, PNG, WebP, AVIF).");
  return storeImage(buf, mime, MAX_FETCH);
}

async function readCapped(res: Response, max: number): Promise<Buffer> {
  const reader = res.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw new Error("Image trop lourde (20 Mo maximum).");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

async function sniff(buf: Buffer): Promise<string | null> {
  try {
    const f = (await sharp(buf).metadata()).format;
    const mime = f === "jpeg" ? "image/jpeg" : f === "png" ? "image/png" : f === "webp" ? "image/webp" : f === "heif" ? "image/avif" : f === "gif" ? "image/gif" : null;
    return mime && ALLOWED.has(mime) ? mime : null;
  } catch {
    return null;
  }
}
