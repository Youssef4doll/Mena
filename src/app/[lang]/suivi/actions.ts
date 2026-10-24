"use server";

import { forgetOrders } from "@/lib/order-access";

/** "Effacer mes infos de cet appareil": this browser no longer lists its orders (the orders themselves stay with the shop). */
export async function forgetThisDevice(): Promise<{ ok: true }> {
  await forgetOrders();
  return { ok: true };
}
