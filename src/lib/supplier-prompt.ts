import { z } from "zod";
import { KEYWORDS_RULE, SEO_RULE, SHOP_VOICE } from "./translate-prompt";
import { IDEAS_RULE, IDEA_SCHEMA, Idea, cleanIdeas } from "./image-ideas";

/**
 * A product page of Mena written from a supplier's page: the request, shared
 * by the automatic writing (with an API key, on the server) and the manual
 * one (no key: the owner copies it into any chat assistant and pastes the
 * reply back). The owner reads the result before anything is saved, and the
 * product is created offline.
 */

const variant = z.object({ name: z.string(), nameAr: z.string(), colorHex: z.string() });

export const Draft = z.object({
  name: z.string(),
  nameAr: z.string(),
  summary: z.string(),
  summaryAr: z.string(),
  description: z.string(),
  descriptionAr: z.string(),
  specs: z.string(),
  specsAr: z.string(),
  keywords: z.string(),
  seoTitle: z.string().default(""),
  seoTitleAr: z.string().default(""),
  seoDescription: z.string().default(""),
  seoDescriptionAr: z.string().default(""),
  category: z.string(),
  supplierPrice: z.string(),
  supplierRef: z.string(),
  variants: z.array(variant),
  imageIdeas: z.array(Idea).default([]),
});
export type Draft = z.infer<typeof Draft>;

const str = { type: "string" } as const;
/** The same fields for the API's structured answer. */
export const DRAFT_SCHEMA = {
  type: "object",
  properties: {
    name: str, nameAr: str, summary: str, summaryAr: str, description: str, descriptionAr: str, specs: str, specsAr: str, keywords: str,
    seoTitle: str, seoTitleAr: str, seoDescription: str, seoDescriptionAr: str, category: str, supplierPrice: str, supplierRef: str,
    variants: { type: "array", items: { type: "object", properties: { name: str, nameAr: str, colorHex: str }, required: ["name", "nameAr", "colorHex"], additionalProperties: false } },
    imageIdeas: { type: "array", items: IDEA_SCHEMA },
  },
  required: ["name", "nameAr", "summary", "summaryAr", "description", "descriptionAr", "specs", "specsAr", "keywords", "seoTitle", "seoTitleAr", "seoDescription", "seoDescriptionAr", "category", "supplierPrice", "supplierRef", "variants", "imageIdeas"],
  additionalProperties: false,
};

export const SUPPLIER_SYSTEM = `${SHOP_VOICE}

You receive the text of a supplier's product page, copied whole: it also holds the supplier site's menus, the reseller's account, prices for resellers and other products. Write the texts of this one product for Mena, in French and in Tunisian Arabic, to sell it: concrete, short sentences, the benefit for the buyer first, then the fact that shows it.

Rules:
- Use only what the page says about this product. Never add a fact, a number, a size, a material, a feature, a use, a promise, a guarantee, a delivery time, a stock or a superlative that the page does not contain. When the page says little, write little: a short true text sells better than a long invented one.
- Leave out what is for resellers only: stock, margins, commissions, sales counts, supplier names and codes, the conditions between the supplier and the shop, and the other products of the page.
- Keep every number, unit, size and brand exactly. Correct obvious spelling mistakes.
- No exclamation marks, no emojis, no whole words in capitals.
- "name" / "nameAr": built like a good Amazon title, but short enough for a phone: what the product is (the words a buyer searches), then what sets it apart (size, capacity, power, model, number of pieces), 3 to 9 words, at most 80 characters. The brand first only when the page makes it a selling point.
- "summary" / "summaryAr": one sentence of at most 160 characters: what the product does for the buyer.
- "description" / "descriptionAr", laid out like Amazon's "About this item" for a phone: first one or two sentences on what it is and the main benefit; then a blank line and 3 to 5 lines that each start with "- ", one benefit per line, the benefit first and then the fact from the page that proves it (for example "- Se range partout : plié, il fait 8 cm d'épaisseur."); then, when the page says what is in the box, a blank line and "Dans la boîte : …" (in Arabic "في الكرطونة: …").
- "specs" / "specsAr": one "label: value" per line, only values the page gives (dimensions, weight, material, power, battery, capacity, colours, contents), the same lines in the same order in both languages. "" when the page gives none.
- ${KEYWORDS_RULE}
- ${SEO_RULE}
- "category": the name of one of the shop's categories listed below when one fits, written exactly as listed; otherwise a short new French category name (1 to 3 words).
- "supplierPrice": the price the supplier asks the shop for one unit, as written on the page with its currency (for example "54 TND"); "" when the page gives none or when you are not sure which price it is.
- "supplierRef": the supplier's code of the product as written (for example ENP-4J6HKB7H), or "".
- "variants": the options a buyer must choose between, as the page lists them (colours, sizes, models): French name, Tunisian Arabic name, and for a colour its colour as "#rrggbb" ("" otherwise). [] when the page lists none.
- ${IDEAS_RULE}
- Return every field.`;

