import { z } from "zod";
import type { ProductTexts, TranslateMode } from "./translate-merge";

/**
 * The translation request, shared by the automatic translation (with an API
 * key, on the server) and the manual one (no key: the owner copies it into
 * any chat assistant and pastes the reply back into the editor).
 */
export const Answer = z.object({
  name: z.string(),
  nameAr: z.string(),
  summary: z.string(),
  summaryAr: z.string(),
  description: z.string(),
  descriptionAr: z.string(),
  specs: z.string(),
  specsAr: z.string(),
  keywords: z.string(),
  variants: z.array(z.object({ name: z.string(), nameAr: z.string() })),
  offers: z.array(z.object({ label: z.string(), labelAr: z.string() })),
});

export const SYSTEM = `You write the product texts of Mena, an online shop in Tunisia that sells with cash on delivery. Many customers are older people reading on a phone.

Arabic texts are in Tunisian Arabic (derja), written in Arabic letters, the way Tunisian shops write to their customers: everyday words an older Tunisian understands at once (for example توّا، برشا، متاع، كي، باش، يتشحن، الكرطونة). Not formal Modern Standard Arabic, and not Moroccan, Algerian, Egyptian or Gulf dialect. Product names may keep a common French or English word when that is what Tunisians say (LED, USB-C, sèche-cheveux → سشوار).
French texts are plain, correct French.

Rules:
- Translate faithfully. Never add a fact, a number, a feature, a promise, a guarantee or a superlative that the source does not contain. Keep every number, unit, size and brand exactly.
- No exclamation marks, no emojis.
- "specs" fields keep one "label: value" per line, the same lines in the same order.
- Keep paragraph breaks (blank lines) in descriptions.
- "keywords": 8 to 20 comma-separated search terms a Tunisian customer might type for this product and that the texts support: synonyms in French, in Tunisian Arabic, in Tunisian written in Latin letters (arabizi, e.g. "lamba" for لمبة), and frequent misspellings. Lower case, no duplicates.
- Return every field. A field you were not asked to write is returned exactly as given.`;

export const taskFor = (mode: TranslateMode) =>
  mode === "to-ar"
    ? "Rewrite every Arabic field (nameAr, summaryAr, descriptionAr, specsAr, variants[].nameAr, offers[].labelAr) from its French counterpart, even when the Arabic is already filled. Write the keywords if they are empty."
    : "Fill every empty field whose counterpart in the other language is filled, by translating it (French → Tunisian Arabic, or Tunisian Arabic → French). Write the keywords if they are empty. Leave filled fields as they are.";

/** The whole request as one text to paste into a chat assistant. */
export function manualRequest(texts: ProductTexts, mode: TranslateMode): string {
  return `${SYSTEM}

${taskFor(mode)}

Answer with the JSON object only, with exactly the same fields as below, and nothing before or after it.

Product texts (JSON):
${JSON.stringify(texts, null, 2)}`;
}

/** The reply pasted back: the JSON object found in it (code fences and text around it are ignored), or null. */
export function readManualAnswer(reply: string): ProductTexts | null {
  const from = reply.indexOf("{");
  const to = reply.lastIndexOf("}");
  if (from < 0 || to <= from) return null;
  try {
    const parsed = Answer.safeParse(JSON.parse(reply.slice(from, to + 1)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Several products in one request, for translating a whole import without an
 * API key. Each product carries a short "ref" so the reply can be matched back
 * even when the assistant changes the order.
 */
export function manualBatchRequest(items: { ref: string; texts: ProductTexts }[], mode: TranslateMode = "fill"): string {
  return `${SYSTEM}

${taskFor(mode)} Do it for each product of the list below.

Answer with a JSON array only, one object per product, each with its "ref" unchanged and exactly the same fields as given, and nothing before or after the array.

Products (JSON):
${JSON.stringify(items.map((i) => ({ ref: i.ref, ...i.texts })), null, 1)}`;
}

/** The pasted reply to a batch: each product found in it, by ref. Products missing or unreadable are left out. */
export function readManualBatch(reply: string): Map<string, ProductTexts> {
  const out = new Map<string, ProductTexts>();
  const from = reply.indexOf("[");
  const to = reply.lastIndexOf("]");
  if (from < 0 || to <= from) return out;
  let list: unknown;
  try {
    list = JSON.parse(reply.slice(from, to + 1));
  } catch {
    return out;
  }
  if (!Array.isArray(list)) return out;
  for (const item of list) {
    if (!item || typeof item !== "object" || typeof (item as { ref?: unknown }).ref !== "string") continue;
    const parsed = Answer.safeParse(item);
    if (parsed.success) out.set((item as { ref: string }).ref, parsed.data);
  }
  return out;
}
