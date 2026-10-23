import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { mergeTranslation, type ProductTexts, type TranslateMode } from "./translate-merge";
import { Answer, SYSTEM, taskFor } from "./translate-prompt";

export type { ProductTexts, TranslateMode };

/**
 * Product texts translated by Claude: French ↔ Tunisian Arabic, plus the
 * search keywords customers type and the title and description for Google. Server only: the key (ANTHROPIC_API_KEY)
 * never leaves the server, and the back office receives only the texts, to
 * read again before saving.
 */
export const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

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
    seoTitle: pair,
    seoTitleAr: pair,
    seoDescription: pair,
    seoDescriptionAr: pair,
    variants: { type: "array", items: { type: "object", properties: { name: pair, nameAr: pair }, required: ["name", "nameAr"], additionalProperties: false } },
    offers: { type: "array", items: { type: "object", properties: { label: pair, labelAr: pair }, required: ["label", "labelAr"], additionalProperties: false } },
  },
  required: ["name", "nameAr", "summary", "summaryAr", "description", "descriptionAr", "specs", "specsAr", "keywords", "seoTitle", "seoTitleAr", "seoDescription", "seoDescriptionAr", "variants", "offers"],
  additionalProperties: false,
};

/** Fills the missing language of each text (or rewrites the Arabic from the French), and the keywords when empty. */
export async function translateProduct(texts: ProductTexts, mode: TranslateMode): Promise<ProductTexts> {
  const client = new Anthropic();
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    // A declined request is re-run on Anthropic's recommended model instead of failing.
    fallbacks: "default",
    output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: "user", content: `${taskFor(mode)}\n\nProduct texts (JSON):\n${JSON.stringify(texts)}` }],
  });
  if (response.stop_reason === "refusal") throw new Error("La traduction a été refusée. Écrivez ce texte vous-même.");
  if (response.stop_reason === "max_tokens") throw new Error("Textes trop longs pour être traduits en une fois.");
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error("Réponse vide.");
  const parsed = Answer.safeParse(JSON.parse(text.text));
  if (!parsed.success) throw new Error("Réponse illisible.");
  return mergeTranslation(texts, parsed.data, mode);
}
