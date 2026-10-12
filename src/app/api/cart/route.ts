import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { json, limit, readJson, sameOrigin } from "@/lib/http";
import { LIMITS } from "@/lib/rate-limit";
import { hashToken } from "@/lib/tokens";
import { normalizePhone } from "@/lib/phone";
import { isGovernorate } from "@/lib/governorates";
import { isBot } from "@/lib/device";

const body = z.object({
  token: z.string().regex(/^[A-Za-z0-9-]{8,64}$/),
  lines: z.array(z.object({ productId: z.string().max(40), variantId: z.string().max(40).nullish(), qty: z.number().int().min(1).max(10) })).max(30),
  phone: z.string().max(30).optional(),
  name: z.string().max(80).optional(),
  governorate: z.string().max(40).optional(),
  visitorId: z.string().max(64).optional(),
  source: z.string().max(60).optional(),
  campaign: z.string().max(120).nullish(),
});

/**
 * The server's copy of a basket, for the abandoned-cart list. Ids and
 * quantities only; prices are read from the catalog when the list is drawn.
 * A converted cart is never reopened by a late write from the browser.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request) || isBot(request.headers.get("user-agent"))) return json({ ok: false }, 403);
  const limited = limit(request, "cart", LIMITS.cart);
  if (limited) return limited;
  const parsed = body.safeParse(await readJson(request));
  if (!parsed.success) return json({ ok: false }, 400);
  const d = parsed.data;
  const tokenHash = hashToken(d.token);
  const phone = d.phone ? normalizePhone(d.phone) : null;
  const lines = d.lines.map((l) => ({ productId: l.productId, variantId: l.variantId ?? null, qty: l.qty }));
  const existing = await prisma.cart.findUnique({ where: { tokenHash }, select: { status: true } });
  if (existing?.status === "CONVERTED") return json({ ok: true });
  await prisma.cart.upsert({
    where: { tokenHash },
    create: { tokenHash, lines, phone, name: d.name || null, governorate: d.governorate && isGovernorate(d.governorate) ? d.governorate : null, visitorId: d.visitorId, source: d.source, campaign: d.campaign ?? null },
    update: {
      lines,
      ...(phone ? { phone } : {}),
      ...(d.name ? { name: d.name } : {}),
      ...(d.governorate && isGovernorate(d.governorate) ? { governorate: d.governorate } : {}),
    },
  });
  return json({ ok: true });
}
