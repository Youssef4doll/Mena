import "server-only";
import { prisma } from "./prisma";

/** What the customer's own pages show of an order. No full address, no phone: a shared link must not expose them. */
export async function customerOrderView(orderId: string) {
  const o = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true, ref: true, status: true, name: true, governorate: true, city: true, subtotal: true, discount: true, deliveryFee: true, total: true,
      paymentMethod: true, paymentStatus: true, deliveryQuote: true, carrier: true, trackingNumber: true, createdAt: true, confirmedAt: true,
      shippedAt: true, deliveredAt: true, locale: true,
      items: { select: { id: true, name: true, variantName: true, unitPrice: true, qty: true, lineTotal: true, offerLabel: true, productId: true, product: { select: { slug: true, nameAr: true, images: { orderBy: { sort: "asc" }, take: 1, select: { mediaId: true } } } }, review: { select: { id: true } } } },
      returns: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true, createdAt: true } },
    },
  });
  if (!o) return null;
  return {
    ...o,
    firstName: o.name.split(/\s+/)[0] ?? "",
    name: undefined,
    createdAt: o.createdAt.toISOString(),
    confirmedAt: o.confirmedAt?.toISOString() ?? null,
    shippedAt: o.shippedAt?.toISOString() ?? null,
    deliveredAt: o.deliveredAt?.toISOString() ?? null,
  };
}
export type CustomerOrderView = NonNullable<Awaited<ReturnType<typeof customerOrderView>>>;
