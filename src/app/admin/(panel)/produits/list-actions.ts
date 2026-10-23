"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { refreshCatalog } from "@/lib/catalog-refresh";
import { formatTND } from "@/lib/money";
import { PRODUCT_ID } from "@/lib/translate-batch";
import { MAX_BULK, bulkMessage } from "./list-params";

/**
 * The product list's own writes: one field of one product (quick edit) or one
 * change on many (bulk). Each is a single statement, and each re-renders the
 * list in its own response, so the page never asks again.
 */

type Result = { ok: true; message?: string } | { ok: false; error: string };

const id = z.string().regex(PRODUCT_ID);
const categoryId = z.string().min(1).max(40).nullable();

const quickPatch = z
  .object({
    /** Millimes: more than 0, at most 100 000 DT. */
    price: z.number().int().min(1).max(100_000_000),
    stockQty: z.number().int().min(0).max(1_000_000),
    available: z.boolean(),
    active: z.boolean(),
    featured: z.boolean(),
    categoryId,
  })
  .partial()
  .strict()
  .refine((p) => Object.keys(p).length > 0);
export type QuickPatch = z.infer<typeof quickPatch>;

/** A category the shop really has; null clears it. */
async function categoryOk(cid: string | null | undefined) {
  if (!cid) return true;
  return (await prisma.category.count({ where: { id: cid } })) > 0;
}

/**
 * One field changed from the list. The checks are the editor's for that
 * field; what needs the whole form (a price with offers, an old price now
 * too low, the stock of options) is sent to the product's page.
 */
export async function quickUpdate(productId: string, raw: QuickPatch): Promise<Result> {
  await requireAdmin();
  const pid = id.safeParse(productId);
  const parsed = quickPatch.safeParse(raw);
  if (!pid.success || !parsed.success) return { ok: false, error: "Valeur invalide." };
  const d = parsed.data;
  const [p, catOk] = await Promise.all([
    prisma.product.findUnique({ where: { id: pid.data }, select: { stockMode: true, compareAt: true, _count: { select: { offers: true, variants: true } } } }),
    categoryOk(d.categoryId),
  ]);
  if (!p) return { ok: false, error: "Produit introuvable : il a peut-être été supprimé." };
  if (d.price != null) {
    if (p._count.offers > 0) return { ok: false, error: "Ce produit a des offres : changez les prix dans la fiche." };
    if (p.compareAt != null && p.compareAt <= d.price) return { ok: false, error: `L'ancien prix (${formatTND(p.compareAt)}) doit rester plus élevé : changez-le dans la fiche.` };
  }
  if (d.stockQty != null && (p.stockMode !== "TRACKED" || p._count.variants > 0)) return { ok: false, error: "Le stock de ce produit se change dans la fiche." };
  if (d.available != null && p.stockMode !== "SUPPLIER") return { ok: false, error: "Ce produit compte son stock : changez la quantité." };
  if (!catOk) return { ok: false, error: "Catégorie introuvable : rechargez la page." };
  await prisma.product.update({ where: { id: pid.data }, data: d, select: { id: true } });
  await refreshCatalog([pid.data]);
  return { ok: true };
}

/** Checked before anything else: a value that is not a list is refused, not a crash. */
const ids = z.array(id).min(1).max(MAX_BULK).transform((a) => [...new Set(a)]);
const bulkPatch = z.union([
  z.object({ active: z.boolean() }).strict(),
  z.object({ featured: z.boolean() }).strict(),
  z.object({ available: z.boolean() }).strict(),
  z.object({ categoryId }).strict(),
]);
export type BulkPatchInput = z.infer<typeof bulkPatch>;

/** The products changed (or the addresses of those deleted): see refreshCatalog. */
async function done(productIds: string[], slugs: string[] = []) {
  await refreshCatalog(productIds, slugs);
  revalidatePath("/admin/produits");
}

/** One change on the products ticked in the list, in one statement. */
export async function bulkUpdate(rawIds: string[], raw: BulkPatchInput): Promise<Result> {
  await requireAdmin();
  const list = ids.safeParse(rawIds);
  const parsed = bulkPatch.safeParse(raw);
  if (!list.success) return { ok: false, error: `Sélection invalide (${MAX_BULK} produits au plus).` };
  if (!parsed.success) return { ok: false, error: "Changement invalide : rechargez la page." };
  const patch = parsed.data;
  const where = { id: { in: list.data } };

  if ("categoryId" in patch && patch.categoryId) {
    const cat = await prisma.category.findUnique({ where: { id: patch.categoryId }, select: { name: true } });
    if (!cat) return { ok: false, error: "Catégorie introuvable : rechargez la page." };
    const r = await prisma.product.updateMany({ where, data: patch });
    await done(list.data);
    return { ok: true, message: bulkMessage(patch, r.count, { categoryName: cat.name }) };
  }
  if ("available" in patch) {
    // Availability is the supplier's word; a product whose stock is counted sells what is counted.
    const [r, skipped] = await prisma.$transaction([
      prisma.product.updateMany({ where: { ...where, stockMode: "SUPPLIER" }, data: patch }),
      prisma.product.count({ where: { ...where, stockMode: "TRACKED" } }),
    ]);
    await done(list.data);
    return { ok: true, message: bulkMessage(patch, r.count, { skipped }) };
  }
  const r = await prisma.product.updateMany({ where, data: patch });
  await done(list.data);
  return { ok: true, message: bulkMessage(patch, r.count) };
}

/** Deleting keeps past orders intact (their lines are snapshots); pictures no other product uses go too. */
export async function bulkDelete(rawIds: string[]): Promise<Result> {
  await requireAdmin();
  const list = ids.safeParse(rawIds);
  if (!list.success) return { ok: false, error: `Sélection invalide (${MAX_BULK} produits au plus).` };
  const [imgs, gone] = await Promise.all([
    prisma.productImage.findMany({ where: { productId: { in: list.data } }, select: { mediaId: true } }),
    prisma.product.findMany({ where: { id: { in: list.data } }, select: { slug: true, oldSlugs: true } }),
  ]);
  const r = await prisma.product.deleteMany({ where: { id: { in: list.data } } });
  await prisma.media.deleteMany({ where: { id: { in: [...new Set(imgs.map((i) => i.mediaId))] }, images: { none: {} } } });
  await done([], gone.flatMap((p) => [p.slug, ...p.oldSlugs]));
  return { ok: true, message: bulkMessage("delete", r.count) };
}
