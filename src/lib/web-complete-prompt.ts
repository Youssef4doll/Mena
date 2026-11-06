import { z } from "zod";

/**
 * Completing a product page from the web: the request, shared by the
 * automatic search (with an API key, on the server, which searches and reads
 * the pages itself) and the manual one (no key: the owner copies it into
 * claude.ai, which can search the web too, and pastes the reply back). Either
 * way the answer is the same: the pages of this exact product, a video, and
 * texts written from what those pages say. The shop then reads the pages
 * for their large pictures, and the owner chooses before anything is saved.
 */

/** A product as the request presents it: what the shop already has, to find the same product and not invent another. */
export type WebProduct = { ref: string; name: string; nameAr: string; summary: string; description: string; specs: string };

const str = z.string();
/** Text fields are written in both languages; "" for what the sources do not give. */
export const WebTexts = z.object({
  summary: str, summaryAr: str, description: str, descriptionAr: str, specs: str, specsAr: str,
  keywords: str, seoTitle: str, seoTitleAr: str, seoDescription: str, seoDescriptionAr: str,
});
export type WebTexts = z.infer<typeof WebTexts>;
export const TEXT_KEYS = Object.keys(WebTexts.shape) as (keyof WebTexts)[];

export const WebReport = z.object({
  pages: z.array(z.object({ url: str, title: str.default(""), sure: z.boolean().default(false) })).default([]),
  images: z.array(str).default([]),
  video: str.default(""),
  texts: WebTexts.partial().default({}),
});
export type WebReport = z.infer<typeof WebReport>;

const s = { type: "string" } as const;
/** The same answer as the API's tool input. */
export const REPORT_SCHEMA = {
  type: "object",
  properties: {
    pages: { type: "array", items: { type: "object", properties: { url: s, title: s, sure: { type: "boolean" } }, required: ["url", "title", "sure"], additionalProperties: false } },
    images: { type: "array", items: s },
    video: s,
    texts: {
      type: "object",
      properties: Object.fromEntries(TEXT_KEYS.map((k) => [k, s])),
      required: TEXT_KEYS,
      additionalProperties: false,
    },
  },
  required: ["pages", "images", "video", "texts"],
  additionalProperties: false,
};

/**
 * The owner's brief for these texts, word for word ("Product texts for Meta
 * ads traffic"). Its reply form is said apart: claude.ai answers with the
 * JSON list (WEB_REPLY), the API with its "report" tool (webTask).
 */
export const WEB_SYSTEM = `You write the product page texts of Mena, a Tunisian online shop with cash on delivery. Almost every visitor arrives from a Facebook or Instagram ad, on a phone, does not know the shop, and decides in a few seconds. Many are older people.

Arabic texts are in Tunisian derja, in Arabic letters, with everyday words an older Tunisian understands at once (توّا، برشا، متاع، كي، باش، يتشحن، الكرطونة). Not formal Arabic, not Moroccan, Algerian, Egyptian or Gulf dialect. Keep the French or English product words Tunisians say (LED, USB-C, سشوار). French texts are plain, correct French.

How to work:
1. Search the web for this exact product (brand or maker first, then big shops such as Amazon, Jumia, AliExpress, then a YouTube video). A product of another model or size is not the same product: leave it out.
2. Read the 2 to 4 best pages of this exact product.
3. Write the texts for a visitor who just clicked an ad: result first, proof second, details last.

The texts:
- "summary" / "summaryAr": one sentence, at most 120 characters: the main result for the buyer, as the ad would promise it. No feature list.
- "description" / "descriptionAr", built for a phone screen:
  1. One short opening line that names the everyday problem and the result ("Fini les câbles emmêlés : …").
  2. A blank line, then 3 to 5 lines starting with "- ", each one benefit first, then the fact that proves it, at most 12 words per line.
  3. When a page says what is in the box: a blank line and "Dans la boîte : …" (in Arabic "في الكرطونة: …").
  4. One last line that removes the fear of ordering, using only what is true for every Mena order: "Vous payez à la livraison, après avoir vu le produit." (in Arabic "تخلّص كي توصلك وتشوفها بعينيك.").
- "specs" / "specsAr": one "label: value" per line, only values a page gives (dimensions, weight, material, power, battery, capacity, colours, contents), the same lines in the same order in both languages. "" when the pages give none.
- "keywords": 8 to 20 comma-separated terms a Tunisian would type or say: French synonyms, derja in Arabic letters, derja in Latin letters (arabizi), common misspellings. Lower case, no duplicates.
- "seoTitle" / "seoTitleAr": at most 60 characters: what it is, then what sets it apart. No shop name, price, "pas cher", "meilleur", "promo".
- "seoDescription" / "seoDescriptionAr": 120 to 155 characters: the main result and one or two facts, ending with "Paiement à la livraison." (in Arabic "الدفع عند الاستلام.").

Rules (Meta rejects pages that break them, and the shop cannot prove them):
- Use only facts the pages or the shop's own texts give. Never add a number, size, material, feature or use that no page gives. When the pages say little, write little.
- Never write a price, discount, countdown, "stock limité", rating, review, number of buyers, "best-seller", "n°1", award, certification, guarantee, delivery time, or a health, weight-loss or miracle claim.
- Never copy a sentence from another shop: write your own.
- No exclamation marks, no emojis, no whole words in capitals. Keep every number, unit, model and brand exactly.
- Every text "" when you found nothing sure about this exact product.`;

