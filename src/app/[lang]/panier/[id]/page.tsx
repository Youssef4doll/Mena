import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { href, isLang } from "@/i18n";

/**
 * The link sent with a reminder. One product: back to its page, on the offer,
 * option and quantity the customer had chosen. Several (a basket): back to
 * the basket, which puts them back. Nothing about who the form belonged to is
 * shown; the form id only lets the order close the reminder.
 */
export default async function RestoreRoute({ params }: PageProps<"/[lang]/panier/[id]">) {
  const { lang, id } = await params;
  if (!isLang(lang)) notFound();
  if (!/^[a-z0-9]{20,40}$/.test(id)) redirect(href(lang, "/"));
  const cart = await prisma.cart.findUnique({ where: { id }, select: { lines: true } });
  const all = Array.isArray(cart?.lines) ? cart.lines : [];
  if (all.length > 1) redirect(href(lang, `/panier?relance=${id}`));
  const first = all[0] as { productId?: string; variantId?: string | null; offerId?: string | null; qty?: number } | undefined;
  const product = first?.productId ? await prisma.product.findFirst({ where: { id: first.productId, active: true }, select: { slug: true } }) : null;
  if (!product) redirect(href(lang, "/"));
  // The product page checks each of these against what is on sale now.
  const q = new URLSearchParams({ relance: id });
  if (first?.offerId) q.set("offre", first.offerId);
  if (first?.variantId) q.set("option", first.variantId);
  const qty = first?.qty;
  if (!first?.offerId && typeof qty === "number" && Number.isInteger(qty) && qty > 1) q.set("qte", String(Math.min(10, qty)));
  redirect(href(lang, `/produit/${product.slug}?${q}#commander`));
}
