"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { CallOutcome, OrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { changeStatus } from "@/lib/orders";
import { normalizePhone } from "@/lib/phone";

type Result = { ok: true; message?: string } | { ok: false; error: string };

const ERRORS: Record<string, string> = {
  not_found: "Commande introuvable.",
  not_allowed: "Ce changement de statut n'est pas possible depuis le statut actuel.",
  conflict: "La commande a été modifiée entre-temps. Rechargez la page.",
};

export async function logCall(orderId: string, outcome: CallOutcome, note: string): Promise<Result> {
  const admin = await requireAdmin();
  await prisma.$transaction([
    prisma.orderCall.create({ data: { orderId, outcome, note: note.slice(0, 300) || null, by: admin.email } }),
    prisma.order.update({ where: { id: orderId }, data: { confirmAttempts: { increment: 1 } } }),
  ]);
  if (outcome === "CONFIRMED") {
    const r = await changeStatus(orderId, "CONFIRMED", admin.email, { note: note || "Confirmée par téléphone" });
    if (!r.ok) return { ok: false, error: ERRORS[r.error] ?? r.error };
  }
  if (outcome === "CANCELLED_BY_CUSTOMER") {
    const r = await changeStatus(orderId, "CANCELLED", admin.email, { note: note || "Annulée par le client au téléphone" });
    if (!r.ok) return { ok: false, error: ERRORS[r.error] ?? r.error };
  }
  revalidatePath(`/admin/commandes/${orderId}`);
  return { ok: true };
}

export async function setStatus(orderId: string, to: OrderStatus, form: { note?: string; carrier?: string; trackingNumber?: string; refusalReason?: string }): Promise<Result> {
  const admin = await requireAdmin();
  const r = await changeStatus(orderId, to, admin.email, {
    note: form.note?.slice(0, 300),
    carrier: form.carrier?.slice(0, 60),
    trackingNumber: form.trackingNumber?.slice(0, 80),
    refusalReason: form.refusalReason?.slice(0, 200),
  });
  revalidatePath(`/admin/commandes/${orderId}`);
  return r.ok ? { ok: true } : { ok: false, error: ERRORS[r.error] ?? r.error };
}

const details = z.object({
  name: z.string().trim().min(2).max(80),
  phoneAlt: z.string().trim().max(30),
  city: z.string().trim().min(2).max(80),
  address: z.string().trim().min(4).max(200),
  note: z.string().trim().max(300),
  carrier: z.string().trim().max(60),
  trackingNumber: z.string().trim().max(80),
});

/** What a confirmation call corrects: the address, a second number. Prices and the governorate stay as ordered. */
export async function updateDetails(orderId: string, raw: z.input<typeof details>): Promise<Result> {
  await requireAdmin();
  const d = details.safeParse(raw);
  if (!d.success) return { ok: false, error: "Champs invalides." };
  const phoneAlt = d.data.phoneAlt ? normalizePhone(d.data.phoneAlt) : null;
  if (d.data.phoneAlt && !phoneAlt) return { ok: false, error: "Second numéro invalide." };
  await prisma.order.update({
    where: { id: orderId },
    data: { name: d.data.name, phoneAlt, city: d.data.city, address: d.data.address, note: d.data.note || null, carrier: d.data.carrier || null, trackingNumber: d.data.trackingNumber || null },
  });
  revalidatePath(`/admin/commandes/${orderId}`);
  return { ok: true, message: "Enregistré." };
}

export async function setBlacklist(customerId: string, on: boolean, reason: string): Promise<Result> {
  await requireAdmin();
  await prisma.customer.update({ where: { id: customerId }, data: { blacklisted: on, blacklistReason: on ? reason.slice(0, 200) || null : null } });
  revalidatePath("/admin/commandes");
  revalidatePath("/admin/clients");
  return { ok: true };
}
