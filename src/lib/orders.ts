import "server-only";
import { z } from "zod";
import { Prisma, type OrderStatus } from "@prisma/client";
import { after } from "next/server";
import { prisma } from "./prisma";
import { quoteCart, publicQuote, type PublicQuote } from "./quote-server";
import { formatPhone, normalizePhone, isMobile } from "./phone";
import { governorateLabel, isGovernorate } from "./governorates";
import { orderFlags } from "./fraud";
import { getSettings } from "./settings";
import { accessTokenFromSalt, hashToken, newOrderRef, newToken } from "./tokens";
import { recordOrderEvent } from "./events-server";
import { sendSms, sendEmail } from "./notify";
import { placedText, shippedText, reviewText } from "./messages";
import { sendPurchase } from "./ads-server";
import { formatTND } from "./money";
import { deliveryRangeLabel } from "./delivery";
import { revalidateTag } from "next/cache";
import { CATALOG_TAG } from "./catalog";
import { TRANSITIONS } from "./order-status";
import { href, orderLang } from "@/i18n/lang";

const text = (max: number) => z.string().trim().max(max);
/** Where the visit came from: cut to its length, never a reason to refuse an order. */
const cut = (max: number) => z.string().trim().transform((s) => s.slice(0, max));
/** An ad click id: kept whole or dropped, since a cut one would match no click. */
const clickId = (max: number) => z.string().trim().transform((s) => (s.length <= max ? s : undefined));

/** Turn on together with a payment choice in BuyBox. */
const CARD_IN_FORM = false;

export const placeOrderSchema = z.object({
  lines: z
    .array(z.object({ productId: z.string().min(1).max(40), variantId: z.string().max(40).nullish(), offerId: z.string().max(40).nullish(), qty: z.number().int().min(1).max(10) }))
    .min(1)
    .max(30),
  phone: text(30),
  phoneAlt: text(30).optional(),
  name: text(80).pipe(z.string().min(2)),
  email: z.union([z.literal(""), z.email().max(120)]).optional(),
  governorate: text(40),
  /** Optional: the one-step form asks for a single address line. */
  city: text(80).optional(),
  /** Town, street and landmarks, typed in one field. */
  address: text(300).pipe(z.string().min(4)),
  note: text(300).optional(),
  promoCode: text(40).optional(),
  payment: z.enum(["COD", "CARD"]),
  /** The total the customer was shown. A different server total stops the order and shows the new one. */
  expectedTotal: z.number().int().min(0),
  cartToken: z.string().max(64).optional(),
  /** The abandoned cart a reminder link restored. */
  restoredCartId: z.string().regex(/^[a-z0-9]{20,40}$/).optional(),
  visitorId: z.string().max(64).optional(),
  sessionId: z.string().max(64).optional(),
  attribution: z
    .object({
      source: cut(60).optional(),
      medium: cut(60).optional(),
      campaign: cut(120).optional(),
      content: cut(120).optional(),
      landing: cut(200).optional(),
    })
    .optional(),
  consentAds: z.boolean().optional(),
  ad: z
    .object({ fbp: clickId(120).optional(), fbc: clickId(300).optional(), ttp: clickId(120).optional(), ttclid: clickId(300).optional(), gaClientId: clickId(60).optional() })
    .optional(),
  locale: z.enum(["fr", "ar"]).default("ar"),
  /** Where the order was placed: the product page's form, the same form in the product page's order sheet, the quick form on a card, the basket, or typed in the back office. Analytics only. */
  origin: z.enum(["product", "sheet", "quick", "cart", "admin"]).optional(),
  /** Honeypot: hidden from people, filled by bots. */
  website: z.string().max(200).optional(),
  /** Random, one per checkout attempt: the same attempt sent twice makes one order. */
  submitKey: z.string().regex(/^[A-Za-z0-9-]{16,64}$/).optional(),
});
export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;

export type PlaceResult =
  | { ok: true; ref: string; token: string; payUrl?: string }
  | { ok: false; error: "invalid"; fields: string[] }
  | { ok: false; error: "cart_changed" | "price_changed" | "promo_invalid" | "delivery_unavailable" | "empty" | "card_unavailable"; quote: PublicQuote }
  | { ok: false; error: "rate_limited" | "server" };

