import { prisma } from "@/lib/prisma";
import { json, limit } from "@/lib/http";
import { LIMITS } from "@/lib/rate-limit";
import { loadCatalog } from "@/lib/catalog";

/**
 * The lines of an unfinished order, for the link sent in a reminder
 * (/panier/<id>): product ids, options, offers and names, to put them back in
 * the basket. Nothing about who the form belonged to (no name, no phone), and
 * no price: the basket asks the server for those like any other.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/cart/[id]">) {
  const limited = limit(request, "cart", LIMITS.cart);
  if (limited) return limited;
  const { id } = await ctx.params;
  if (!/^[a-z0-9]{20,40}$/.test(id)) return json({ items: [] }, 404);
  const cart = await prisma.cart.findUnique({ where: { id }, select: { lines: true, status: true } });
  if (!cart || cart.status !== "ACTIVE") return json({ items: [] }, 404);
  const lines = (Array.isArray(cart.lines) ? cart.lines : []) as { productId?: string; variantId?: string | null; offerId?: string | null; qty?: number }[];
  const catalog = await loadCatalog(lines.map((l) => l.productId ?? "").filter(Boolean));
  const now = new Date();
  return json({
    items: lines.slice(0, 30).flatMap((l) => {
      const p = l.productId ? catalog.get(l.productId) : undefined;
      if (!p || !p.active) return [];
      const v = p.variants.find((x) => x.id === l.variantId) ?? null;
      const o = (p.offers ?? []).find((x) => x.id === l.offerId && x.active && (!x.endsAt || x.endsAt > now)) ?? null;
      const qty = typeof l.qty === "number" && Number.isInteger(l.qty) ? Math.min(10, Math.max(1, l.qty)) : 1;
      return [{ productId: p.id, variantId: v?.id ?? null, offerId: o?.id ?? null, qty: o ? 1 : qty, slug: p.slug, name: p.name, nameAr: p.nameAr, variantName: v?.name ?? null, variantNameAr: v?.nameAr ?? null, offerLabel: o?.label ?? null, offerLabelAr: o?.labelAr ?? null, imageId: p.imageId }];
    }),
  });
}
