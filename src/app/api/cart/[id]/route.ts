import { prisma } from "@/lib/prisma";
import { json } from "@/lib/http";
import { loadCatalog } from "@/lib/catalog";

/**
 * The lines of a cart, for the link sent in a reminder (/panier/<id>). Ids
 * and product names only — nothing about who the cart belongs to.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/cart/[id]">) {
  const { id } = await ctx.params;
  if (!/^[a-z0-9]{20,40}$/.test(id)) return json({ lines: [] }, 404);
  const cart = await prisma.cart.findUnique({ where: { id }, select: { lines: true, status: true } });
  if (!cart || cart.status !== "ACTIVE") return json({ lines: [] }, 404);
  const lines = (Array.isArray(cart.lines) ? cart.lines : []) as { productId: string; variantId: string | null; qty: number }[];
  const catalog = await loadCatalog(lines.map((l) => l.productId));
  return json({
    lines: lines.flatMap((l) => {
      const p = catalog.get(l.productId);
      if (!p || !p.active) return [];
      const v = p.variants.find((x) => x.id === l.variantId);
      return [{ productId: p.id, variantId: v?.id ?? null, qty: l.qty, name: p.name, variantName: v?.name ?? null, imageId: p.imageId, slug: p.slug }];
    }),
  });
}
