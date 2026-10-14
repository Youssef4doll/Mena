import "server-only";
import { prisma } from "./prisma";
import { getSecrets, getSettings } from "./settings";
import { href, orderLang } from "@/i18n/lang";

/**
 * Card payment through Konnect (Tunisian payment facilitator: bank cards,
 * wallets, e-DINAR). Off by default — Mena sells cash on delivery.
 *
 * The webhook only says "something happened to payment X". The status is
 * then read from Konnect's own API with the shop's key: a webhook body is
 * never taken as proof of payment, and the amount must match the order.
 * Endpoints per Konnect's API v2 — check them against https://docs.konnect.network
 * before switching it on.
 */
function base(sandbox: boolean) {
  return sandbox ? "https://api.sandbox.konnect.network/api/v2" : "https://api.konnect.network/api/v2";
}

export async function startKonnectPayment(orderId: string, token: string): Promise<string | null> {
  const [settings, secrets] = await Promise.all([getSettings(), getSecrets()]);
  if (!secrets.konnectApiKey || !settings.payments.konnectWalletId) return null;
  const o = await prisma.order.findUnique({ where: { id: orderId } });
  if (!o) return null;
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const [firstName, ...rest] = o.name.split(/\s+/);
  try {
    const res = await fetch(`${base(settings.payments.konnectSandbox)}/payments/init-payment`, {
      method: "POST",
      headers: { "x-api-key": secrets.konnectApiKey, "content-type": "application/json" },
      body: JSON.stringify({
        receiverWalletId: settings.payments.konnectWalletId,
        token: "TND",
        amount: o.total, // millimes
        type: "immediate",
        description: `Commande ${o.ref}`,
        acceptedPaymentMethods: ["wallet", "bank_card", "e-DINAR"],
        lifespan: 30,
        checkoutForm: false,
        addPaymentFeesToAmount: false,
        firstName,
        lastName: rest.join(" "),
        phoneNumber: o.phone,
        email: o.email ?? undefined,
        orderId: o.ref,
        webhook: `${site}/api/payments/konnect`,
        silentWebhook: true,
        successUrl: `${site}${href(orderLang(o.locale), `/suivi/t/${token}`)}?paiement=ok`,
        failUrl: `${site}${href(orderLang(o.locale), `/suivi/t/${token}`)}?paiement=echec`,
        theme: "light",
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { payUrl?: string; paymentRef?: string };
    if (!data.payUrl || !data.paymentRef) throw new Error("no payUrl");
    await prisma.order.update({ where: { id: o.id }, data: { paymentRef: data.paymentRef } });
    return data.payUrl;
  } catch (e) {
    console.error("[konnect] init failed", e);
    await prisma.order.update({ where: { id: o.id }, data: { paymentStatus: "FAILED" } });
    return null;
  }
}

/** Called by the webhook with the payment ref; reads the truth from Konnect. */
export async function syncKonnectPayment(paymentRef: string) {
  const [settings, secrets] = await Promise.all([getSettings(), getSecrets()]);
  if (!secrets.konnectApiKey) return;
  const o = await prisma.order.findFirst({ where: { paymentRef } });
  if (!o) return;
  const res = await fetch(`${base(settings.payments.konnectSandbox)}/payments/${encodeURIComponent(paymentRef)}`, {
    headers: { "x-api-key": secrets.konnectApiKey },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return;
  const data = (await res.json()) as { payment?: { status?: string; amount?: number } };
  const status = data.payment?.status;
  if (status === "completed" && data.payment?.amount === o.total) {
    await prisma.order.update({ where: { id: o.id }, data: { paymentStatus: "PAID" } });
  } else if (status === "failed" || status === "expired") {
    await prisma.order.update({ where: { id: o.id }, data: { paymentStatus: "FAILED" } });
  }
}
