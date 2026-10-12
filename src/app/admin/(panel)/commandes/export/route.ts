import { prisma } from "@/lib/prisma";
import { currentAdmin } from "@/lib/admin-auth";
import { orderWhere } from "@/lib/admin-orders";
import { csvResponse, dt, toCsv } from "@/lib/csv";
import { STATUS_LABELS } from "@/lib/order-status";

export async function GET(request: Request) {
  if (!(await currentAdmin())) return new Response("Unauthorized", { status: 401 });
  const sp = new URL(request.url).searchParams;
  const orders = await prisma.order.findMany({
    where: orderWhere(sp.get("statut") ?? "ALL", sp.get("q") ?? ""),
    orderBy: { createdAt: "desc" },
    take: 20_000,
    include: { items: true },
  });
  const csv = toCsv(
    ["ref", "date", "statut", "nom", "telephone", "telephone2", "gouvernorat", "ville", "adresse", "articles", "sous_total", "remise", "livraison", "total", "cout_fournisseur", "marge", "paiement", "code_promo", "transporteur", "suivi", "source", "medium", "campagne", "appareil", "drapeaux", "note"],
    orders.map((o) => [
      o.ref, o.createdAt.toISOString(), STATUS_LABELS[o.status], o.name, o.phone, o.phoneAlt, o.governorate, o.city, o.address,
      o.items.map((i) => `${i.qty}x ${i.name}${i.variantName ? ` (${i.variantName})` : ""}${i.offerLabel ? ` [${i.offerLabel}]` : ""}`).join(" | "),
      dt(o.subtotal), dt(o.discount), dt(o.deliveryFee), dt(o.total), dt(o.costTotal), o.costTotal != null ? dt(o.subtotal - o.discount - o.costTotal) : "",
      o.paymentMethod, o.promoCodeText, o.carrier, o.trackingNumber, o.source, o.medium, o.campaign, o.device, o.flags.join(" "), o.note,
    ]),
  );
  return csvResponse(`commandes-${new Date().toISOString().slice(0, 10)}.csv`, csv);
}
