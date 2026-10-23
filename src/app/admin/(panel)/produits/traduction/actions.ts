"use server";

import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import type { Prisma } from "@prisma/client";
import { revalidatePath, revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { CATALOG_TAG } from "@/lib/catalog";
import { refreshCatalog } from "@/lib/catalog-refresh";
import { translateProduct, translationReady } from "@/lib/translate";
import { mergeTranslation, needsTranslation, type ProductTexts } from "@/lib/translate-merge";
import { PRODUCT_ID, storedTexts, textWrites, textsSelect, translationSchema } from "@/lib/translate-batch";

/**
 * What happened to one product: texts written, nothing to do (already in
 * both languages), deleted meanwhile, or a reply too long to be saved. `left`
 * says a text is still in one language only; `texts` are then the saved
 * texts, to ask for the rest.
 */
export type Outcome = { id: string; status: "translated" | "nothing" | "missing" | "invalid"; left: boolean; texts?: ProductTexts };

/**
 * Writes translated texts into the products. The merge runs here, on the
 * texts read from the database now: only empty fields are filled and a field
 * already written is never replaced, whatever the browser sends. Only the
 * changed columns are written, every product in one transaction.
 */
async function saveTexts(items: { id: string; answer: ProductTexts }[]): Promise<Outcome[]> {
  if (items.length === 0) return [];
  const rows = await prisma.product.findMany({ where: { id: { in: items.map((i) => i.id) } }, select: { id: true, ...textsSelect } });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ops: Prisma.PrismaPromise<unknown>[] = [];
  const out = items.map(({ id, answer }): Outcome => {
    const row = byId.get(id);
    if (!row) return { id, status: "missing", left: false };
    const before = storedTexts(row);
    const after = mergeTranslation(before, answer, "fill");
    const left = needsTranslation(after);
    const w = textWrites(before, after);
    if (!w) return { id, status: "nothing", left, texts: left ? after : undefined };
    // updatedAt moves even when only an option changed: an open editor then shows the saved texts.
    ops.push(prisma.product.update({ where: { id }, data: { ...w.product, updatedAt: new Date() }, select: { id: true } }));
    for (const v of w.variants) ops.push(prisma.productVariant.update({ where: { id: row.variants[v.index].id }, data: { name: v.name, nameAr: v.nameAr }, select: { id: true } }));
    for (const o of w.offers) ops.push(prisma.productOffer.update({ where: { id: row.offers[o.index].id }, data: { label: o.label, labelAr: o.labelAr }, select: { id: true } }));
    return { id, status: "translated", left, texts: left ? after : undefined };
  });
  if (ops.length === 1) await ops[0];
  else if (ops.length > 1) await prisma.$transaction(ops);
  return out;
}

const batch = z.array(z.object({ id: z.string().regex(PRODUCT_ID), texts: z.unknown() })).min(1).max(20);

/**
 * The translations of one batch, read from a reply pasted in the browser.
 * The shop's cache is marked stale without re-rendering this page;
 * translationsDone() refreshes everything once the batches are done.
 */
export async function applyTranslations(raw: { id: string; texts: ProductTexts }[]): Promise<{ ok: true; results: Outcome[] } | { ok: false; error: string }> {
  await requireAdmin();
  const parsed = batch.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Envoi refusé : 20 produits au plus par envoi." };
  const valid: { id: string; answer: ProductTexts }[] = [];
  const invalid: Outcome[] = [];
  const seen = new Set<string>();
  for (const it of parsed.data) {
    if (seen.has(it.id)) continue;
    seen.add(it.id);
    const t = translationSchema.safeParse(it.texts);
    if (t.success) valid.push({ id: it.id, answer: t.data });
    else invalid.push({ id: it.id, status: "invalid", left: true });
  }
  const results = [...(await saveTexts(valid)), ...invalid];
  if (results.some((r) => r.status === "translated")) revalidateTag(CATALOG_TAG, "max");
  return { ok: true, results };
}

type Failure = { ok: false; error: string; stop: boolean };

/** Why a translation failed; `stop` when every next product would fail the same way. */
function failure(e: unknown): Failure {
  if (e instanceof Anthropic.AuthenticationError) return { ok: false, error: "La clé ANTHROPIC_API_KEY est refusée : vérifiez-la dans Vercel.", stop: true };
  if (e instanceof Anthropic.RateLimitError) return { ok: false, error: "Trop de traductions d'un coup : réessayez dans une minute.", stop: true };
  if (e instanceof Anthropic.APIError) return { ok: false, error: "Le service de traduction ne répond pas pour le moment. Réessayez plus tard.", stop: true };
  if (e instanceof SyntaxError) return { ok: false, error: "Réponse illisible.", stop: false };
  return { ok: false, error: e instanceof Error ? e.message : "Traduction impossible.", stop: false };
}

/**
 * One product translated with the API key and saved at once; the page calls
 * it product after product. The texts are read fresh, so a product already
 * translated meanwhile costs nothing.
 */
export async function translateStored(id: string): Promise<{ ok: true; result: Outcome } | Failure> {
  await requireAdmin();
  if (!translationReady()) return { ok: false, error: "Traduction automatique non configurée : ajoutez la variable ANTHROPIC_API_KEY dans Vercel.", stop: true };
  if (typeof id !== "string" || !PRODUCT_ID.test(id)) return { ok: false, error: "Produit inconnu.", stop: false };
  const row = await prisma.product.findUnique({ where: { id }, select: textsSelect });
  if (!row) return { ok: true, result: { id, status: "missing", left: false } };
  const texts = storedTexts(row);
  if (!needsTranslation(texts)) return { ok: true, result: { id, status: "nothing", left: false } };
  try {
    const answer = translationSchema.safeParse(await translateProduct(texts, "fill"));
    if (!answer.success) return { ok: true, result: { id, status: "invalid", left: true } };
    const [result] = await saveTexts([{ id, answer: answer.data }]);
    if (result.status === "translated") revalidateTag(CATALOG_TAG, "max");
    return { ok: true, result: { id, status: result.status, left: result.left } };
  } catch (e) {
    return failure(e);
  }
}

/** Once a run is over: the product list and this page show the new texts at once, the shop rebuilds its pages in the background. */
export async function translationsDone(): Promise<{ ok: true }> {
  await requireAdmin();
  await refreshCatalog();
  revalidatePath("/admin/produits");
  return { ok: true };
}
