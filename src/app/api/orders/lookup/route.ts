import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { json, limit, readJson, sameOrigin } from "@/lib/http";
import { LIMITS } from "@/lib/rate-limit";
import { normalizePhone } from "@/lib/phone";
import { rememberOrder } from "@/lib/order-access";
import { accessTokenFromSalt } from "@/lib/tokens";

const body = z.object({ ref: z.string().max(20), phone: z.string().max(30) });

/** Order reference AND the full phone number, both, or nothing. Rate-limited per address. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ ok: false }, 403);
  const limited = limit(request, "lookup", LIMITS.lookup);
  if (limited) return limited;
  const parsed = body.safeParse(await readJson(request));
  if (!parsed.success) return json({ ok: false }, 400);
  const phone = normalizePhone(parsed.data.phone);
  const ref = parsed.data.ref.trim().toUpperCase().replace(/^MN(?!-)/, "MN-");
  if (!phone) return json({ ok: false }, 404);
  const o = await prisma.order.findFirst({ where: { ref, phone }, select: { ref: true, accessSalt: true } });
  if (!o) return json({ ok: false }, 404);
  await rememberOrder(accessTokenFromSalt(o.accessSalt));
  return json({ ok: true, ref: o.ref });
}