export type DraftInput = { text: string; categories: string[] };

export const draftTask = (input: DraftInput) =>
  `The shop's categories: ${JSON.stringify(input.categories)}

The supplier's page, as copied:
"""
${input.text}
"""`;

const SKELETON = JSON.stringify({
  name: "", nameAr: "", summary: "", summaryAr: "", description: "", descriptionAr: "", specs: "", specsAr: "", keywords: "",
  seoTitle: "", seoTitleAr: "", seoDescription: "", seoDescriptionAr: "", category: "", supplierPrice: "", supplierRef: "",
  variants: [{ name: "", nameAr: "", colorHex: "" }], imageIdeas: [{ kind: "hero", headlineAr: "", headlineFr: "", points: [{ ar: "", fr: "" }], scene: "", sceneBefore: "" }],
});

/** The whole request as one text to paste into a chat assistant. */
export function manualDraftRequest(input: DraftInput): string {
  return `${SUPPLIER_SYSTEM}

Answer with one JSON object only, with exactly these fields, and nothing before or after it:
${SKELETON}

${draftTask(input)}`;
}

const line = (s: string, max: number) => s.replace(/\s*[\r\n]+\s*/g, " ").trim().slice(0, max);
const block = (s: string, max: number) => s.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, max);
const HEX = /^#[0-9a-f]{6}$/;

/** A draft within what a product accepts: names on one line, lengths cut, colours checked, empty options dropped. */
export function cleanDraft(d: Draft): Draft {
  const seen = new Set<string>();
  return {
    name: line(d.name, 140), nameAr: line(d.nameAr, 140), summary: line(d.summary, 300), summaryAr: line(d.summaryAr, 300),
    description: block(d.description, 8000), descriptionAr: block(d.descriptionAr, 8000), specs: block(d.specs, 4000), specsAr: block(d.specsAr, 4000),
    keywords: line(d.keywords, 1000), seoTitle: line(d.seoTitle, 120), seoTitleAr: line(d.seoTitleAr, 120),
    seoDescription: line(d.seoDescription, 320), seoDescriptionAr: line(d.seoDescriptionAr, 320), category: line(d.category, 60), supplierPrice: line(d.supplierPrice, 40), supplierRef: line(d.supplierRef, 120),
    variants: d.variants
      .map((v) => ({ name: line(v.name, 60), nameAr: line(v.nameAr, 60), colorHex: HEX.test(v.colorHex.trim().toLowerCase()) ? v.colorHex.trim().toLowerCase() : "" }))
      .filter((v) => v.name && !seen.has(v.name.toLowerCase()) && seen.add(v.name.toLowerCase()))
      .slice(0, 60),
    imageIdeas: cleanIdeas(d.imageIdeas),
  };
}

/** The reply pasted back: the draft found in it (code fences and text around it are ignored), or null. */
export function readDraftAnswer(reply: string): Draft | null {
  const from = reply.indexOf("{");
  const to = reply.lastIndexOf("}");
  if (from < 0 || to <= from) return null;
  try {
    const parsed = Draft.safeParse(JSON.parse(reply.slice(from, to + 1)));
    return parsed.success && parsed.data.name.trim() ? cleanDraft(parsed.data) : null;
  } catch {
    return null;
  }
}
