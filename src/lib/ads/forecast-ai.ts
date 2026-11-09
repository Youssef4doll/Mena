import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { MODEL } from "../translate";
import type { BriefInput } from "./brief";
import { BENCH_SCHEMA, BENCH_SYSTEM, REVIEW_SCHEMA, readBenchReply, type BenchAnswer, REVIEW_SYSTEM, benchTask, cleanReview, reviewTask, type CreativeBrief, type ReviewResult } from "./forecast-prompt";

/**
 * The forecast's two requests, run by Claude on the server with the API key
 * (ANTHROPIC_API_KEY, never sent to the browser). Same texts as the manual
 * way (forecast-prompt.ts). Nothing is saved here.
 */

/** A paused search (the server's own loop ran long) is taken up again this many times at most. */
const MAX_CONTINUATIONS = 4;

type Block = Anthropic.Beta.Messages.BetaContentBlock;

/** Every address Claude's own search and reading returned: a figure's page is "checked" only when it is one of these. */
export function seenUrls(blocks: Block[]): Set<string> {
  const out = new Set<string>();
  for (const b of blocks) {
    if (b.type === "web_search_tool_result" && Array.isArray(b.content)) for (const r of b.content) out.add(r.url);
    if (b.type === "web_fetch_tool_result" && b.content.type === "web_fetch_result") out.add(b.content.url);
  }
  return out;
}

/** Public figures from the web, with the pages Claude really got back. */
export async function researchBenchmarks(): Promise<{ answer: BenchAnswer; seen: Set<string> }> {
  const client = new Anthropic();
  const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [{ role: "user", content: benchTask() }];
  let done: Anthropic.Beta.Messages.BetaContentBlockParam[] = [];
  const all: Block[] = [];
  for (let turn = 0; turn <= MAX_CONTINUATIONS; turn++) {
    const response = await client.beta.messages
      .stream({
        model: MODEL,
        max_tokens: 20000,
        betas: ["server-side-fallback-2026-07-01"],
        // A declined request is re-run on Anthropic's recommended model instead of failing.
        fallbacks: "default",
        output_config: { effort: "high" },
        system: BENCH_SYSTEM,
        tools: [
          { type: "web_search_20260209", name: "web_search", max_uses: 10 },
          { type: "web_fetch_20260209", name: "web_fetch", max_uses: 8, max_content_tokens: 20000 },
          {
            name: "report",
            description: "Your answer, given once at the end: every figure found, each with its page, market, period and exact sentence, and the TND exchange rates used.",
            input_schema: BENCH_SCHEMA as Anthropic.Beta.Messages.BetaTool["input_schema"],
            eager_input_streaming: true,
          },
        ],
        messages,
      })
      .finalMessage();
    all.push(...response.content);
    if (response.stop_reason === "refusal") throw new Error("La recherche a été refusée.");
    if (response.stop_reason === "max_tokens") throw new Error("Réponse trop longue : réessayez.");
    const call = response.content.find((b) => b.type === "tool_use" && b.name === "report");
    if (call && call.type === "tool_use") {
      // Streamed inputs are not checked by the API: read against the form here, figure by figure.
      const answer = readBenchReply(JSON.stringify(call.input ?? {}));
      if (!answer) throw new Error("Réponse illisible : réessayez.");
      return { answer, seen: seenUrls(all) };
    }
    if (response.stop_reason !== "pause_turn") break;
    // Taken up where it stopped: the paused turn is sent back as it is.
    done = [...done, ...response.content];
    messages.splice(1, messages.length - 1, { role: "assistant", content: done });
  }
  throw new Error("Aucun chiffre public trouvé : réessayez plus tard.");
}

/** A JPEG picture for the request, from a data URL made in the browser. */
export type Picture = { media: "image/jpeg" | "image/png" | "image/webp"; data: string };

/** The creatives graded by Claude, looking at the product's photos and every ad's picture or frames. */
export async function reviewCreatives(input: BriefInput, creatives: CreativeBrief[], photos: Picture[], sheets: Picture[]): Promise<ReviewResult> {
  const client = new Anthropic();
  const images: Anthropic.Beta.Messages.BetaContentBlockParam[] = [...photos, ...sheets].map((p) => ({ type: "image", source: { type: "base64", media_type: p.media, data: p.data } }));
  const response = await client.beta.messages
    .stream({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "high", format: { type: "json_schema", schema: REVIEW_SCHEMA } },
      system: REVIEW_SYSTEM,
      messages: [{ role: "user", content: [...images, { type: "text", text: reviewTask(input, creatives, photos.length) }] }],
    })
    .finalMessage();
  if (response.stop_reason === "refusal") throw new Error("La demande a été refusée. Copiez-la dans claude.ai.");
  if (response.stop_reason === "max_tokens") throw new Error("Réponse trop longue : envoyez moins de publicités.");
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error("Réponse vide.");
  let data: unknown;
  try {
    data = JSON.parse(text.text);
  } catch {
    throw new Error("Réponse illisible.");
  }
  const review = cleanReview(data, creatives.map((c) => c.id));
  if (!review) throw new Error("Réponse illisible : aucune publicité notée.");
  return review;
}
