import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { MODEL } from "./translate";
import { REPORT_SCHEMA, WEB_SYSTEM, WebReport, webTask, type WebProduct } from "./web-complete-prompt";

/** A paused search (the server's own loop of searches ran long) is taken up again this many times at most. */
const MAX_CONTINUATIONS = 4;

/**
 * One product looked up on the web by Claude: it searches, reads the pages
 * of this exact product, and answers with its "report" tool (the pages, a
 * video, texts written from those pages). Server only: the key
 * (ANTHROPIC_API_KEY) never leaves the server. Nothing is saved here.
 */
export async function researchProduct(product: WebProduct): Promise<WebReport> {
  const client = new Anthropic();
  const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [{ role: "user", content: webTask(product) }];
  // What the assistant already did before a pause: each answer goes on from it.
  let done: Anthropic.Beta.Messages.BetaContentBlockParam[] = [];
  for (let turn = 0; turn <= MAX_CONTINUATIONS; turn++) {
    // Streamed: searching and reading several pages takes a while, and a stream is not cut by the HTTP timeout.
    const response = await client.beta.messages
      .stream({
        model: MODEL,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        // A declined request is re-run on Anthropic's recommended model instead of failing.
        fallbacks: "default",
        output_config: { effort: "medium" },
        system: WEB_SYSTEM,
        tools: [
          { type: "web_search_20260209", name: "web_search", max_uses: 6 },
          { type: "web_fetch_20260209", name: "web_fetch", max_uses: 5, max_content_tokens: 20000 },
          {
            name: "report",
            description: "Your answer for this product, given once at the end: the pages of this exact product, large photo addresses seen in them, one video, and the texts written from those pages.",
            input_schema: REPORT_SCHEMA as Anthropic.Beta.Messages.BetaTool["input_schema"],
            eager_input_streaming: true,
          },
        ],
        messages,
      })
      .finalMessage();
    if (response.stop_reason === "refusal") throw new Error("L'IA a refusé de chercher ce produit.");
    const call = response.content.find((b) => b.type === "tool_use" && b.name === "report");
    if (response.stop_reason === "max_tokens") throw new Error("Réponse trop longue : réessayez ce produit.");
    if (call && call.type === "tool_use") {
      // Streamed inputs are not checked by the API: the answer is read against its form here.
      const parsed = WebReport.safeParse(call.input);
      if (!parsed.success) throw new Error("Réponse illisible : réessayez ce produit.");
      return parsed.data;
    }
    if (response.stop_reason !== "pause_turn") break;
    // Taken up where it stopped: the paused turn is sent back as it is, with nothing added.
    done = [...done, ...response.content];
    messages.splice(1, messages.length - 1, { role: "assistant", content: done });
  }
  throw new Error("Rien de sûr trouvé pour ce produit.");
}
