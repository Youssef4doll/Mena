import "server-only";
import type { OrderStatus, Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { normalizePhone } from "./phone";

export const STATUS_TABS: (OrderStatus | "ALL")[] = ["PENDING", "CONFIRMED", "SUPPLIER_ORDERED", "SHIPPED", "DELIVERED", "REFUSED", "RETURNED", "CANCELLED", "ALL"];

export function orderWhere(status: string, q: string): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = {};
  if (status !== "ALL" && STATUS_TABS.includes(status as OrderStatus)) where.status = status as OrderStatus;
  const term = q.trim();
  if (term) {
    const phone = normalizePhone(term);
    where.OR = [
      { ref: { contains: term.toUpperCase() } },
      { name: { contains: term, mode: "insensitive" } },
      { city: { contains: term, mode: "insensitive" } },
      // The one-step form has the town typed in the address.
      { address: { contains: term, mode: "insensitive" } },
      ...(phone ? [{ phone }] : [{ phone: { contains: term.replace(/\D/g, "") || "—" } }]),
    ];
  }
  return where;
}

export async function statusCounts() {
  const rows = await prisma.order.groupBy({ by: ["status"], _count: { _all: true } });
  const map = Object.fromEntries(rows.map((r) => [r.status, r._count._all])) as Record<string, number>;
  map.ALL = rows.reduce((s, r) => s + r._count._all, 0);
  return map;
}
