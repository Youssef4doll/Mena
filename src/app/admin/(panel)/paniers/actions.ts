"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { sendSms } from "@/lib/notify";

export async function markReminded(cartId: string, viaSms: boolean, text: string) {
  await requireAdmin();
  const cart = await prisma.cart.update({ where: { id: cartId }, data: { remindedAt: new Date(), remindCount: { increment: 1 } } });
  if (viaSms && cart.phone) await sendSms({ to: cart.phone, text, kind: "cart_reminder" });
  revalidatePath("/admin/paniers");
  return { ok: true as const };
}
