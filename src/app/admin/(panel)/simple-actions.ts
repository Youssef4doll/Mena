"use server";

import { z } from "zod";
import { revalidatePath, updateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { CATALOG_TAG } from "@/lib/catalog";
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
  const clash = await prisma.category.findFirst({ where: { slug, ...(id ? { id: { not: id } } : {}) } });
  if (clash) return { ok: false, error: "Adresse déjà utilisée." };
  const data = {
    name,
    nameAr: str(f, "nameAr") || null,
    headline: str(f, "headline").slice(0, 60) || null,
    headlineAr: str(f, "headlineAr").slice(0, 60) || null,
    slug,
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
  await prisma.review.update({ where: { id }, data: { status } });
  updateTag(CATALOG_TAG);
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
