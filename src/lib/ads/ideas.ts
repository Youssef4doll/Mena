import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { MODEL } from "../translate";
import type { BriefInput } from "./brief";
import { IDEAS_SCHEMA, IDEAS_SYSTEM, IdeasAnswer, ideaCount, ideasTask, normalizeConcepts, type IdeaConcept } from "./ideas-prompt";

/**
 * Ad concepts written by Claude on the server, from the same request as the
 * manual copy for claude.ai (ideas-prompt.ts). Server only: the key
 * (ANTHROPIC_API_KEY, see translationReady) never leaves the server. Same
 * model and call as the product translation, with two differences: the
 * answer is streamed, because several concepts in two languages are long
 * enough to outlast a plain request, and the errors say what to do instead.
 */
export async function generateIdeas(input: BriefInput, count: number): Promise<IdeaConcept[]> {
  const n = ideaCount(count);
  const client = new Anthropic();
  const response = await client.beta.messages
    .stream({
      model: MODEL,
      max_tokens: 32000,
      betas: ["server-side-fallback-2026-07-01"],
      // A declined request is re-run on Anthropic's recommended model instead of failing.
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema", schema: IDEAS_SCHEMA } },
      system: IDEAS_SYSTEM,
      messages: [{ role: "user", content: ideasTask(input, n) }],
    })
    .finalMessage();
  if (response.stop_reason === "refusal") throw new Error("La demande a été refusée. Copiez-la dans claude.ai, ou écrivez les concepts à partir du brief.");
  if (response.stop_reason === "max_tokens") throw new Error("Réponse trop longue : demandez moins de concepts.");
  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new Error("Réponse vide.");
  let data: unknown;
  try {
    data = JSON.parse(block.text);
  } catch {
    throw new Error("Réponse illisible.");
  }
  const parsed = IdeasAnswer.safeParse(data);
  if (!parsed.success) throw new Error("Réponse illisible.");
  return normalizeConcepts(parsed.data.concepts, input, n);
}
