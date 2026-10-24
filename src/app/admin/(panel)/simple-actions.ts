"use server";

import { z } from "zod";
import { revalidatePath, updateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { CATALOG_TAG } from "@/lib/catalog";
import { refreshCatalog } from "@/lib/catalog-refresh";
import { slugify } from "@/lib/slug";
import { normalizeCode } from "@/lib/promo";
import { parseTND } from "@/lib/money";
import { storeImage } from "@/lib/media";

type Result = { ok: true; message?: string } | { ok: false; error: string };
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

// ---------------------------------------------------------------- categories

export async function saveCategory(_: unknown, f: FormData): Promise<Result> {
  await requireAdmin();
  const id = str(f, "id");
  const name = str(f, "name");
  if (name.length < 2) return { ok: false, error: "Nom trop court." };
  const slug = slugify(str(f, "slug") || name);
  if (!slug) return { ok: false, error: "Adresse invalide." };
  const [clash, before] = await Promise.all([
    prisma.category.findFirst({ where: { OR: [{ slug }, { oldSlugs: { has: slug } }], ...(id ? { id: { not: id } } : {}) }, select: { id: true } }),
    id ? prisma.category.findUnique({ where: { id }, select: { slug: true, oldSlugs: true } }) : null,
  ]);
  if (clash) return { ok: false, error: "Adresse déjà utilisée (ou déjà utilisée avant par une autre catégorie)." };
  // A new address keeps the old one as a permanent redirect: links and Google results still arrive.
  const oldSlugs = before && before.slug !== slug ? [...new Set([...before.oldSlugs, before.slug])].filter((s) => s !== slug) : before?.oldSlugs.filter((s) => s !== slug);
  const data = {
    name,
    nameAr: str(f, "nameAr") || null,
    headline: str(f, "headline").slice(0, 60) || null,
    headlineAr: str(f, "headlineAr").slice(0, 60) || null,
    slug,
    ...(oldSlugs ? { oldSlugs } : {}),
    sort: Number(str(f, "sort")) || 0,
    active: f.get("active") === "on",
  };
  const file = f.get("image");
  let imageId: string | undefined;
  if (file instanceof File && file.size > 0) {
    try {
      imageId = (await storeImage(Buffer.from(await file.arrayBuffer()), file.type)).id;
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Image refusée." };
    }
  }
  if (id) await prisma.category.update({ where: { id }, data: { ...data, ...(imageId ? { imageId } : {}) } });
  else await prisma.category.create({ data: { ...data, imageId } });
  updateTag(CATALOG_TAG);
  revalidatePath("/admin/categories");
  return { ok: true, message: "Enregistré." };
}

export async function deleteCategory(id: string): Promise<Result> {
  await requireAdmin();
  await prisma.category.delete({ where: { id } });
  updateTag(CATALOG_TAG);
  revalidatePath("/admin/categories");
  return { ok: true };
}

// ----------------------------------------------------------------- suppliers

export async function saveSupplier(_: unknown, f: FormData): Promise<Result> {
  await requireAdmin();
  const id = str(f, "id");
  const name = str(f, "name");
  if (name.length < 2) return { ok: false, error: "Nom trop court." };
  const data = { name, phone: str(f, "phone") || null, contact: str(f, "contact") || null, notes: str(f, "notes") || null, prepDays: Math.max(0, Math.min(30, Number(str(f, "prepDays")) || 1)) };
  if (id) await prisma.supplier.update({ where: { id }, data });
  else await prisma.supplier.create({ data });
  revalidatePath("/admin/fournisseurs");
  return { ok: true, message: "Enregistré." };
}

export async function deleteSupplier(id: string): Promise<Result> {
  await requireAdmin();
  await prisma.supplier.delete({ where: { id } });
  revalidatePath("/admin/fournisseurs");
  return { ok: true };
}

// --------------------------------------------------------------------- promo

const promoSchema = z.object({
  code: z.string().min(3).max(30).regex(/^[A-Z0-9_-]+$/),
  kind: z.enum(["PERCENT", "FIXED", "FREE_DELIVERY"]),
});

export async function savePromo(_: unknown, f: FormData): Promise<Result> {
  await requireAdmin();
  const id = str(f, "id");
  const parsed = promoSchema.safeParse({ code: normalizeCode(str(f, "code")), kind: str(f, "kind") });
  if (!parsed.success) return { ok: false, error: "Code : 3 à 30 lettres, chiffres, - ou _." };
  const { code, kind } = parsed.data;
  let value = 0;
  if (kind === "PERCENT") {
    value = Number(str(f, "value"));
    if (!Number.isInteger(value) || value < 1 || value > 90) return { ok: false, error: "Pourcentage entre 1 et 90." };
  } else if (kind === "FIXED") {
    const v = parseTND(str(f, "value"));
    if (v == null || v <= 0) return { ok: false, error: "Montant invalide." };
    value = v;
  }
  const min = str(f, "minSubtotal") ? parseTND(str(f, "minSubtotal")) : 0;
  if (min == null) return { ok: false, error: "Montant minimum invalide." };
  const maxUses = str(f, "maxUses") ? Math.max(1, Number(str(f, "maxUses")) || 1) : null;
  const date = (k: string) => (str(f, k) ? new Date(`${str(f, k)}T00:00:00+01:00`) : null);
  const data = { code, kind, value, minSubtotal: min, maxUses, oncePerPhone: f.get("oncePerPhone") === "on", startsAt: date("startsAt"), endsAt: date("endsAt"), active: f.get("active") === "on" };
  const clash = await prisma.promoCode.findFirst({ where: { code, ...(id ? { id: { not: id } } : {}) } });
  if (clash) return { ok: false, error: "Ce code existe déjà." };
  if (id) await prisma.promoCode.update({ where: { id }, data });
  else await prisma.promoCode.create({ data });
  revalidatePath("/admin/codes-promo");
  return { ok: true, message: "Enregistré." };
}

export async function togglePromo(id: string, active: boolean): Promise<Result> {
  await requireAdmin();
  await prisma.promoCode.update({ where: { id }, data: { active } });
  revalidatePath("/admin/codes-promo");
  return { ok: true };
}

// ------------------------------------------------------------------- reviews

export async function moderateReview(id: string, status: "APPROVED" | "REJECTED"): Promise<Result> {
  await requireAdmin();
  const r = await prisma.review.update({ where: { id }, data: { status }, select: { productId: true } });
  await refreshCatalog([r.productId]);
  revalidatePath("/admin/avis");
  return { ok: true };
}

// ------------------------------------------------------------------- returns

export async function updateReturn(_: unknown, f: FormData): Promise<Result> {
  const admin = await requireAdmin();
  const id = str(f, "id");
  const status = str(f, "status") as "REQUESTED" | "ACCEPTED" | "REJECTED" | "RECEIVED" | "REFUNDED";
  if (!["REQUESTED", "ACCEPTED", "REJECTED", "RECEIVED", "REFUNDED"].includes(status)) return { ok: false, error: "Statut invalide." };
  const refund = str(f, "refundAmount") ? parseTND(str(f, "refundAmount")) : null;
  if (str(f, "refundAmount") && refund == null) return { ok: false, error: "Montant invalide." };
  const r = await prisma.returnRequest.update({ where: { id }, data: { status, adminNote: str(f, "adminNote") || null, refundAmount: refund } });
  // A received return closes the order as returned (stock goes back if counted).
  if (status === "RECEIVED" || status === "REFUNDED") {
    const o = await prisma.order.findUnique({ where: { id: r.orderId }, select: { status: true } });
    if (o?.status === "DELIVERED") {
      const { changeStatus } = await import("@/lib/orders");
      await changeStatus(r.orderId, "RETURNED", admin.email, { note: "Retour reçu" });
    }
  }
  revalidatePath("/admin/retours");
  return { ok: true, message: "Enregistré." };
}

// ---------------------------------------------------------------- ad spend

const spendSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  source: z.string().trim().toLowerCase().min(2).max(40),
  campaign: z.string().trim().max(120),
  adSet: z.string().trim().max(120),
  ad: z.string().trim().max(120),
  note: z.string().trim().max(200),
});

