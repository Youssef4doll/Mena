/**
 * A product's page on another site (the brand's own, a big shop), read for
 * what can complete Mena's page: its large pictures, its video, and what it
 * says of the product. Shared by the server (which reads the pages) and the
 * back office (the search links). Nothing here is shown to customers as
 * such: the owner chooses, and the texts are rewritten, never copied.
 */
import { originalImageUrl, imagesFromHtml } from "./supplier-page";
import { parseVideo } from "./product-content";

export type PageFinds = { title: string; description: string; bullets: string[]; images: string[]; videos: string[] };

export const MAX_IMAGES = 24;

const ENTITIES: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " ", "#39": "'", "#x27": "'", "#47": "/", "#x2F": "/" };
const decode = (s: string) => s.replace(/&(amp|quot|apos|lt|gt|nbsp|#39|#x27|#47|#x2F);/gi, (m, e: string) => ENTITIES[e] ?? ENTITIES[e.toLowerCase()] ?? m).replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)));
const clean = (s: string) => decode(s.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();

/**
 * The largest copy of a picture, from the address of a smaller one: Amazon's
 * "…/I/71abc._AC_SX679_.jpg" is "…/I/71abc.jpg"; Shopify's "photo_200x200.jpg"
 * and "?width=200" are the photo itself; WordPress's "photo-300x300.jpg" too.
 */
export function bigImageUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return raw;
  }
  if (/(^|\.)media-amazon\.com$|(^|\.)ssl-images-amazon\.com$/.test(u.hostname)) {
    u.pathname = u.pathname.replace(/\/I\/([^/.]+)\.[^/]*\.(jpe?g|png|webp|gif)$/i, "/I/$1.$2");
    return u.toString();
  }
  if (u.hostname === "cdn.shopify.com" || u.pathname.includes("/cdn/shop/")) {
    u.pathname = u.pathname.replace(/_(\d+x\d*|\d*x\d+|pico|icon|thumb|small|compact|medium|large|grande)(@\dx)?(\.[a-z]+)$/i, "$3");
    for (const k of ["width", "height", "crop"]) u.searchParams.delete(k);
    return u.toString();
  }
  u.pathname = u.pathname.replace(/-\d{2,4}x\d{2,4}(\.(?:jpe?g|png|webp))$/i, "$1");
  return u.toString();
}

/** An address that looks like a picture file (the server checks it when it downloads it). */
export const isImageUrl = (url: string) => /^https?:\/\/[^\s]+\.(jpe?g|png|webp|avif|gif)(\?[^\s]*)?$/i.test(url.trim());

/** Every "ld+json" block of the page, parsed; a broken one is skipped. */
function jsonLd(html: string): unknown[] {
  const out: unknown[] = [];
  for (const [, body] of html.matchAll(/<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      out.push(JSON.parse(body.trim()));
    } catch {
      // A page's broken block says nothing.
    }
  }
  return out;
}

/** Every object of a JSON-LD tree (lists and "@graph" included). */
function* nodes(v: unknown, depth = 0): Generator<Record<string, unknown>> {
  if (depth > 6 || v == null || typeof v !== "object") return;
  if (Array.isArray(v)) {
    for (const x of v) yield* nodes(x, depth + 1);
    return;
  }
  const o = v as Record<string, unknown>;
  yield o;
  for (const k of ["@graph", "mainEntity", "itemListElement", "hasVariant", "isVariantOf", "subjectOf", "video", "image"]) if (k in o) yield* nodes(o[k], depth + 1);
}

const isType = (o: Record<string, unknown>, t: string) => {
  const ty = o["@type"];
  return ty === t || (Array.isArray(ty) && ty.includes(t));
};

/** "image" of a Product: an address, a list of them, or ImageObjects. */
function ldImages(v: unknown): string[] {
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.flatMap(ldImages);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return [o.contentUrl, o.url].filter((x): x is string => typeof x === "string").slice(0, 1);
  }
  return [];
}