/** The brief's own reply form, for claude.ai. */
export const WEB_REPLY = `Reply with only a JSON list, one object per product, with its "ref":
[{"ref": "...", "pages": [{"url": "...", "title": "...", "sure": true}], "images": ["https://..."], "video": "", "texts": {"summary": "...", "summaryAr": "...", "description": "...", "descriptionAr": "...", "specs": "...", "specsAr": "...", "keywords": "...", "seoTitle": "...", "seoTitleAr": "...", "seoDescription": "...", "seoDescriptionAr": "..."}}]`;

/** What the brief's reply form says of the pages, photos and video, for the API's tool. */
const REPORT_NOTE = `Give your answer once, with the tool "report": the pages of this exact product that you read or found ("sure": true only when the brand, the model and the numbers match; the shop downloads their large photos itself), the direct https addresses of large photos of this product written in those pages, and the address of one video of this exact product (YouTube, Vimeo or TikTok), "" when there is none. Never make up an address.`;

const productBlock = (p: WebProduct) =>
  JSON.stringify({ ref: p.ref, name: p.name, nameAr: p.nameAr, summary: p.summary, description: p.description.slice(0, 1500), specs: p.specs.slice(0, 800) });

/** The task for one product, for the API (which answers with its "report" tool). */
export const webTask = (p: WebProduct) => `The product, as the shop has it now:
${productBlock(p)}

Search, read the pages, then answer.

${REPORT_NOTE}`;

/** How many products one claude.ai request asks for: each needs its own searches, and the reply must come in one piece. */
export const WEB_BATCH = 4;

/** The whole request for claude.ai: the rules, the products, and the reply's form (a JSON list, one object per product). */
export function webBatchRequest(products: WebProduct[]): string {
  return `${WEB_SYSTEM}

The products (each has its "ref"):
${products.map(productBlock).join("\n")}

Do the work above for each product, one after the other. Never make up an address.

${WEB_REPLY}`;
}

/** The objects of a reply's list, even when the list is cut short or written among other words. */
function objects(reply: string): unknown[] {
  const from = reply.indexOf("[");
  const to = reply.lastIndexOf("]");
  if (from >= 0 && to > from) {
    try {
      const all = JSON.parse(reply.slice(from, to + 1)) as unknown;
      if (Array.isArray(all)) return all;
    } catch {
      // Read object by object below.
    }
  }
  const out: unknown[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = Math.max(0, from); i < reply.length; i++) {
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
        out.push(JSON.parse(reply.slice(start, i + 1)));
      } catch {
        // A broken object is left out.
      }
    }
  }
  return out;
}

/** The answers of a pasted reply, by product "ref"; what does not read as an answer is left out. */
export function readWebReply(reply: string): Map<string, WebReport> {
  const out = new Map<string, WebReport>();
  for (const o of objects(reply)) {
    if (!o || typeof o !== "object") continue;
    const ref = (o as { ref?: unknown }).ref;
    const parsed = WebReport.safeParse(o);
    if (typeof ref === "string" && parsed.success) out.set(ref.trim(), parsed.data);
  }
  return out;
}

/** The lengths the product editor accepts, a text cut rather than refused. */
const LIMITS: Record<keyof WebTexts, number> = {
  summary: 300, summaryAr: 300, description: 8000, descriptionAr: 8000, specs: 4000, specsAr: 4000,
  keywords: 1000, seoTitle: 120, seoTitleAr: 120, seoDescription: 320, seoDescriptionAr: 320,
};
const ONE_LINE = new Set<keyof WebTexts>(["summary", "summaryAr", "seoTitle", "seoTitleAr", "seoDescription", "seoDescriptionAr", "keywords"]);

/** A report's texts as the shop would store them: trimmed, one line where the editor has one line, within its lengths. Empty texts are dropped. */
export function cleanTexts(t: Partial<WebTexts>): Partial<WebTexts> {
  const out: Partial<WebTexts> = {};
  for (const k of TEXT_KEYS) {
    let v = (t[k] ?? "").replace(/\r\n?/g, "\n").trim();
    if (ONE_LINE.has(k)) v = v.replace(/\s*\n+\s*/g, " ");
    v = v.slice(0, LIMITS[k]).trim();
    if (v) out[k] = v;
  }
  return out;
}
