import { json, clientContext, limit, readJson, sameOrigin } from "@/lib/http";
import { LIMITS } from "@/lib/rate-limit";
import { placeOrder, placeOrderSchema } from "@/lib/orders";
import { rememberOrder } from "@/lib/order-access";
import { deviceFromUA } from "@/lib/device";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ ok: false, error: "server" }, 403);
  const limited = limit(request, "order", LIMITS.order);
  if (limited) return limited;
  const raw = await readJson(request, 32_768);
  const parsed = placeOrderSchema.safeParse(raw);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((i) => String(i.path[0] ?? "")))].filter(Boolean);
    return json({ ok: false, error: "invalid", fields }, 400);
  }
  // A filled honeypot gets a plausible refusal and nothing is written.
  if (parsed.data.website) return json({ ok: false, error: "server" }, 400);
  const ctx = clientContext(request);
  const result = await placeOrder(parsed.data, { ...ctx, device: deviceFromUA(ctx.ua) });
  if (result.ok) {
    await rememberOrder(result.token);
    return json({ ok: true, ref: result.ref, payUrl: result.payUrl });
  }
  return json(result, result.error === "server" ? 500 : 409);
}
