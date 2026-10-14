"use server";

import { z } from "zod";
import { revalidatePath, updateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { CATALOG_TAG } from "@/lib/catalog";
import { importImageFromUrl, storeImage, MAX_UPLOAD } from "@/lib/media";
import { slugify } from "@/lib/slug";
import { parseVideo } from "@/lib/product-content";
import Anthropic from "@anthropic-ai/sdk";
import { translateProduct, translationReady, type ProductTexts, type TranslateMode } from "@/lib/translate";

type Result = { ok: true; id?: string; message?: string } | { ok: false; error: string };

const variant = z.object({
  id: z.string().max(40).optional(),
  name: z.string().trim().min(1).max(60),
  nameAr: z.string().trim().max(60).optional(),
  sku: z.string().trim().max(60).optional(),
  price: z.number().int().min(0).nullable(),
  stockQty: z.number().int().min(0).max(1_000_000),
  available: z.boolean(),
});

const offer = z.object({
  id: z.string().max(40).optional(),
  label: z.string().trim().min(2).max(80),
  labelAr: z.string().trim().max(80),
  quantity: z.number().int().min(1).max(50),
  price: z.number().int().min(1).max(100_000_000),
  freeDelivery: z.boolean(),
  /** YYYY-MM-DD, the last day the offer can be bought; empty = no end. */
  endsOn: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]),
  active: z.boolean(),
});

const product = z.object({
  name: z.string().trim().min(2).max(140),
  nameAr: z.string().trim().max(140),
  slug: z.string().trim().max(140),
  summary: z.string().trim().max(300),
  summaryAr: z.string().trim().max(300),
  description: z.string().max(8000),
  descriptionAr: z.string().max(8000),
  specs: z.string().max(4000),
  specsAr: z.string().max(4000),
  videoUrl: z.string().trim().max(500),
  keywords: z.string().max(1000),
  seoTitle: z.string().trim().max(120),
  seoTitleAr: z.string().trim().max(120),
  seoDescription: z.string().trim().max(320),
  seoDescriptionAr: z.string().trim().max(320),
  price: z.number().int().min(0).max(100_000_000),
  compareAt: z.number().int().min(0).nullable(),
  cost: z.number().int().min(0).nullable(),
  categoryId: z.string().max(40).nullable(),
  supplierId: z.string().max(40).nullable(),
  supplierRef: z.string().trim().max(120),
  supplierUrl: z.union([z.literal(""), z.url().max(500)]),
  stockMode: z.enum(["TRACKED", "SUPPLIER"]),
  stockQty: z.number().int().min(0).max(1_000_000),
  available: z.boolean(),
  active: z.boolean(),
  featured: z.boolean(),
  variants: z.array(variant).max(60),
  offers: z.array(offer).max(8),
});
export type ProductInput = z.infer<typeof product>;

function done() {
  updateTag(CATALOG_TAG);
  revalidatePath("/admin/produits");
}