const meta = (html: string, key: string) => {
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const name = tag.match(/\b(?:property|name|itemprop)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
    if (name !== key) continue;
    const content = tag.match(/\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    const v = content?.[1] ?? content?.[2];
    if (v) return decode(v).trim();
  }
  return "";
};

/**
 * A video's address in one form, so the same video found twice is offered
 * once; null for what the shop does not play from another site (a file or a
 * stream there may stop working, or be heavy).
 */
export function videoAddress(url: string): string | null {
  const v = parseVideo(url);
  if (!v || v.kind === "file" || v.kind === "hls") return null;
  return v.kind === "youtube" ? `https://www.youtube.com/watch?v=${v.id}` : url.trim();
}

/** A video link written anywhere in the page (a player, a link), as the address the shop accepts. */
export function videoLinks(html: string): string[] {
  const found: string[] = [];
  const add = (url: string) => {
    const key = videoAddress(url);
    if (key && !found.includes(key)) found.push(key);
  };
  const text = decode(html).replace(/\\\//g, "/");
  for (const [, id] of text.matchAll(/(?:youtube(?:-nocookie)?\.com\/(?:embed\/|watch\?v=|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/g)) add(`https://www.youtube.com/watch?v=${id}`);
  for (const [m] of text.matchAll(/https:\/\/(?:player\.)?vimeo\.com\/(?:video\/)?\d{5,12}/g)) add(m);
  for (const [m] of text.matchAll(/https:\/\/www\.tiktok\.com\/@[\w.-]+\/video\/\d{10,25}/g)) add(m);
  return found.slice(0, 6);
}

/** Amazon's large photos, written in the page's script ("hiRes", "large", "data-old-hires"). */
function amazonImages(html: string): string[] {
  const out: string[] = [];
  for (const [, url] of html.matchAll(/"(?:hiRes|large|mainUrl)"\s*:\s*"(https:\/\/[^"]+?\.(?:jpe?g|png))"/g)) out.push(url);
  for (const [, url] of html.matchAll(/data-old-hires\s*=\s*"(https:\/\/[^"]+)"/g)) out.push(url);
  return out;
}

/** Amazon's "About this item" points, as the page writes them. */
function amazonBullets(html: string): string[] {
  const box = html.match(/id\s*=\s*["']feature-bullets["'][\s\S]*?<\/ul>/i)?.[0];
  if (!box) return [];
  return [...box.matchAll(/<span[^>]*class\s*=\s*["'][^"']*a-list-item[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi)].map(([, t]) => clean(t)).filter((t) => t.length > 3).slice(0, 10);
}

/**
 * What a product page gives: its title, its description and points, its
 * large pictures (the product's own, in the page's order: the structured
 * data first, then the share picture, then the photos of the page), and its
 * videos. `pageUrl` resolves relative addresses.
 */
export function extractProductPage(html: string, pageUrl: string): PageFinds {
  const images: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string) => {
    const abs = originalImageUrl(raw, pageUrl);
    if (!abs || !/^https?:/.test(abs) || /\.(svg|ico)(\?|$)/i.test(abs)) return;
    const big = bigImageUrl(abs);
    const key = big.replace(/\?.*$/, "");
    if (seen.has(key) || images.length >= MAX_IMAGES) return;
    seen.add(key);
    images.push(big);
  };
  let title = "";
  let description = "";
  const ldVideos: string[] = [];
  for (const block of jsonLd(html)) {
    for (const o of nodes(block)) {
      if (isType(o, "Product") || isType(o, "ProductGroup")) {
        ldImages(o.image).forEach(add);
        if (!title && typeof o.name === "string") title = clean(o.name);
        if (!description && typeof o.description === "string") description = clean(o.description);
      }
      if (isType(o, "VideoObject")) for (const k of ["embedUrl", "contentUrl", "url"]) if (typeof o[k] === "string") ldVideos.push(o[k] as string);
    }
  }
  amazonImages(html).forEach(add);
  for (const [, url] of html.matchAll(/data-large_image\s*=\s*["']([^"']+)["']/gi)) add(url);
  [meta(html, "og:image:secure_url"), meta(html, "og:image"), meta(html, "twitter:image")].filter(Boolean).forEach(add);
  // The page's own photos; their relative addresses are read from the page's address.
  imagesFromHtml(/<base\b/i.test(html) ? html : `<base href="${pageUrl.replace(/"/g, "%22")}">${html}`).forEach(add);

  title ||= meta(html, "og:title") || clean(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "") || clean(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  description ||= meta(html, "og:description") || meta(html, "description");
  const videos = [...new Set([...ldVideos.flatMap((v) => videoLinks(v)), ...videoLinks(html)])].slice(0, 6);
  return { title: title.slice(0, 200), description: description.slice(0, 3000), bullets: amazonBullets(html), images, videos };
}

/** Where the owner looks by hand: the product's name in Google Images, YouTube and Amazon. */
export function searchLinks(name: string): { label: string; url: string }[] {
  const q = encodeURIComponent(name.trim());
  return [
    { label: "Google Images", url: `https://www.google.com/search?tbm=isch&q=${q}` },
    { label: "Google", url: `https://www.google.com/search?q=${q}` },
    { label: "YouTube", url: `https://www.youtube.com/results?search_query=${q}` },
    { label: "Amazon", url: `https://www.amazon.fr/s?k=${q}` },
  ];
}

/** The addresses typed or pasted by the owner, one per line (or separated by spaces), each once, at most `max`. */
export function readLinks(text: string, max = 8): string[] {
  const out: string[] = [];
  for (const raw of text.split(/[\s,]+/)) {
    const s = raw.trim().replace(/[)>\].,;]+$/, "");
    if (!/^https?:\/\//i.test(s)) continue;
    try {
      const u = new URL(s);
      if (!out.includes(u.toString())) out.push(u.toString());
    } catch {
      // Not an address.
    }
    if (out.length >= max) break;
  }
  return out;
}
