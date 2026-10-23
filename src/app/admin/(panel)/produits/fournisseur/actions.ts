"use server";

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { translationReady } from "@/lib/translate";
import { draftFromSupplierPage } from "@/lib/supplier-ai";
import { MAX_PAGE_TEXT } from "@/lib/supplier-page";
import type { Draft } from "@/lib/supplier-prompt";

/**
 * The product page written by Claude from the supplier's page the owner
 * pasted. Nothing is saved here: the page shows the result first.
 */
export async function writeDraft(text: string): Promise<{ ok: true; draft: Draft } | { ok: false; error: string }> {
  await requireAdmin();
  if (!translationReady()) return { ok: false, error: "IA non configurée : ajoutez la variable ANTHROPIC_API_KEY dans Vercel (Settings → Environment Variables), puis redéployez." };
  const page = z.string().trim().min(20).max(MAX_PAGE_TEXT).safeParse(text);
  if (!page.success) return { ok: false, error: "La page collée est vide ou trop longue." };
  const categories = (await prisma.category.findMany({ orderBy: [{ sort: "asc" }, { name: "asc" }], select: { name: true } })).map((c) => c.name);
  try {
    return { ok: true, draft: await draftFromSupplierPage({ text: page.data, categories }) };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return { ok: false, error: "La clé ANTHROPIC_API_KEY est refusée : vérifiez-la dans Vercel." };
    if (e instanceof Anthropic.RateLimitError) return { ok: false, error: "Trop de demandes d'un coup : réessayez dans une minute." };
    if (e instanceof Anthropic.APIError) return { ok: false, error: "L'IA ne répond pas pour le moment. Réessayez plus tard." };
    return { ok: false, error: e instanceof Error ? e.message : "Écriture impossible." };
  }
}

/** A product of the shop that a pasted product already is, with what it already has. */
export type Match = {
  id: string; slug: string; name: string; active: boolean; price: number; cost: number | null; category: string | null; supplierUrl: string;
  filled: { summary: boolean; description: boolean; specs: boolean; variants: boolean }; photos: number;
};

/** `slugTaken`: the address the name gives belongs to another product (another supplier code), so a new one needs its own. */
export type Found = { match: Match | null; slugTaken: boolean };

const items = z.array(z.object({ ref: z.string().max(120), slug: z.string().max(100) })).max(2000);

/**
 * For each pasted product, the shop's product it already is: the one with the
 * same supplier code, else the one at the same address unless that one has
 * another supplier code. Writes nothing.
 */
export async function matchProducts(raw: { ref: string; slug: string }[]): Promise<Found[]> {
  await requireAdmin();
  const list = items.parse(raw);
  const refs = [...new Set(list.map((i) => i.ref.trim()).filter(Boolean))];
  const slugs = [...new Set(list.map((i) => i.slug).filter(Boolean))];
  if (!refs.length && !slugs.length) return list.map(() => ({ match: null, slugTaken: false }));
  const found = await prisma.product.findMany({
    where: { OR: [...(refs.length ? [{ supplierRef: { in: refs, mode: "insensitive" as const } }] : []), ...(slugs.length ? [{ slug: { in: slugs } }, { oldSlugs: { hasSome: slugs } }] : [])] },
    orderBy: { createdAt: "asc" },
    select: {
      id: true, slug: true, oldSlugs: true, name: true, active: true, price: true, cost: true, supplierRef: true, supplierUrl: true, summary: true, description: true, specs: true,
      category: { select: { name: true } }, _count: { select: { variants: true, images: { where: { kind: "GALLERY" } } } },
    },
  });
  const code = (s: string | null) => (s ?? "").trim().toLowerCase();
  return list.map((i) => {
    const atSlug = i.slug ? (found.find((f) => f.slug === i.slug) ?? found.find((f) => f.oldSlugs.includes(i.slug))) : undefined;
    const other = Boolean(atSlug && code(i.ref) && code(atSlug.supplierRef) && code(atSlug.supplierRef) !== code(i.ref));
    const p = (code(i.ref) && found.find((f) => code(f.supplierRef) === code(i.ref))) || (other ? undefined : atSlug);
    if (!p) return { match: null, slugTaken: Boolean(atSlug) };
    return { slugTaken: false, match: {
      id: p.id, slug: p.slug, name: p.name, active: p.active, price: p.price, cost: p.cost, category: p.category?.name ?? null, supplierUrl: p.supplierUrl ?? "",
      filled: { summary: Boolean(p.summary.trim()), description: Boolean(p.description.trim()), specs: Boolean(p.specs.trim()), variants: p._count.variants > 0 },
      photos: p._count.images,
    } };
  });
}
