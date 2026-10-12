import { z } from "zod";
import { json, limit, readJson } from "@/lib/http";
import { LIMITS } from "@/lib/rate-limit";
import { publicQuote, quoteCart } from "@/lib/quote-server";
import { normalizePhone } from "@/lib/phone";

const body = z.object({
  lines: z.array(z.object({ productId: z.string().max(40), variantId: z.string().max(40).nullish(), offerId: z.string().max(40).nullish(), qty: z.number().int().min(1).max(10) })).max(30),
  governorate: z.string().max(40).nullish(),
  promoCode: z.string().max(40).nullish(),
  phone: z.string().max(30).nullish(),
});

/** Prices a basket for display. The same function prices the order itself. */
export async function POST(request: Request) {
  const limited = limit(request, "quote", LIMITS.quote);
  if (limited) return limited;
  const parsed = body.safeParse(await readJson(request));
  if (!parsed.success) return json({ ok: false }, 400);
  const q = await quoteCart({ ...parsed.data, phone: parsed.data.phone ? normalizePhone(parsed.data.phone) : null });
  return json(publicQuote(q));
}