class StockGone extends Error {}

/**
 * Turns a checkout into an order. Everything is re-derived on the server:
 * the lines are re-priced from the catalog, the delivery fee read from the
 * settings, the code re-checked, stock re-read and decremented in the same
 * transaction that writes the order. A total that differs from the one the
 * customer saw stops the order — they are shown the new total and confirm
 * again, rather than being charged something they did not read.
 */
export async function placeOrder(input: PlaceOrderInput, ctx: { ua: string | null; ip: string; ipHash: string; device: string }, attempt = 0): Promise<PlaceResult> {
  // The same attempt again (the answer was lost on a weak connection, or a second tap):
  // the order it already made, never a second one. Only the browser that sent it knows the key.
  const submitKeyHash = input.submitKey ? hashToken(input.submitKey) : null;
  if (submitKeyHash) {
    const done = await prisma.order.findUnique({ where: { submitKeyHash }, select: { ref: true, accessSalt: true } });
    if (done) return { ok: true, ref: done.ref, token: accessTokenFromSalt(done.accessSalt) };
  }

  const phone = normalizePhone(input.phone);
  const phoneAlt = input.phoneAlt ? normalizePhone(input.phoneAlt) : null;
  const bad: string[] = [];
  if (!phone) bad.push("phone");
  if (input.phoneAlt && !phoneAlt) bad.push("phoneAlt");
  if (!isGovernorate(input.governorate)) bad.push("governorate");
  if (bad.length) return { ok: false, error: "invalid", fields: bad };

  const quote = await quoteCart({ lines: input.lines, governorate: input.governorate, promoCode: input.promoCode, phone });
  const pq = publicQuote(quote);
  if (quote.lines.length === 0) return { ok: false, error: "empty", quote: pq };
  if (quote.problems.length > 0) return { ok: false, error: "cart_changed", quote: pq };
  if (quote.deliveryUnavailable || !quote.delivery) return { ok: false, error: "delivery_unavailable", quote: pq };
  if (input.promoCode && quote.promo && !quote.promo.result.ok) return { ok: false, error: "promo_invalid", quote: pq };
  if (quote.total !== input.expectedTotal) return { ok: false, error: "price_changed", quote: pq };

  const settings = await getSettings();
  // The order form offers cash on delivery only, and the back office no longer has a card switch:
  // a card request is refused until the form offers the choice again (see docs/DEPLOIEMENT.md).
  if (input.payment === "CARD" && !(CARD_IN_FORM && settings.payments.card && settings.payments.konnectWalletId)) {
    return { ok: false, error: "card_unavailable", quote: pq };
  }

  const accessSalt = newToken();
  const token = accessTokenFromSalt(accessSalt);
  const deliveryQuote = deliveryRangeLabel(quote.delivery.minDays, quote.delivery.maxDays, "fr");
  const productIds = quote.lines.map((l) => l.productId).sort();

  let order;
  try {
    order = await prisma.$transaction(
      async (tx) => {
        const customer = await tx.customer.upsert({
          where: { phone: phone! },
          create: { phone: phone!, name: input.name, email: input.email || null },
          update: {},
        });

        const since24h = new Date(Date.now() - 86_400_000);
        const since48h = new Date(Date.now() - 2 * 86_400_000);
        const [delivered, refused, last24h, open] = await Promise.all([
          tx.order.count({ where: { customerId: customer.id, status: "DELIVERED" } }),
          tx.order.count({ where: { customerId: customer.id, status: "REFUSED" } }),
          tx.order.count({ where: { customerId: customer.id, createdAt: { gte: since24h } } }),
          tx.order.findMany({
            where: { customerId: customer.id, createdAt: { gte: since48h }, status: { in: ["PENDING", "CONFIRMED", "SUPPLIER_ORDERED", "SHIPPED"] } },
            select: { items: { select: { productId: true } } },
          }),
        ]);
        // Any product already in an open order from this phone: the caller checks it is not the same order twice
        // (the product ordered from its page, then again from the basket with something else).
        const duplicateOpen = open.some((o) => o.items.some((i) => i.productId && productIds.includes(i.productId)));
        const flags = orderFlags(
          { blacklisted: customer.blacklisted, delivered, refused, last24h, duplicateOpen },
          { maxPerDay: settings.checkout.maxOrdersPerPhonePerDay, phoneIsMobile: isMobile(phone!) },
        );

        // Counted stock leaves the shelf with the order, or the order does not happen.
        for (const l of quote.lines) {
          const p = await tx.product.findUnique({ where: { id: l.productId }, select: { stockMode: true } });
          if (p?.stockMode !== "TRACKED") continue;
          const res = l.variantId
            ? await tx.productVariant.updateMany({ where: { id: l.variantId, stockQty: { gte: l.qty } }, data: { stockQty: { decrement: l.qty } } })
            : await tx.product.updateMany({ where: { id: l.productId, stockQty: { gte: l.qty } }, data: { stockQty: { decrement: l.qty } } });
          if (res.count === 0) throw new StockGone();
        }

        let promoCodeId: string | null = null;
        if (quote.promo?.result.ok) {
          const promo = await tx.promoCode.findUnique({ where: { code: quote.promo.code } });
          if (promo) {
            const res = await tx.promoCode.updateMany({
              where: { id: promo.id, ...(promo.maxUses != null ? { usedCount: { lt: promo.maxUses } } : {}) },
              data: { usedCount: { increment: 1 } },
            });
            if (res.count === 0) throw new StockGone();
            promoCodeId = promo.id;
          }
        }

        const a = input.attribution ?? {};
        const created = await tx.order.create({
          data: {
            ref: newOrderRef(),
            customerId: customer.id,
            name: input.name,
            phone: phone!,
            phoneAlt,
            email: input.email || null,
            governorate: input.governorate,
            city: input.city ?? "",
            address: input.address,
            note: input.note || null,
            subtotal: quote.subtotal,
            discount: quote.discount,
            deliveryFee: quote.deliveryFee,
            total: quote.total,
            costTotal: quote.costTotal,
            promoCodeId,
            promoCodeText: promoCodeId ? quote.promo!.code : null,
            paymentMethod: input.payment,
            paymentStatus: input.payment === "CARD" ? "PENDING" : "UNPAID",
            deliveryQuote,
            flags,
            accessSalt,
            accessHash: hashToken(token),
            submitKeyHash,
            source: a.source || "direct",
            medium: a.medium || null,
            campaign: a.campaign || null,
            content: a.content || null,
            landing: a.landing || null,
            device: ctx.device,
            visitorId: input.visitorId || null,
            sessionId: input.sessionId || null,
            locale: input.locale,
            ipHash: ctx.ipHash,
            consentAds: Boolean(input.consentAds),
            adContext: input.consentAds ? { ...(input.ad ?? {}), ua: ctx.ua ?? undefined, ip: ctx.ip } : Prisma.JsonNull,
            items: {
              create: quote.lines.map((l) => ({
                productId: l.productId,
                variantId: l.variantId,
                name: l.name,
                variantName: l.variantName,
                unitPrice: l.unitPrice,
                unitCost: l.unitCost,
                qty: l.qty,
                lineTotal: l.lineTotal,
                offerId: l.offerId,
                offerLabel: l.offerLabel,
                offerLabelAr: l.offerLabelAr,
              })),
            },
            history: { create: { from: null, to: "PENDING", by: "client" } },
          },
          select: { id: true, ref: true, total: true, visitorId: true, sessionId: true, source: true, medium: true, campaign: true, device: true, governorate: true, name: true, locale: true, email: true, phone: true, address: true },
        });

        if (input.restoredCartId) {
          await tx.cart.updateMany({ where: { id: input.restoredCartId, status: "ACTIVE" }, data: { status: "CONVERTED", orderId: created.id } });
        }
        if (input.cartToken) {
          await tx.cart.updateMany({ where: { tokenHash: hashToken(input.cartToken) }, data: { status: "CONVERTED", orderId: created.id, phone: phone! } });
        }
        return created;
      },
      { isolationLevel: "Serializable", timeout: 15_000 },
    );
  } catch (e) {
    if (e instanceof StockGone) {
      const fresh = await quoteCart({ lines: input.lines, governorate: input.governorate, promoCode: input.promoCode, phone });
      return { ok: false, error: "cart_changed", quote: publicQuote(fresh) };
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && (e.code === "P2034" || e.code === "P2002") && attempt < 2) {
      // A serialization conflict (two orders for the last unit), a ref collision, or the same attempt
      // arriving twice at once (the retry then finds the order the other one made): retry, a couple of times at most.
      return placeOrder(input, ctx, attempt + 1);
    }
    console.error("[order] placement failed", e);
    return { ok: false, error: "server" };
  }

  if (quote.lines.some((l) => l.productId)) revalidateTag(CATALOG_TAG, "max");

  // Forms left with the same number in another browser: no reminder after an order.
  // Outside the order's transaction, so it never makes two orders collide.
  await prisma.cart
    .updateMany({ where: { status: "ACTIVE", phone: order.phone, updatedAt: { gte: new Date(Date.now() - 30 * 86_400_000) } }, data: { status: "CONVERTED", orderId: order.id } })
    .catch((e) => console.error("[order] closing open forms failed", e));

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  // In the language the customer ordered in.
  const trackUrl = `${site}${href(orderLang(order.locale), `/suivi/t/${token}`)}`;
  after(async () => {
    await recordOrderEvent("order_placed", order, { items: quote.lines.reduce((s, l) => s + l.qty, 0), lines: quote.lines.length, payment: input.payment, promo: Boolean(quote.discount), origin: input.origin ?? "product", restored: Boolean(input.restoredCartId) });
    if (settings.notify.smsOnPlaced) await sendSms({ to: order.phone, text: placedText(order, settings.shop.name, trackUrl), kind: "order_placed", orderId: order.id });
    // One e-mail, to the owner only, for each new order; customers get none (they are called, and get the SMS if set).
    const alertTo = (settings.notify.orderAlertTo || settings.shop.email).trim();
    if (alertTo) {
      await sendEmail({
        to: alertTo,
        subject: `Nouvelle commande ${order.ref} — ${formatTND(quote.total)}`,
        text: [
          `${order.name} · ${formatPhone(order.phone)}`,
          `${governorateLabel(order.governorate, "fr")} · ${order.address}`,
          "",
          ...quote.lines.map((l) => `${l.qty} × ${l.name}${l.variantName ? ` (${l.variantName})` : ""}${l.offerLabel ? ` — ${l.offerLabel}` : ""} — ${formatTND(l.lineTotal)}`),
          `Livraison : ${formatTND(quote.deliveryFee)}`,
          `Total : ${formatTND(quote.total)}`,
          "",
          `${site}/admin/commandes/${order.id}`,
        ].join("\n"),
        kind: "order_alert",
        orderId: order.id,
      });
    }
    await sendPurchase(order.id, "placed");
  });

  let payUrl: string | undefined;
  if (input.payment === "CARD") {
    const { startKonnectPayment } = await import("./konnect");
    payUrl = (await startKonnectPayment(order.id, token)) ?? undefined;
  }

  return { ok: true, ref: order.ref, token, payUrl };
}

