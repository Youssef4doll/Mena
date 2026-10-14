import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { mergeTranslation, type ProductTexts, type TranslateMode } from "./translate-merge";

export type { ProductTexts, TranslateMode };

/**
 * Product texts translated by Claude: French ↔ Tunisian Arabic, plus the
 * search keywords customers type. Server only: the key (ANTHROPIC_API_KEY)
 * never leaves the server, and the back office receives only the texts, to
 * read again before saving.
 */
const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

export const translationReady = () => Boolean(process.env.ANTHROPIC_API_KEY);

const pair = { type: "string" } as const;
const SCHEMA = {
  type: "object",
  properties: {
    name: pair,
    nameAr: pair,
    summary: pair,
    summaryAr: pair,
    description: pair,
    descriptionAr: pair,
    specs: pair,
    specsAr: pair,
    keywords: pair,
    variants: { type: "array", items: { type: "object", properties: { name: pair, nameAr: pair }, required: ["name", "nameAr"], additionalProperties: false } },
    offers: { type: "array", items: { type: "object", properties: { label: pair, labelAr: pair }, required: ["label", "labelAr"], additionalProperties: false } },
  },
  required: ["name", "nameAr", "summary", "summaryAr", "description", "descriptionAr", "specs", "specsAr", "keywords", "variants", "offers"],
  additionalProperties: false,
};

const Answer = z.object({
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

const SYSTEM = `You write the product texts of Mena, an online shop in Tunisia that sells with cash on delivery. Many customers are older people reading on a phone.

Arabic texts are in Tunisian Arabic (derja), written in Arabic letters, the way Tunisian shops write to their customers: everyday words an older Tunisian understands at once (for example توّا، برشا، متاع، كي، باش، يتشحن، الكرطونة). Not formal Modern Standard Arabic, and not Moroccan, Algerian, Egyptian or Gulf dialect. Product names may keep a common French or English word when that is what Tunisians say (LED, USB-C, sèche-cheveux → سشوار).
French texts are plain, correct French.

Rules:
- Translate faithfully. Never add a fact, a number, a feature, a promise, a guarantee or a superlative that the source does not contain. Keep every number, unit, size and brand exactly.
- No exclamation marks, no emojis.
- "specs" fields keep one "label: value" per line, the same lines in the same order.
- Keep paragraph breaks (blank lines) in descriptions.
- "keywords": 8 to 20 comma-separated search terms a Tunisian customer might type for this product and that the texts support: synonyms in French, in Tunisian Arabic, in Tunisian written in Latin letters (arabizi, e.g. "lamba" for لمبة), and frequent misspellings. Lower case, no duplicates.
- Return every field. A field you were not asked to write is returned exactly as given.`;

/** Fills the missing language of each text (or rewrites the Arabic from the French), and the keywords when empty. */
export async function translateProduct(texts: ProductTexts, mode: TranslateMode): Promise<ProductTexts> {
  const client = new Anthropic();
  const task =
    mode === "to-ar"
      ? "Rewrite every Arabic field (nameAr, summaryAr, descriptionAr, specsAr, variants[].nameAr, offers[].labelAr) from its French counterpart, even when the Arabic is already filled. Write the keywords if they are empty."
      : "Fill every empty field whose counterpart in the other language is filled, by translating it (French → Tunisian Arabic, or Tunisian Arabic → French). Write the keywords if they are empty. Leave filled fields as they are.";
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    // A declined request is re-run on Anthropic's recommended model instead of failing.
    fallbacks: "default",
    output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: "user", content: `${task}\n\nProduct texts (JSON):\n${JSON.stringify(texts)}` }],
  });
  if (response.stop_reason === "refusal") throw new Error("La traduction a été refusée. Écrivez ce texte vous-même.");
  if (response.stop_reason === "max_tokens") throw new Error("Textes trop longs pour être traduits en une fois.");
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error("Réponse vide.");
  const parsed = Answer.safeParse(JSON.parse(text.text));
  if (!parsed.success) throw new Error("Réponse illisible.");
  return mergeTranslation(texts, parsed.data, mode);
}
