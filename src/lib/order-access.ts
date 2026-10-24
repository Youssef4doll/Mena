import "server-only";
import { cookies } from "next/headers";
import { prisma } from "./prisma";
import { hashToken } from "./tokens";

/**
 * How a customer proves an order is theirs: the secret in their tracking
 * link (sent by SMS, set as a cookie on the thank-you page), or the order
 * reference together with the full phone number. An e-mail address alone
 * proves nothing and is never accepted.
 *
 * The cookie holds the tokens of the last few orders from this browser; it
 * is httpOnly, so no script — pixels included — can read it.
 */
const COOKIE = "mena_orders";
const MAX = 5;

export async function rememberOrder(token: string) {
  const jar = await cookies();
  const current = (jar.get(COOKIE)?.value ?? "").split(".").filter(Boolean);
  const next = [token, ...current.filter((t) => t !== token)].slice(0, MAX);
  jar.set(COOKIE, next.join("."), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 120 });
}

/** This browser forgets its orders: the cookie goes, the orders stay with the shop. */
export async function forgetOrders() {
  (await cookies()).delete(COOKIE);
}

async function tokens(): Promise<string[]> {
  const jar = await cookies();
  return (jar.get(COOKIE)?.value ?? "").split(".").filter((t) => /^[A-Za-z0-9_-]{16,64}$/.test(t));
}

export async function orderIdFromToken(token: string) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const o = await prisma.order.findUnique({ where: { accessHash: hashToken(token) }, select: { id: true, ref: true } });
  return o;
}

/** The order if this browser holds its token. */
export async function accessibleOrder(ref: string) {
  const ts = await tokens();
  if (ts.length === 0) return null;
  const o = await prisma.order.findFirst({ where: { ref, accessHash: { in: ts.map(hashToken) } }, select: { id: true } });
  return o?.id ?? null;
}

export async function rememberedOrders() {
  const ts = await tokens();
  if (ts.length === 0) return [];
  return prisma.order.findMany({
    where: { accessHash: { in: ts.map(hashToken) } },
    orderBy: { createdAt: "desc" },
    select: { ref: true, status: true, total: true, createdAt: true },
  });
}
