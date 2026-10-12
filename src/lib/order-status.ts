import type { OrderStatus } from "@prisma/client";

/** Shared by the back office and the server rules (no server-only imports here). */
export const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: "À confirmer",
  CONFIRMED: "Confirmée",
  SUPPLIER_ORDERED: "Commandée fournisseur",
  SHIPPED: "Expédiée",
  DELIVERED: "Livrée",
  REFUSED: "Refusée à la livraison",
  RETURNED: "Retournée",
  CANCELLED: "Annulée",
};

export const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["SUPPLIER_ORDERED", "SHIPPED", "CANCELLED"],
  SUPPLIER_ORDERED: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED", "REFUSED"],
  DELIVERED: ["RETURNED"],
  REFUSED: [],
  RETURNED: [],
  CANCELLED: [],
};

export const FLAG_LABELS: Record<string, string> = {
  blacklisted: "Liste noire",
  serial_refuser: "Refus répétés",
  past_refusals: "Refus passés",
  past_delivered: "Déjà livré",
  duplicate: "Doublon possible",
  too_many_today: "Trop de commandes aujourd'hui",
  landline: "Ligne fixe",
};

export function flagLabel(flag: string): { label: string; tone: "danger" | "warn" | "ok" | "neutral" } {
  const [k, n] = flag.split(":");
  const base = FLAG_LABELS[k] ?? k;
  const label = n ? `${base} : ${n}` : base;
  if (k === "blacklisted" || k === "serial_refuser") return { label, tone: "danger" };
  if (k === "duplicate" || k === "too_many_today" || k === "past_refusals") return { label, tone: "warn" };
  if (k === "past_delivered") return { label, tone: "ok" };
  return { label, tone: "neutral" };
}
