/**
 * What the owner copies from a supplier's site (Ecomness first), read into
 * products: a product page copied whole (Ctrl+A, Ctrl+C: its pictures and its
 * text), or a list of products taken by a scraping extension. Shared by the
 * browser (the preview) and the server (the picture addresses it fetches).
 * Nothing here is shown to customers as such: the texts are written from it.
 */
import { parseTND } from "./money";

/** Picture services that resize another address: the original is in their "url". */
const RESIZERS = new Set(["/_next/image", "/_vercel/image"]);

const ENTITIES: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", "#39": "'", "#x27": "'", "#47": "/", "#x2F": "/" };
const decode = (s: string) => s.replace(/&(amp|quot|apos|lt|gt|#39|#x27|#47|#x2F);/gi, (m, e: string) => ENTITIES[e] ?? ENTITIES[e.toLowerCase()] ?? m);

/**
 * The address of the original picture: "…/_next/image?url=…&w=384" becomes the
 * picture it resizes (Ecomness shows 384 px thumbnails of full-size photos).
 * Null for what cannot be fetched (data:, blob:, a relative address without its page).
 */
export function originalImageUrl(raw: string, base?: string): string | null {
  const s = decode(raw.trim());
  if (!s || /^(data|blob|javascript|about):/i.test(s)) return null;
  let u: URL;
  try {
    u = new URL(s.startsWith("//") ? `https:${s}` : s, base);
  } catch {
    return null;
  }
  const inner = RESIZERS.has(u.pathname) ? u.searchParams.get("url") : null;
  if (inner) {
    try {
      u = new URL(inner.startsWith("//") ? `https:${inner}` : inner, u.origin);
    } catch {
      return null;
    }
  }
  return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
}

/** UploadThing (Ecomness's photos) serves the same file under two hosts: "utfs.io/f/KEY" and "APP.ufs.sh/f/KEY". */
function sameFile(url: string): string {
  const u = new URL(url);
  const key = (u.hostname === "utfs.io" || u.hostname.endsWith(".ufs.sh")) && u.pathname.match(/^\/f\/([^/]+)$/)?.[1];
  return key ? `ut:${key}` : `${u.origin}${u.pathname}${u.search}`;
}

const uploadKey = (u: URL) => (u.hostname === "utfs.io" || u.hostname.endsWith(".ufs.sh")) && u.pathname.startsWith("/f/");
/** The site's own drawings, not product photos. */
const JUNK = /(^|[/_.-])(logo|icon|icons|avatar|favicon|sprite|placeholder|flag|flags|badge|loader|loading|spinner|payment|visa|mastercard)([/_.-]|$)/i;

function isPhoto(url: string): boolean {
  const u = new URL(url);
  if (/\.(svg|ico)$/i.test(u.pathname)) return false;
  return uploadKey(u) || !JUNK.test(u.pathname);
}

const attr = (tag: string, name: string) => tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"))?.slice(1).find((v) => v != null);

/** The widest picture of a srcset ("a.jpg 640w, b.jpg 1080w"); a comma inside an address does not cut it. */
function widest(srcset: string): string | undefined {
  let best: { url: string; w: number } | undefined;
  for (const part of srcset.split(/(?<=\s\d+(?:\.\d+)?[wx])\s*,\s*/)) {
    const [url, size = "1x"] = part.trim().split(/\s+/);
    const w = parseFloat(size) * (size.endsWith("x") ? 1000 : 1);
    if (url && (!best || w > best.w)) best = { url, w };
  }
  return best?.url;
}

export const MAX_PHOTOS = 20;

/** The product photos of a copied page, in the page's order, each once, at full size. */
export function imagesFromHtml(html: string): string[] {
  const base = attr(html.match(/<base\b[^>]*>/i)?.[0] ?? "", "href");
  const seen = new Set<string>();
  const out: string[] = [];
  for (const [tag] of html.matchAll(/<(?:img|source)\b[^>]*>/gi)) {
    const set = attr(tag, "srcset") ?? attr(tag, "data-srcset");
    const candidates = [attr(tag, "src"), attr(tag, "data-src"), attr(tag, "data-original"), set ? widest(decode(set)) : undefined];
    for (const c of candidates) {
      const url = c ? originalImageUrl(c, base) : null;
      if (!url || !isPhoto(url)) continue;
      const k = sameFile(url);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(url);
    }
    if (out.length >= MAX_PHOTOS) break;
  }
  return out;
}

export const MAX_PAGE_TEXT = 20_000;

/** The page's text without its blank runs and repeated lines (menus copied twice), short enough for one request. */
export function pageText(text: string): string {
  const lines: string[] = [];
  let blank = false;
  for (const raw of text.replace(/\r\n?/g, "\n").replace(/ /g, " ").split("\n")) {
    const line = raw.replace(/[ \t]+/g, " ").trim();
    if (!line) {
      blank = lines.length > 0;
      continue;
    }
    if (lines[lines.length - 1] === line) continue;
    if (blank) lines.push("");
    lines.push(line);
    blank = false;
  }
  return lines.join("\n").slice(0, MAX_PAGE_TEXT);
}

/** Ecomness writes its product codes "ENP-XXXXXXXX" and its suppliers' "ENSU-…" / "ENSE-…". */
const PRODUCT_CODE = /\bENP-[A-Z0-9]{4,12}\b/;
export const productCode = (text: string) => text.match(PRODUCT_CODE)?.[0] ?? "";

/** Ecomness's categories, in English on its site, as a French shop names them. */
export const CATEGORY_FR: Record<string, string> = {
  furniture: "Meubles", decoration: "Décoration", decor: "Décoration", sports: "Sport", sport: "Sport", fitness: "Sport", electronics: "Électronique",
  beauty: "Beauté", accessories: "Accessoires", auto: "Auto", car: "Auto", automotive: "Auto", kitchen: "Cuisine", household: "Maison", home: "Maison",
  health: "Santé", baby: "Bébé", kids: "Enfants", toys: "Jouets", fashion: "Mode", clothing: "Vêtements", shoes: "Chaussures", bags: "Sacs",
  jewelry: "Bijoux", jewellery: "Bijoux", watches: "Montres", phones: "Téléphonie", computers: "Informatique", gaming: "Jeux vidéo", tools: "Bricolage",
  garden: "Jardin", pets: "Animaux", office: "Bureau", lighting: "Éclairage", bathroom: "Salle de bain", bedroom: "Chambre", outdoor: "Plein air",
  travel: "Voyage", cleaning: "Ménage", appliances: "Électroménager", "home appliances": "Électroménager", hair: "Cheveux", makeup: "Maquillage",
  skincare: "Soins", perfume: "Parfums", men: "Homme", women: "Femme", gadgets: "Gadgets", textile: "Linge de maison",
};

export const frenchCategory = (c: string) => CATEGORY_FR[c.trim().toLowerCase()] ?? c.trim();

/**
 * One product of a list copied from the supplier. `photo`: the original
 * picture, imported; `thumb`: the supplier's small copy, for the preview.
 * `cost` in millimes, `category` as the supplier writes it.
 */
export type ListItem = { name: string; photo: string | null; thumb: string | null; link: string | null; category: string; ref: string; cost: number | null };

const URL_CELL = /^https?:\/\/\S+$/i;
const CODE_CELL = /^EN[A-Z]{1,3}-[A-Z0-9]{4,12}$/;
const MARGIN_CELL = /^[+-]?\s*\d+(?:[.,]\d+)?\s*%$/;
const PRICE_CELL = /^\d{1,6}(?:[.,]\d{1,3})?\s*(?:TND|DT|د\.ت)$/i;

/** A cell is a picture when its address is one (a resizer, a picture file, an upload service). */
function pictureCell(cell: string): string | null {
  const url = originalImageUrl(cell);
  if (!url) return null;
  const was = new URL(decode(cell));
  const u = new URL(url);
  return RESIZERS.has(was.pathname) || uploadKey(u) || /\.(jpe?g|png|webp|avif|gif)$/i.test(u.pathname) ? url : null;
}

/**
 * The rows of a list copied from the supplier (one product per line, cells
 * separated by tabs, as a scraping extension or a spreadsheet copies them).
 * The cells are recognised by what they hold, not by their column names,
 * which such extensions make up. Null when the text is not such a list.
 */
export function readSupplierList(text: string): ListItem[] | null {
  if (!text.includes("\t")) return null;
  const items: ListItem[] = [];
  const seen = new Set<string>();
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    const cells = line.split("\t").map((c) => c.replace(/ /g, " ").trim()).filter(Boolean);
    if (cells.length < 3) continue;
    const item: ListItem = { name: "", photo: null, thumb: null, link: null, category: "", ref: "", cost: null };
    const words: string[] = [];
    for (const c of cells) {
      if (URL_CELL.test(c)) {
        const pic = pictureCell(c);
        if (pic && !item.photo) [item.photo, item.thumb] = [pic, c];
        else if (!pic) item.link ??= c;
      } else if (CODE_CELL.test(c)) {
        if (c.startsWith("ENP-")) item.ref ||= c;
      } else if (PRICE_CELL.test(c)) item.cost ??= parseTND(c);
      else if (!MARGIN_CELL.test(c)) words.push(c);
    }
    const known = words.find((w) => CATEGORY_FR[w.toLowerCase()]);
    const byLength = [...words].sort((a, b) => b.length - a.length);
    item.name = (byLength.find((w) => w !== known) ?? "").replace(/\s+/g, " ").slice(0, 140);
    item.category = known ?? (words.length > 1 ? (byLength.filter((w) => w !== item.name && w.length <= 40).pop() ?? "") : "");
    if (!item.name || (!item.ref && item.cost == null) || (!item.photo && !item.link)) continue;
    const key = item.ref || item.link || item.name;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(item);
  }
  return items.length ? items : null;
}

/** The owner's rule for a selling price: cost × times + plus (DT). */
export type PriceRule = { times: number; plus: number };
export const DEFAULT_RULE: PriceRule = { times: 2, plus: 10 };

/** The selling price a rule gives for a cost, ending in ,900 like the shop's prices (49,900 rather than 50,000). */
export function priceFromRule(cost: number, rule: PriceRule): number {
  const raw = cost * rule.times + rule.plus * 1000;
  return Math.max(900, Math.round((raw - 900) / 1000) * 1000 + 900);
}
