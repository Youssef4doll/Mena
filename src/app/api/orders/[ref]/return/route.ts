import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { json, limit, readJson, sameOrigin } from "@/lib/http";
import { LIMITS } from "@/lib/rate-limit";
import { accessibleOrder } from "@/lib/order-access";
import { getSettings } from "@/lib/settings";

const body = z.object({ reason: z.string().trim().min(2).max(120), details: z.string().trim().max(600).optional() });

export async function POST(request: Request, ctx: RouteContext<"/api/orders/[ref]/return">) {
  if (!sameOrigin(request)) return json({ ok: false }, 403);
  const limited = limit(request, "review", LIMITS.review);
  if (limited) return limited;
  const { ref } = await ctx.params;
  const orderId = await accessibleOrder(ref);
  if (!orderId) return json({ ok: false }, 403);
  const parsed = body.safeParse(await readJson(request));
  if (!parsed.success) return json({ ok: false }, 400);
  const [o, settings] = await Promise.all([
    prisma.order.findUnique({ where: { id: orderId }, select: { status: true, deliveredAt: true, returns: { where: { status: { in: ["REQUESTED", "ACCEPTED", "RECEIVED"] } }, select: { id: true } } } }),
    getSettings(),
  ]);
  if (!o || o.status !== "DELIVERED" || !o.deliveredAt) return json({ ok: false }, 409);
  if (Date.now() - o.deliveredAt.getTime() > settings.returns.days * 86_400_000) return json({ ok: false, error: "too_late" }, 409);
  if (o.returns.length) return json({ ok: false, error: "open" }, 409);
  await prisma.returnRequest.create({ data: { orderId, reason: parsed.data.reason, details: parsed.data.details || null } });
  return json({ ok: true });
}
