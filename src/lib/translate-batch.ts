import { z } from "zod";
import type { Prisma } from "@prisma/client";
import type { ProductTexts } from "./translate-merge";
import { Answer, manualBatchRequest, readManualBatch } from "./translate-prompt";

/**
 * Translating many products at once ("Traduire en lot"). Without an API key
 * the products are cut into requests a free chat assistant answers in one
 * reply, and the reply is matched back to the products by their id. The
 * page and its actions read and write the texts through the same helpers, so
 * options and offers are matched in the same order on both sides.
 */

export const BATCH_SIZE = 8;
/** About this many characters of product JSON per request: the reply, longer in Arabic, still comes in one answer. */
export const BATCH_CHARS = 9000;
/** A product id as the database makes them. */
export const PRODUCT_ID = /^[a-z0-9]{20,40}$/;
export const MAX_IDS = 2000;

/** "?ids=a,b,c" → the valid ids, without repeats; absent → null (every product). */
export function idsParam(v: string | string[] | undefined): string[] | null {
  if (v == null) return null;
  const raw = (Array.isArray(v) ? v.join(",") : v).split(",").map((s) => s.trim());
  return [...new Set(raw.filter((s) => PRODUCT_ID.test(s)))].slice(0, MAX_IDS);
}

/** The texts a translation reads, as stored: options and offers in the order the shop shows them. */
export const textsSelect = {
  name: true, nameAr: true, summary: true, summaryAr: true, description: true, descriptionAr: true, specs: true, specsAr: true, keywords: true,
  seoTitle: true, seoTitleAr: true, seoDescription: true, seoDescriptionAr: true,
  variants: { orderBy: [{ sort: "asc" }, { id: "asc" }], select: { id: true, name: true, nameAr: true } },
  offers: { orderBy: [{ sort: "asc" }, { id: "asc" }], select: { id: true, label: true, labelAr: true } },
} satisfies Prisma.ProductSelect;

type Stored = {
  name: string; nameAr: string | null; summary: string; summaryAr: string | null; description: string; descriptionAr: string | null;
  specs: string; specsAr: string | null; keywords: string;
  seoTitle: string; seoTitleAr: string | null; seoDescription: string; seoDescriptionAr: string | null;
  variants: { name: string; nameAr: string | null }[];
  offers: { label: string; labelAr: string | null }[];
};

/** A stored product's texts, empty Arabic columns read as "". */
export function storedTexts(p: Stored): ProductTexts {
  return {
    name: p.name, nameAr: p.nameAr ?? "", summary: p.summary, summaryAr: p.summaryAr ?? "", description: p.description, descriptionAr: p.descriptionAr ?? "",
    specs: p.specs, specsAr: p.specsAr ?? "", keywords: p.keywords,
    seoTitle: p.seoTitle, seoTitleAr: p.seoTitleAr ?? "", seoDescription: p.seoDescription, seoDescriptionAr: p.seoDescriptionAr ?? "",
    variants: p.variants.map((v) => ({ name: v.name, nameAr: v.nameAr ?? "" })),
    offers: p.offers.map((o) => ({ label: o.label, labelAr: o.labelAr ?? "" })),
  };
}

/** A name or a label is one line in the editor: a line break in a reply becomes a space. */
const line = (max: number) => z.string().max(max).transform((s) => s.replace(/\s*[\r\n]+\s*/g, " ").trim());

/** What the browser may send back for one product, with the lengths the editor accepts. */
export const translationSchema = z.object({
  name: line(140),
  nameAr: line(140),
  summary: z.string().max(300),
  summaryAr: z.string().max(300),
  description: z.string().max(8000),
  descriptionAr: z.string().max(8000),
  specs: z.string().max(4000),
  specsAr: z.string().max(4000),
  keywords: z.string().max(1000),
  seoTitle: line(120).default(""),
  seoTitleAr: line(120).default(""),
  seoDescription: line(320).default(""),
  seoDescriptionAr: line(320).default(""),
  variants: z.array(z.object({ name: line(60), nameAr: line(60) })).max(60),
  offers: z.array(z.object({ label: line(80), labelAr: line(80) })).max(8),
});

