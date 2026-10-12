import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { json, limit, readJson, sameOrigin } from "@/lib/http";
import { LIMITS } from "@/lib/rate-limit";
import { accessibleOrder } from "@/lib/order-access";

const body = z.object({ itemId: z.string().max(40), rating: z.number().int().min(1).max(5), text: z.string().trim().max(800).optional(), authorName: z.string().trim().min(1).max(40) });

/**
 * A review needs: this browser's access to the order, a delivered order, a
 * line of that order, and no review on that line yet. Then it waits for
 * moderation. That is what makes "Client livré" true on every review shown.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/orders/[ref]/review">) {
  if (!sameOrigin(request)) return json({ ok: false }, 403);
  const limited = limit(request, "review", LIMITS.review);
  if (limited) return limited;
  const { ref } = await ctx.params;
  const orderId = await accessibleOrder(ref);
  if (!orderId) return json({ ok: false }, 403);
  const parsed = body.safeParse(await readJson(request));
  if (!parsed.success) return json({ ok: false }, 400);
  const item = await prisma.orderItem.findFirst({
    where: { id: parsed.data.itemId, orderId, order: { status: "DELIVERED" }, productId: { not: null } },
    select: { id: true, productId: true, review: { select: { id: true } }, order: { select: { governorate: true } } },
  });
  if (!item || item.review) return json({ ok: false }, 409);
  await prisma.review.create({
    data: {
      productId: item.productId!,
      orderItemId: item.id,
      rating: parsed.data.rating,
      text: parsed.data.text || null,
      authorName: parsed.data.authorName,
      governorate: item.order.governorate,
    },
  });
  return json({ ok: true });
}
