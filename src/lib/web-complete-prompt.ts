import { z } from "zod";
import { KEYWORDS_RULE, SEO_RULE, SHOP_VOICE } from "./translate-prompt";

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

export const WEB_SYSTEM = `${SHOP_VOICE}

You complete a product page of Mena from the web. You get the product as the shop has it.

How to work:
1. Search the web for this exact product: first the page of its brand or manufacturer, then big shops that sell the same model (Amazon, Jumia, Cdiscount, AliExpress, the brand's distributors), then a video that shows it (YouTube first). Use the name, the brand, the model and the numbers (size, capacity, power, number of pieces) to be sure it is the same product. A similar product of another brand, model or size is not the same product: leave it out.
2. Read the 2 to 4 best pages of this product.
3. Give your answer once, at the end.

The answer:
- "pages": the pages of this exact product that you read or found (address, title, and "sure": true only when the brand, the model and the numbers match). The shop downloads the large pictures from these pages itself, so list the pages that show the product's photos, best first. [] when you found nothing sure.
- "images": direct addresses (https) of large photos of this product that you saw written in the pages; [] when you saw none. Never make up an address.
- "video": the address of one video that shows this exact product (YouTube, Vimeo or TikTok), found in the results or the pages; "" when there is none. Never make up an address.
- "texts": written by you, in the shop's voice, from the facts the pages give about this product. Never copy a sentence from a page: write your own (the other shops' texts are theirs, and Google ranks a copied text lower).
  - Use only facts the pages say about this exact product, or that the shop's own texts already say. Never add a number, a size, a material, a feature or a use that no page gives. When the pages say little, write little.
  - Never write a rating, a review, a number of buyers or of sales, "best-seller", "n°1", an award, a certification, a guarantee, a delivery time, a stock or a price, even when a page says one: the shop cannot check them.
  - Keep every number, unit, model and brand exactly. No exclamation marks, no emojis, no whole words in capitals.
  - "summary" / "summaryAr": one sentence of at most 160 characters: what the product does for the buyer.
  - "description" / "descriptionAr", laid out like Amazon's "About this item" for a phone: first one or two sentences on what it is and the main benefit; then a blank line and 3 to 6 lines that each start with "- ", one benefit per line, the benefit first and then the fact that proves it; then, when a page says what is in the box, a blank line and "Dans la boîte : …" (in Arabic "في الكرطونة: …").
  - "specs" / "specsAr": one "label: value" per line, only values the pages give (dimensions, weight, material, power, battery, capacity, colours, contents), the same lines in the same order in both languages. "" when the pages give none.
  - ${KEYWORDS_RULE}
  - ${SEO_RULE}
  - Every text "" when you found nothing sure about this exact product: never guess.`;

const productBlock = (p: WebProduct) =>
  JSON.stringify({ ref: p.ref, name: p.name, nameAr: p.nameAr, summary: p.summary, description: p.description.slice(0, 1500), specs: p.specs.slice(0, 800) });

/** The task for one product, for the API (which answers with its "report" tool). */
export const webTask = (p: WebProduct) => `The product, as the shop has it now:
${productBlock(p)}

Search, read the pages, then call the tool "report" once with your answer.`;

/** How many products one claude.ai request asks for: each needs its own searches, and the reply must come in one piece. */
export const WEB_BATCH = 4;

/** The whole request for claude.ai: the rules, the products, and the reply's form (a JSON list, one object per product). */
export function webBatchRequest(products: WebProduct[]): string {
  const shape = `{"ref": "...", "pages": [{"url": "...", "title": "...", "sure": true}], "images": ["https://..."], "video": "", "texts": {${TEXT_KEYS.map((k) => `"${k}": "..."`).join(", ")}}}`;
  return `${WEB_SYSTEM}

The products (each has its "ref"):
${products.map(productBlock).join("\n")}

Do the work above for each product, one after the other. Then reply with only a JSON list, one object per product, in this form, with the product's "ref":
[${shape}]`;
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