const FRENCH = ["name", "summary", "description", "specs", "keywords", "seoTitle", "seoDescription"] as const;
const ARABIC = ["nameAr", "summaryAr", "descriptionAr", "specsAr", "seoTitleAr", "seoDescriptionAr"] as const;

export type TextWrites = {
  product: Partial<Record<(typeof FRENCH)[number], string> & Record<(typeof ARABIC)[number], string | null>>;
  variants: { index: number; name: string; nameAr: string | null }[];
  offers: { index: number; label: string; labelAr: string | null }[];
};

/**
 * The columns a merged translation changes, and only those; null when
 * nothing changes. Arabic columns are saved as null when empty, as the editor
 * saves them. Options and offers are given by their position.
 */
export function textWrites(before: ProductTexts, after: ProductTexts): TextWrites | null {
  const product: TextWrites["product"] = {};
  for (const c of FRENCH) if (after[c] !== before[c]) product[c] = after[c];
  for (const c of ARABIC) if (after[c] !== before[c]) product[c] = after[c] || null;
  const variants = after.variants.flatMap((v, index) => {
    const was = before.variants[index];
    return was && (v.name !== was.name || v.nameAr !== was.nameAr) ? [{ index, name: v.name, nameAr: v.nameAr || null }] : [];
  });
  const offers = after.offers.flatMap((o, index) => {
    const was = before.offers[index];
    return was && (o.label !== was.label || o.labelAr !== was.labelAr) ? [{ index, label: o.label, labelAr: o.labelAr || null }] : [];
  });
  return Object.keys(product).length || variants.length || offers.length ? { product, variants, offers } : null;
}

const sizeOf = (t: ProductTexts) => JSON.stringify({ ref: "c".repeat(25), ...t }, null, 1).length;

/** Products cut into requests of at most `size` products and about `chars` characters; a longer product goes alone. */
export function splitBatches<T extends { texts: ProductTexts }>(items: T[], size = BATCH_SIZE, chars = BATCH_CHARS): T[][] {
  const out: T[][] = [];
  let cur: T[] = [];
  let len = 0;
  for (const it of items) {
    const n = sizeOf(it.texts);
    if (cur.length > 0 && (cur.length >= size || len + n > chars)) {
      out.push(cur);
      cur = [];
      len = 0;
    }
    cur.push(it);
    len += n;
  }
  if (cur.length) out.push(cur);
  return out;
}

/**
 * The request for one batch. Each product's ref is its id, not its place in
 * the batch: a reply pasted into another batch, or after the page was
 * reloaded with other batches, can never land on another product.
 */
export function batchRequest(items: { id: string; texts: ProductTexts }[]): string {
  return manualBatchRequest(items.map((it) => ({ ref: it.id, texts: it.texts })), "fill");
}

/**
 * The pasted reply matched back to the batch's products. A reply cut short
 * (the assistant stopped in the middle of a long answer) still gives the
 * products it finished; the others come back as absent, to be asked again.
 * `read` counts the products read in the reply, this batch's or not.
 */
export function readBatchReply<T extends { id: string }>(items: T[], reply: string): { found: { item: T; texts: ProductTexts }[]; absent: T[]; read: number } {
  let byRef = readManualBatch(reply);
  if (byRef.size === 0) byRef = completeObjects(reply);
  const found: { item: T; texts: ProductTexts }[] = [];
  const absent: T[] = [];
  for (const item of items) {
    const texts = byRef.get(item.id);
    if (texts) found.push({ item, texts });
    else absent.push(item);
  }
  return { found, absent, read: byRef.size };
}

/** Every complete product object of a reply whose list does not read as a whole (cut short, or text inside it). */
function completeObjects(reply: string): Map<string, ProductTexts> {
  const out = new Map<string, ProductTexts>();
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = Math.max(0, reply.indexOf("[")); i < reply.length; i++) {
    const c = reply[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (c === "}" && depth > 0) {
      depth--;
      if (depth > 0) continue;
      try {
        const item = JSON.parse(reply.slice(start, i + 1)) as { ref?: unknown };
        const parsed = Answer.safeParse(item);
        if (parsed.success && typeof item.ref === "string") out.set(item.ref, parsed.data);
      } catch {}
    }
  }
  return out;
}
