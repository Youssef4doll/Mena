"use server";

import { z } from "zod";
import { revalidatePath, updateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { CATALOG_TAG } from "@/lib/catalog";
import { storeImage, MAX_UPLOAD } from "@/lib/media";
import { addProductImage } from "@/lib/product-images";
import { productForForm, toInput, writeProduct, type ProductInput } from "@/lib/product-write";
import Anthropic from "@anthropic-ai/sdk";
import { translateProduct, translationReady, type ProductTexts, type TranslateMode } from "@/lib/translate";
import { ideasForProduct } from "@/lib/image-ideas-ai";
import type { IdeaTexts, ImageIdea } from "@/lib/image-ideas";

type Result = { ok: true; id?: string; message?: string } | { ok: false; error: string };

export type { ProductInput } from "@/lib/product-write";

function done() {
  updateTag(CATALOG_TAG);
  revalidatePath("/admin/produits");
}

/** `loadedAt`: the product's updatedAt when the form was opened (see writeProduct). */
export async function saveProduct(id: string | null, raw: ProductInput, loadedAt?: number): Promise<Result> {
  await requireAdmin();
  const r = await writeProduct(id, raw, typeof loadedAt === "number" && Number.isFinite(loadedAt) ? loadedAt : undefined);
  if (!r.ok) return r;
  done();
  return { ok: true, id: r.id, message: "Produit enregistré." };
}

type Kind = "GALLERY" | "DETAIL";
const kindOf = (v: unknown): Kind => (v === "DETAIL" ? "DETAIL" : "GALLERY");

export async function uploadImages(productId: string, form: FormData): Promise<Result> {
  await requireAdmin();
  const kind = kindOf(form.get("kind"));
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0).slice(0, 10);
  if (files.length === 0) return { ok: false, error: "Aucune image." };
  const last = await prisma.productImage.findFirst({ where: { productId, kind }, orderBy: { sort: "desc" }, select: { sort: true } });
  let sort = (last?.sort ?? -1) + 1;
  try {
    for (const f of files) {
      if (f.size > MAX_UPLOAD) return { ok: false, error: `${f.name} : 8 Mo maximum.` };
      const m = await storeImage(Buffer.from(await f.arrayBuffer()), f.type);
      await prisma.productImage.create({ data: { productId, mediaId: m.id, sort: sort++, kind } });
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Image refusée." };
  }
  done();
  return { ok: true };
}

export async function importImage(productId: string, url: string, kindRaw: Kind = "GALLERY"): Promise<Result> {
  await requireAdmin();
  const r = await addProductImage(productId, kindOf(kindRaw), { url: url.trim() });
  if (!r.ok) return r;
  done();
  return r.skipped ? { ok: true, message: "Cette image est déjà dans le produit." } : { ok: true };
}

/** After pictures sent through the images route: the shop and this page show them at once. */
export async function imagesChanged(): Promise<Result> {
  await requireAdmin();
  done();
  return { ok: true };
}

export async function moveImage(imageId: string, dir: -1 | 1): Promise<Result> {
  await requireAdmin();
  const img = await prisma.productImage.findUnique({ where: { id: imageId } });
  if (!img) return { ok: false, error: "Image introuvable." };
  // Pictures move among their own kind: the top gallery and the long pictures are two lists.
  const all = await prisma.productImage.findMany({ where: { productId: img.productId, kind: img.kind }, orderBy: { sort: "asc" } });
  const i = all.findIndex((x) => x.id === imageId);
  const j = i + dir;
  if (j < 0 || j >= all.length) return { ok: true };
  [all[i], all[j]] = [all[j], all[i]];
  await prisma.$transaction(all.map((x, n) => prisma.productImage.update({ where: { id: x.id }, data: { sort: n } })));
  done();
  return { ok: true };
}

export async function setImageAlt(imageId: string, alt: string): Promise<Result> {
  await requireAdmin();
  await prisma.productImage.update({ where: { id: imageId }, data: { alt: alt.slice(0, 140) || null } });
  done();
  return { ok: true };
}

/** The page a long picture shows on: the Arabic one, the French one, or both (null). The top photos are on both. */
export async function setImageLang(imageId: string, lang: string | null): Promise<Result> {
  await requireAdmin();
  const r = await prisma.productImage.updateMany({ where: { id: imageId, kind: "DETAIL" }, data: { lang: lang === "ar" || lang === "fr" ? lang : null } });
  if (r.count === 0) return { ok: false, error: "Image introuvable." };
  done();
  return { ok: true };
}

export async function deleteImage(imageId: string): Promise<Result> {
  await requireAdmin();
  const img = await prisma.productImage.delete({ where: { id: imageId } });
  const stillUsed = await prisma.productImage.count({ where: { mediaId: img.mediaId } });
  if (!stillUsed) await prisma.media.delete({ where: { id: img.mediaId } }).catch(() => {});
  done();
  return { ok: true };
}

export async function toggleActive(id: string, active: boolean): Promise<Result> {
  await requireAdmin();
  await prisma.product.update({ where: { id }, data: { active } });
  done();
  return { ok: true };
}

/** Deleting keeps past orders intact: their lines are snapshots. */
export async function deleteProduct(id: string): Promise<Result> {
  await requireAdmin();
  const imgs = await prisma.productImage.findMany({ where: { productId: id }, select: { mediaId: true } });
  await prisma.product.delete({ where: { id } });
  await prisma.media.deleteMany({ where: { id: { in: imgs.map((i) => i.mediaId) }, images: { none: {} } } });
  done();
  return { ok: true };
}

export async function deleteDemo(): Promise<Result> {
  await requireAdmin();
  const demo = await prisma.product.findMany({ where: { isDemo: true }, select: { id: true, images: { select: { mediaId: true } } } });
  const media = demo.flatMap((p) => p.images.map((i) => i.mediaId));
  await prisma.product.deleteMany({ where: { isDemo: true } });
  await prisma.media.deleteMany({ where: { id: { in: media }, images: { none: {} } } });
  done();
  return { ok: true, message: `${demo.length} produits de démonstration supprimés.` };
}

const texts = z.object({
  name: z.string().max(140),
  nameAr: z.string().max(140),
  summary: z.string().max(300),
  summaryAr: z.string().max(300),
  description: z.string().max(8000),
  descriptionAr: z.string().max(8000),
  specs: z.string().max(4000),
  specsAr: z.string().max(4000),
  keywords: z.string().max(1000),
  seoTitle: z.string().max(120),
  seoTitleAr: z.string().max(120),
  seoDescription: z.string().max(320),
  seoDescriptionAr: z.string().max(320),
  variants: z.array(z.object({ name: z.string().max(60), nameAr: z.string().max(60) })).max(60),
  offers: z.array(z.object({ label: z.string().max(80), labelAr: z.string().max(80) })).max(8),
});

/**
 * Translates the product's texts (French ↔ Tunisian Arabic) and writes its
 * search keywords. Nothing is saved: the editor shows the result, to read
 * again before "Enregistrer".
 */
export async function translateTexts(raw: ProductTexts, mode: TranslateMode): Promise<{ ok: true; texts: ProductTexts } | { ok: false; error: string }> {
  await requireAdmin();
  if (!translationReady()) return { ok: false, error: "Traduction automatique non configurée : ajoutez la variable ANTHROPIC_API_KEY dans Vercel (Settings → Environment Variables), puis redéployez." };
  const parsed = texts.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Textes trop longs pour être traduits." };
  try {
    return { ok: true, texts: await translateProduct(parsed.data, mode === "to-ar" ? "to-ar" : "fill") };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return { ok: false, error: "La clé ANTHROPIC_API_KEY est refusée : vérifiez-la dans Vercel." };
    if (e instanceof Anthropic.RateLimitError) return { ok: false, error: "Trop de traductions d'un coup : réessayez dans une minute." };
    if (e instanceof Anthropic.APIError) return { ok: false, error: "Le service de traduction ne répond pas pour le moment. Réessayez plus tard." };
    return { ok: false, error: e instanceof Error ? e.message : "Traduction impossible." };
  }
}

const ideaTexts = z.object({
  name: z.string().max(140), nameAr: z.string().max(140), summary: z.string().max(300),
  description: z.string().max(8000), descriptionAr: z.string().max(8000), specs: z.string().max(4000),
});

/** The tall pictures of a product, planned by the AI from its texts (as in the form, saved or not). Nothing is saved. */
export async function planImages(raw: IdeaTexts): Promise<{ ok: true; ideas: ImageIdea[] } | { ok: false; error: string }> {
  await requireAdmin();
  if (!translationReady()) return { ok: false, error: "IA non configurée : ajoutez la variable ANTHROPIC_API_KEY dans Vercel, puis redéployez." };
  const parsed = ideaTexts.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Textes trop longs." };
  if (!parsed.data.name.trim() && !parsed.data.nameAr.trim()) return { ok: false, error: "Écrivez d'abord le nom et la description du produit." };
  try {
    const ideas = await ideasForProduct(parsed.data);
    return ideas.length ? { ok: true, ideas } : { ok: false, error: "Pas assez d'informations dans les textes du produit." };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return { ok: false, error: "La clé ANTHROPIC_API_KEY est refusée : vérifiez-la dans Vercel." };
    if (e instanceof Anthropic.RateLimitError) return { ok: false, error: "Trop de demandes d'un coup : réessayez dans une minute." };
    if (e instanceof Anthropic.APIError) return { ok: false, error: "L'IA ne répond pas pour le moment. Réessayez plus tard." };
    return { ok: false, error: e instanceof Error ? e.message : "Impossible pour le moment." };
  }
}

/**
 * A copy of a product, offline, to make a near-identical one quickly: the
 * same texts, prices, options, offers and pictures. The pictures are shared,
 * not stored twice: deleting a product removes a picture only when no other
 * product uses it.
 */
export async function duplicateProduct(id: string): Promise<Result> {
  await requireAdmin();
  if (typeof id !== "string" || !/^[a-z0-9]{20,40}$/.test(id)) return { ok: false, error: "Produit introuvable." };
  const p = await prisma.product.findUnique({
    where: { id },
    select: { ...productForForm, images: { orderBy: { sort: "asc" }, select: { mediaId: true, kind: true, sort: true, alt: true, lang: true } } },
  });
  if (!p) return { ok: false, error: "Produit introuvable : il a peut-être été supprimé." };
  // "<adresse>-copie", then "-copie-2", "-copie-3"…: the first one no product uses, as its address or a former one.
  // Cut so that "-copie-50" still fits in the 100 characters of an address.
  const base = `${p.slug.slice(0, 88).replace(/-+$/, "")}-copie`;
  const tries = [base, ...Array.from({ length: 49 }, (_, i) => `${base}-${i + 2}`)];
  const taken = await prisma.product.findMany({ where: { OR: [{ slug: { in: tries } }, { oldSlugs: { hasSome: tries } }] }, select: { slug: true, oldSlugs: true } });
  const used = new Set(taken.flatMap((t) => [t.slug, ...t.oldSlugs]));
  const slug = tries.find((s) => !used.has(s));
  if (!slug) return { ok: false, error: "Trop de copies de ce produit : renommez-en une avant d'en faire une autre." };
  const input = toInput(p);
  const r = await writeProduct(null, {
    ...input,
    name: `${p.name.slice(0, 132).trimEnd()} (copie)`,
    slug,
    active: false,
    featured: false,
    variants: input.variants.map((v) => ({ ...v, id: undefined })),
    offers: input.offers.map((o) => ({ ...o, id: undefined })),
  });
  if (!r.ok) return r;
  if (p.images.length) {
    await prisma.productImage.createMany({ data: p.images.map((i) => ({ productId: r.id, mediaId: i.mediaId, kind: i.kind, sort: i.sort, alt: i.alt, lang: i.lang, source: null })) });
  }
  done();
  return { ok: true, id: r.id };
}
