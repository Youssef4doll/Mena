import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { href, isLang } from "@/i18n";

/**
 * The link sent with a reminder: back to the product page, on the offer the
 * customer had chosen. Nothing about who the form belonged to is used.
 */
export default async function RestoreRoute({ params }: PageProps<"/[lang]/panier/[id]">) {
  const { lang, id } = await params;
  if (!isLang(lang)) notFound();
  if (!/^[a-z0-9]{20,40}$/.test(id)) redirect(href(lang, "/"));
  const cart = await prisma.cart.findUnique({ where: { id }, select: { lines: true } });
  const first = (Array.isArray(cart?.lines) ? cart.lines : [])[0] as { productId?: string; offerId?: string | null } | undefined;
  const product = first?.productId ? await prisma.product.findFirst({ where: { id: first.productId, active: true }, select: { slug: true } }) : null;
  if (!product) redirect(href(lang, "/"));
  redirect(href(lang, `/produit/${product.slug}${first?.offerId ? `?offre=${encodeURIComponent(first.offerId)}` : ""}#commander`));
}