export async function saveProduct(id: string | null, raw: ProductInput): Promise<Result> {
  await requireAdmin();
  const parsed = product.safeParse(raw);
  if (!parsed.success) return { ok: false, error: `Champ invalide : ${parsed.error.issues[0]?.path.join(".")}` };
  const d = parsed.data;
  if (d.compareAt != null && d.compareAt <= d.price) return { ok: false, error: "L'ancien prix doit être plus élevé que le prix actuel, sinon laissez-le vide." };
  // Offers are priced from the product price: an option with its own price would make them wrong.
  if (d.offers.length > 0 && d.variants.some((v) => v.price != null && v.price !== d.price)) {
    return { ok: false, error: "Les offres utilisent le prix du produit : retirez le prix propre des variantes, ou retirez les offres." };
  }
  if (d.videoUrl && !parseVideo(d.videoUrl)) return { ok: false, error: "Vidéo : collez un lien YouTube (youtube.com ou youtu.be) ou l'adresse https d'un fichier .mp4." };
  const slug = slugify(d.slug || d.name);
  if (!slug) return { ok: false, error: "Adresse (slug) invalide." };
  const clash = await prisma.product.findFirst({ where: { slug, ...(id ? { id: { not: id } } : {}) }, select: { id: true } });
  if (clash) return { ok: false, error: `L'adresse « ${slug} » est déjà utilisée par un autre produit.` };

  const data = {
    name: d.name, nameAr: d.nameAr || null, slug, summary: d.summary, summaryAr: d.summaryAr || null, description: d.description, descriptionAr: d.descriptionAr || null,
    specs: d.specs.trim(), specsAr: d.specsAr.trim() || null, videoUrl: d.videoUrl || null,
    keywords: d.keywords.trim(), seoTitle: d.seoTitle, seoTitleAr: d.seoTitleAr || null, seoDescription: d.seoDescription, seoDescriptionAr: d.seoDescriptionAr || null,
    price: d.price, compareAt: d.compareAt, cost: d.cost, categoryId: d.categoryId, supplierId: d.supplierId,
    supplierRef: d.supplierRef || null, supplierUrl: d.supplierUrl || null, stockMode: d.stockMode, stockQty: d.stockQty,
    available: d.available, active: d.active, featured: d.featured,
  };
  // A new address keeps the old one working: links already shared and Google's result are redirected.
  const before = id ? await prisma.product.findUnique({ where: { id }, select: { slug: true, oldSlugs: true } }) : null;
  const oldSlugs = before && before.slug !== slug ? [...new Set([before.slug, ...before.oldSlugs])].filter((x) => x !== slug).slice(0, 20) : (before?.oldSlugs.filter((x) => x !== slug) ?? []);
  if (oldSlugs.length) {
    const other = await prisma.product.findFirst({ where: { slug: { in: oldSlugs }, ...(id ? { id: { not: id } } : {}) }, select: { slug: true } });
    if (other) return { ok: false, error: `L'ancienne adresse « ${other.slug} » est déjà prise par un autre produit.` };
  }
  const saved = await prisma.$transaction(async (tx) => {
    // Another product that had this address before gives it up.
    await tx.$executeRaw`UPDATE "Product" SET "oldSlugs" = array_remove("oldSlugs", ${slug}) WHERE ${slug} = ANY("oldSlugs") AND id <> ${id ?? ""}`;
    const p = id ? await tx.product.update({ where: { id }, data: { ...data, oldSlugs } }) : await tx.product.create({ data });
    const keep = d.variants.filter((v) => v.id).map((v) => v.id!);
    await tx.productVariant.deleteMany({ where: { productId: p.id, id: { notIn: keep } } });
    for (const [i, v] of d.variants.entries()) {
      const vd = { name: v.name, nameAr: v.nameAr || null, sku: v.sku || null, price: v.price, stockQty: v.stockQty, available: v.available, sort: i };
      if (v.id) await tx.productVariant.updateMany({ where: { id: v.id, productId: p.id }, data: vd });
      else await tx.productVariant.create({ data: { ...vd, productId: p.id } });
    }
    // Offers: past orders keep their own copy of the label and price, so removing one is safe.
    const keepOffers = d.offers.filter((o) => o.id).map((o) => o.id!);
    await tx.productOffer.deleteMany({ where: { productId: p.id, id: { notIn: keepOffers } } });
    for (const [i, o] of d.offers.entries()) {
      // The end date is the last day, in Tunis: the offer stops at midnight after it.
      const endsAt = o.endsOn ? new Date(Date.parse(`${o.endsOn}T00:00:00Z`) + 23 * 3_600_000) : null;
      const od = { label: o.label, labelAr: o.labelAr || null, quantity: o.quantity, price: o.price, freeDelivery: o.freeDelivery, endsAt, active: o.active, sort: i };
      if (o.id) await tx.productOffer.updateMany({ where: { id: o.id, productId: p.id }, data: od });
      else await tx.productOffer.create({ data: { ...od, productId: p.id } });
    }
    return p;
  });
  done();
  return { ok: true, id: saved.id, message: "Produit enregistré." };
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
  const kind = kindOf(kindRaw);
  try {
    const m = await importImageFromUrl(url.trim());
    const last = await prisma.productImage.findFirst({ where: { productId, kind }, orderBy: { sort: "desc" }, select: { sort: true } });
    await prisma.productImage.create({ data: { productId, mediaId: m.id, sort: (last?.sort ?? -1) + 1, kind } });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Import impossible." };
  }
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