/** What the platform counted, typed as it shows ("12 345"): empty is "not given", not zero. */
const SPEND_COUNTS = { impressions: "Impressions", clicks: "Clics sur un lien", reach: "Couverture", purchases: "Achats" } as const;
function readCount(raw: string): number | null | undefined {
  const v = raw.replace(/[\s.,]/g, "");
  if (v === "") return null;
  if (!/^\d{1,10}$/.test(v) || Number(v) > 2_000_000_000) return undefined;
  return Number(v);
}

/**
 * A total from the ads manager, for one day or a period (both days included),
 * with what the platform counted when the owner copies it too: impressions,
 * link clicks, reach and the pixel's purchases feed the ads page's CPM, CTR
 * and the check of the pixel against the real orders.
 */
export async function saveAdSpend(_: unknown, f: FormData): Promise<Result> {
  await requireAdmin();
  const parsed = spendSchema.safeParse({ from: str(f, "from"), to: str(f, "to") || str(f, "from"), source: str(f, "source"), campaign: str(f, "campaign"), adSet: str(f, "adSet"), ad: str(f, "ad"), note: str(f, "note") });
  if (!parsed.success) return { ok: false, error: "Vérifiez les dates et la source." };
  const amount = parseTND(str(f, "amount"));
  if (amount == null || amount <= 0) return { ok: false, error: "Montant invalide (en DT, par ex. 120,500)." };
  const counts: Partial<Record<keyof typeof SPEND_COUNTS, number | null>> = {};
  for (const [k, name] of Object.entries(SPEND_COUNTS) as [keyof typeof SPEND_COUNTS, string][]) {
    const v = readCount(str(f, k));
    if (v === undefined) return { ok: false, error: `${name} : un nombre entier, par ex. 12 345.` };
    counts[k] = v;
  }
  const { from, to, source, campaign, adSet, ad, note } = parsed.data;
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
  if (days < 1 || days > 92) return { ok: false, error: "La période va du premier au dernier jour, 92 jours au plus." };
  await prisma.adSpend.create({ data: { day: new Date(`${from}T00:00:00Z`), days, source, campaign: campaign || null, adSet: adSet || null, ad: ad || null, note: note || null, amount, ...counts } });
  revalidatePath("/admin/depenses");
  revalidatePath("/admin/analytics");
  revalidatePath("/admin/publicites", "layout");
  return { ok: true, message: "Dépense enregistrée." };
}

/** Deleting a row already gone (a second tap, another tab) is done, not an error. */
export async function deleteAdSpend(id: string): Promise<Result> {
  await requireAdmin();
  const parsed = z.string().regex(/^[a-z0-9]{20,40}$/).safeParse(id);
  if (!parsed.success) return { ok: false, error: "Dépense introuvable." };
  await prisma.adSpend.deleteMany({ where: { id: parsed.data } });
  revalidatePath("/admin/depenses");
  revalidatePath("/admin/analytics");
  revalidatePath("/admin/publicites", "layout");
  return { ok: true };
}
