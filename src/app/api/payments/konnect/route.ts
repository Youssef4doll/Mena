import { syncKonnectPayment } from "@/lib/konnect";

/** Konnect's webhook (GET ?payment_ref=…). The ref is only a hint: the status is read back from Konnect. */
export async function GET(request: Request) {
  const ref = new URL(request.url).searchParams.get("payment_ref");
  if (ref && /^[A-Za-z0-9_-]{6,80}$/.test(ref)) await syncKonnectPayment(ref).catch((e) => console.error("[konnect]", e));
  return new Response("ok");
}
