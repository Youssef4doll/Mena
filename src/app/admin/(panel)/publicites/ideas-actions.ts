"use server";

import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { requireAdmin } from "@/lib/admin-auth";
import { translationReady } from "@/lib/translate";
import { loadBriefInput } from "@/lib/ads/brief-data";
import { generateIdeas } from "@/lib/ads/ideas";
import { MAX_IDEAS, MIN_IDEAS, conceptWarnings, type IdeaConcept } from "@/lib/ads/ideas-prompt";
import type { BriefInput } from "@/lib/ads/brief";

/**
 * The "Idées" tab's server side: the product's brief input, read again from
 * the database each time (the browser never supplies the facts an ad is
 * built from), and the ad concepts generated with the API key when there is
 * one. Without a key the tab copies the same request for claude.ai
 * (ideasRequest) and reads the pasted reply (readIdeasReply) in the browser.
 */

const productId = z.string().regex(/^[a-z0-9]{20,40}$/);
const count = z.number().int().min(MIN_IDEAS).max(MAX_IDEAS);

export type BriefResult = { ok: true; input: BriefInput } | { ok: false; error: string };
export type IdeasResult = { ok: true; concepts: IdeaConcept[]; warnings: string[][] } | { ok: false; error: string };

/** The brief input of one product, for a picker that changes product without reloading the page. */
export async function loadAdBrief(id: string): Promise<BriefResult> {
  await requireAdmin();
  const parsed = productId.safeParse(id);
  if (!parsed.success) return { ok: false, error: "Produit introuvable." };
  const input = await loadBriefInput(parsed.data);
  return input ? { ok: true, input } : { ok: false, error: "Produit introuvable : il a peut-être été supprimé." };
}

/**
 * Writes `n` ad concepts for the product. Nothing is saved; each concept
 * comes with the rules its texts break (warnings[i], empty when none), to
 * read before using it.
 */
export async function generateAdIdeas(id: string, n: number): Promise<IdeasResult> {
  await requireAdmin();
  if (!translationReady()) return { ok: false, error: "Génération non configurée : ajoutez la variable ANTHROPIC_API_KEY dans Vercel, ou copiez la demande pour claude.ai." };
  const parsed = z.object({ id: productId, n: count }).safeParse({ id, n });
  if (!parsed.success) return { ok: false, error: `Choisissez un produit et de ${MIN_IDEAS} à ${MAX_IDEAS} concepts.` };
  const input = await loadBriefInput(parsed.data.id);
  if (!input) return { ok: false, error: "Produit introuvable : il a peut-être été supprimé." };
  try {
    const concepts = await generateIdeas(input, parsed.data.n);
    return { ok: true, concepts, warnings: concepts.map((c) => conceptWarnings(c, input)) };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return { ok: false, error: "La clé ANTHROPIC_API_KEY est refusée : vérifiez-la dans Vercel." };
    if (e instanceof Anthropic.RateLimitError) return { ok: false, error: "Trop de demandes d'un coup : réessayez dans une minute." };
    if (e instanceof Anthropic.APIError) return { ok: false, error: "Le service ne répond pas pour le moment. Réessayez plus tard, ou copiez la demande pour claude.ai." };
    return { ok: false, error: e instanceof Error ? e.message : "Génération impossible." };
  }
}