// ------------------------------------------------------------------ status

export { TRANSITIONS, STATUS_LABELS } from "./order-status";

const EVENT_FOR: Partial<Record<OrderStatus, Parameters<typeof recordOrderEvent>[0]>> = {
  CONFIRMED: "order_confirmed",
  SHIPPED: "order_shipped",
  DELIVERED: "order_delivered",
  REFUSED: "order_refused",
  CANCELLED: "order_cancelled",
  RETURNED: "order_returned",
};

export async function changeStatus(orderId: string, to: OrderStatus, by: string, extra: { note?: string; carrier?: string; trackingNumber?: string; refusalReason?: string } = {}) {
  const current = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!current) return { ok: false as const, error: "not_found" };
  if (!TRANSITIONS[current.status].includes(to)) return { ok: false as const, error: "not_allowed" };

  const now = new Date();
  const restock = to === "CANCELLED" || to === "REFUSED" || to === "RETURNED";
  const updated = await prisma.$transaction(async (tx) => {
    // Updating "where status = what we read" makes two admins clicking at once harmless.
    const res = await tx.order.updateMany({
      where: { id: orderId, status: current.status },
      data: {
        status: to,
        ...(to === "CONFIRMED" ? { confirmedAt: now } : {}),
        ...(to === "SHIPPED" ? { shippedAt: now, carrier: extra.carrier || current.carrier, trackingNumber: extra.trackingNumber || current.trackingNumber } : {}),
        ...(to === "DELIVERED" ? { deliveredAt: now, ...(current.paymentMethod === "COD" ? { paymentStatus: "PAID" as const } : {}) } : {}),
        ...(to === "REFUSED" ? { refusedAt: now, refusalReason: extra.refusalReason || null } : {}),
        ...(to === "CANCELLED" ? { cancelledAt: now } : {}),
      },
    });
    if (res.count === 0) return null;
    await tx.orderEvent.create({ data: { orderId, from: current.status, to, by, note: extra.note || null } });
    if (restock) {
      for (const i of current.items) {
        if (!i.productId) continue;
        const p = await tx.product.findUnique({ where: { id: i.productId }, select: { stockMode: true } });
        if (p?.stockMode !== "TRACKED") continue;
        if (i.variantId) await tx.productVariant.updateMany({ where: { id: i.variantId }, data: { stockQty: { increment: i.qty } } });
        else await tx.product.updateMany({ where: { id: i.productId }, data: { stockQty: { increment: i.qty } } });
      }
    }
    if (to === "CANCELLED" && current.promoCodeId) {
      await tx.promoCode.updateMany({ where: { id: current.promoCodeId, usedCount: { gt: 0 } }, data: { usedCount: { decrement: 1 } } });
    }
    return tx.order.findUnique({ where: { id: orderId } });
  });
  if (!updated) return { ok: false as const, error: "conflict" };
  if (restock) revalidateTag(CATALOG_TAG, "max");

  const settings = await getSettings();
  const ev = EVENT_FOR[to];
  after(async () => {
    if (ev) {
      const hours = Math.round((now.getTime() - current.createdAt.getTime()) / 3_600_000);
      await recordOrderEvent(ev, updated, { from: current.status, hoursFromOrder: hours, ...(to === "REFUSED" ? { reason: extra.refusalReason ?? null } : {}) });
    }
    if (to === "CONFIRMED") await sendPurchase(orderId, "confirmed");
    if (to === "DELIVERED") await sendPurchase(orderId, "delivered");
    if (to === "SHIPPED" && settings.notify.smsOnShipped) {
      const token = accessTokenFromSalt(updated.accessSalt);
      const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
      await sendSms({ to: updated.phone, text: shippedText(updated, settings.shop.name, `${site}${href(orderLang(updated.locale), `/suivi/t/${token}`)}`, updated.carrier, updated.trackingNumber), kind: "order_shipped", orderId });
    }
  });
  return { ok: true as const, order: updated };
}

/** The review link for a delivered order: the tracking link, opened on the review form. */
export async function reviewLinkFor(orderId: string) {
  const o = await prisma.order.findUnique({ where: { id: orderId }, select: { status: true, ref: true, name: true, total: true, locale: true, phone: true, accessSalt: true } });
  if (!o || o.status !== "DELIVERED") return null;
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const settings = await getSettings();
  const url = `${site}${href(orderLang(o.locale), `/suivi/t/${accessTokenFromSalt(o.accessSalt)}`)}?avis=1`;
  return { url, text: reviewText(o, settings.shop.name, url), phone: o.phone };
}

export function trackingUrl(order: { accessSalt: string; locale?: string | null }) {
  return `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}${href(orderLang(order.locale), `/suivi/t/${accessTokenFromSalt(order.accessSalt)}`)}`;
}
