import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { MODEL } from "./translate";
import { IDEAS_ANSWER_SCHEMA, IDEAS_SYSTEM, Idea, cleanIdeas, ideasTask, type IdeaTexts, type ImageIdea } from "./image-ideas";
import { z } from "zod";

/** The tall pictures of a product planned by Claude from its texts. Server only: the key never leaves the server. */
export async function ideasForProduct(texts: IdeaTexts): Promise<ImageIdea[]> {
  const client = new Anthropic();
  const response = await client.beta.messages
    .stream({
      model: MODEL,
      max_tokens: 8000,
      betas: ["server-side-fallback-2026-07-01"],
      // A declined request is re-run on Anthropic's recommended model instead of failing.
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema", schema: IDEAS_ANSWER_SCHEMA } },
      system: IDEAS_SYSTEM,
      messages: [{ role: "user", content: ideasTask(texts) }],
    })
    .finalMessage();
  if (response.stop_reason === "refusal") throw new Error("L'IA a refusé cette demande.");
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error("Réponse vide.");
  const parsed = z.object({ imageIdeas: z.array(Idea) }).safeParse(JSON.parse(text.text));
  if (!parsed.success) throw new Error("Réponse illisible.");
  return cleanIdeas(parsed.data.imageIdeas);
}
