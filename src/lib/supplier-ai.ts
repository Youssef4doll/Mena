import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { MODEL } from "./translate";
import { DRAFT_SCHEMA, Draft, SUPPLIER_SYSTEM, cleanDraft, draftTask, type DraftInput } from "./supplier-prompt";

/**
 * A product page written by Claude from a supplier's page, in French and in
 * Tunisian Arabic. Server only: the key (ANTHROPIC_API_KEY) never leaves the
 * server, and the back office receives only the texts, to read before saving.
 */
export async function draftFromSupplierPage(input: DraftInput): Promise<Draft> {
  const client = new Anthropic();
  // Streamed: a long page in two languages can take a while, and a stream is not cut by the HTTP timeout.
  const response = await client.beta.messages
    .stream({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      // A declined request is re-run on Anthropic's recommended model instead of failing.
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema", schema: DRAFT_SCHEMA } },
      system: SUPPLIER_SYSTEM,
      messages: [{ role: "user", content: draftTask(input) }],
    })
    .finalMessage();
  if (response.stop_reason === "refusal") throw new Error("L'IA a refusé d'écrire cette fiche. Écrivez-la vous-même.");
  if (response.stop_reason === "max_tokens") throw new Error("Page trop longue : copiez seulement la partie du produit.");
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error("Réponse vide.");
  const parsed = Draft.safeParse(JSON.parse(text.text));
  if (!parsed.success) throw new Error("Réponse illisible.");
  return cleanDraft(parsed.data);
}
