"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { CallOutcome, OrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { changeStatus, placeOrder } from "@/lib/orders";
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
  revalidatePath("/admin/commandes");
  return r.ok ? { ok: true } : { ok: false, error: ERRORS[r.error] ?? r.error };
}

const details = z.object({
  name: z.string().trim().min(2).max(80),
  phoneAlt: z.string().trim().max(30),
  // Often empty: the one-step form has the town typed in the address.
  city: z.string().trim().max(80),
  address: z.string().trim().min(4).max(300),
  note: z.string().trim().max(300),
  carrier: z.string().trim().max(60),
  trackingNumber: z.string().trim().max(80),
});

const FIELD_LABELS: Record<keyof z.infer<typeof details>, string> = {
  name: "Nom",
  phoneAlt: "Second numéro",
  city: "Ville",
  address: "Adresse",
  note: "Note",
  carrier: "Transporteur",
  trackingNumber: "N° de suivi",
};

/** "Adresse : 4 caractères minimum." — which field, and why. */
function invalidFields(error: z.ZodError) {
  return error.issues
    .map((i) => {
      const field = FIELD_LABELS[i.path[0] as keyof typeof FIELD_LABELS] ?? String(i.path[0] ?? "Formulaire");
      const why = i.code === "too_small" ? `${i.minimum} caractères minimum` : i.code === "too_big" ? `${i.maximum} caractères maximum` : "valeur invalide";
      return `${field} : ${why}.`;
    })
    .join(" ");
}

/** What a confirmation call corrects: the address, a second number. Prices and the governorate stay as ordered. */
export async function updateDetails(orderId: string, raw: z.input<typeof details>): Promise<Result> {
  await requireAdmin();
  const d = details.safeParse(raw);
  if (!d.success) return { ok: false, error: invalidFields(d.error) };
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

// ------------------------------------------------------------ typed by the shop

const adminOrder = z.object({
  productId: z.string().min(1).max(40),
  variantId: z.string().max(40).optional(),
  offerId: z.string().max(40).optional(),
  qty: z.number().int().min(1).max(10),
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().max(30),
  governorate: z.string().max(40),
  address: z.string().trim().min(4).max(300),
  note: z.string().trim().max(300),
  channel: z.enum(["whatsapp", "phone", "messenger", "facebook", "instagram", "autre"]),
  locale: z.enum(["ar", "fr"]),
  expectedTotal: z.number().int().min(0),
  confirmed: z.boolean(),
});

/**
 * An order taken on WhatsApp or by phone, typed by the shop: the same prices,
 * stock and checks as the site, counted with its channel as the source, so
 * the delivered orders by source stay true.
 */
export async function createAdminOrder(input: z.input<typeof adminOrder>): Promise<{ ok: true; id: string } | { ok: false; error: string; total?: number }> {
  const admin = await requireAdmin();
  const parsed = adminOrder.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Vérifiez le nom, le téléphone et l'adresse." };
  const d = parsed.data;
  const r = await placeOrder(
    {
      lines: [{ productId: d.productId, variantId: d.variantId || null, offerId: d.offerId || null, qty: d.offerId ? 1 : d.qty }],
      phone: d.phone,
      name: d.name,
      governorate: d.governorate,
      address: d.address,
      note: d.note || undefined,
      payment: "COD",
      expectedTotal: d.expectedTotal,
      locale: d.locale,
      origin: "admin",
      attribution: { source: d.channel, medium: d.channel === "phone" ? "call" : "chat" },
    },
    { ua: null, ip: "", ipHash: "", device: "admin" },
  );
  if (!r.ok) {
    if (r.error === "invalid") return { ok: false, error: r.fields.includes("phone") ? "Numéro tunisien invalide." : "Vérifiez les champs." };
    if ("quote" in r) return { ok: false, error: r.error === "price_changed" ? "Le total a changé : vérifiez-le et recommencez." : "Ce choix n'est plus disponible (stock ou offre).", total: r.quote.total };
    return { ok: false, error: "La commande n'a pas pu être enregistrée." };
  }
  const order = await prisma.order.findUnique({ where: { ref: r.ref }, select: { id: true } });
  if (!order) return { ok: false, error: "Commande introuvable après création." };
  await prisma.orderEvent.create({ data: { orderId: order.id, from: "PENDING", to: "PENDING", by: admin.email, note: `Saisie dans le back-office (${d.channel})` } });
  if (d.confirmed) await changeStatus(order.id, "CONFIRMED", admin.email, { note: "Confirmée avec le client à la prise de commande" });
  revalidatePath("/admin/commandes");
  return { ok: true, id: order.id };
}
