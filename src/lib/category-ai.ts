import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { MODEL } from "./translate";
import { CATEGORIES_SCHEMA, CATEGORIES_SYSTEM, categoriesTask, readCategoriesAnswer, type CategoryArabic, type CategoryText } from "./category-ar";

/** Category names and titles in Tunisian Arabic, by Claude. Server only: the key never leaves the server. */
export async function translateCategoryTexts(items: CategoryText[]): Promise<CategoryArabic[]> {
  const client = new Anthropic();
  const response = await client.beta.messages
    .stream({
      model: MODEL,
      max_tokens: 8000,
      betas: ["server-side-fallback-2026-07-01"],
      // A declined request is re-run on Anthropic's recommended model instead of failing.
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: CATEGORIES_SCHEMA } },
      system: CATEGORIES_SYSTEM,
      messages: [{ role: "user", content: categoriesTask(items) }],
    })
    .finalMessage();
  const text = response.content.find((b) => b.type === "text");
  if (response.stop_reason === "refusal" || !text || text.type !== "text") throw new Error("Traduction impossible.");
  return readCategoriesAnswer(text.text) ?? [];
}
