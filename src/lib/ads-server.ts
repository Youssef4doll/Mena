import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "./prisma";
import { getSecrets, getSettings } from "./settings";

/**
 * Server-side conversions: Meta Conversions API, TikTok Events API and the
 * GA4 Measurement Protocol. Only for orders whose customer accepted ad
 * cookies at checkout (Order.consentAds), and only with what each platform
 * needs: hashed phone, the browser ids they set, the order's contents.
 *
 * The event id is the order ref, the same id the browser pixel uses on the
 * thank-you page, so a platform that receives both counts one purchase.
 */

const sha = (s: string) => createHash("sha256").update(s.trim().toLowerCase()).digest("hex");

type AdContext = { fbp?: string; fbc?: string; ttp?: string; ttclid?: string; gaClientId?: string; ua?: string; ip?: string; url?: string };

export async function sendPurchase(orderId: string, trigger: "placed" | "confirmed" | "delivered") {
  const [settings, secrets] = await Promise.all([getSettings(), getSecrets()]);
  if (settings.tracking.purchaseAt !== trigger) return;
  const o = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      ref: true, total: true, phone: true, name: true, city: true, governorate: true, customerId: true, createdAt: true,
      consentAds: true, adContext: true,
      items: { select: { productId: true, name: true, unitPrice: true, qty: true } },
    },
  });
  if (!o || !o.consentAds) return;
  const ctx = (o.adContext ?? {}) as AdContext;
  const value = o.total / 1000;
  const eventTime = Math.floor((trigger === "placed" ? o.createdAt : new Date()).getTime() / 1000);
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const url = ctx.url ?? `${site}/commande/merci`;
  const tasks: Promise<unknown>[] = [];

  if (settings.tracking.metaPixelId && secrets.metaCapiToken) {
    const firstName = o.name.split(/\s+/)[0] ?? "";
    tasks.push(
      post(`https://graph.facebook.com/v21.0/${settings.tracking.metaPixelId}/events?access_token=${encodeURIComponent(secrets.metaCapiToken)}`, {
        data: [
          {
            event_name: "Purchase",
            event_time: eventTime,
            event_id: o.ref,
            action_source: "website",
            event_source_url: url,
            user_data: {
              ph: [sha(`216${o.phone}`)],
              fn: firstName ? [sha(firstName)] : undefined,
              // Only a typed city: most orders carry the town in the address.
              ct: o.city.trim() ? [sha(o.city.replace(/\s+/g, ""))] : undefined,
              country: [sha("tn")],
              external_id: [sha(o.customerId)],
              client_ip_address: ctx.ip,
              client_user_agent: ctx.ua,
              fbp: ctx.fbp,
              fbc: ctx.fbc,
            },
            custom_data: {
              currency: "TND",
              value,
              order_id: o.ref,
              content_type: "product",
              content_ids: o.items.map((i) => i.productId).filter(Boolean),
              contents: o.items.map((i) => ({ id: i.productId, quantity: i.qty, item_price: i.unitPrice / 1000 })),
              num_items: o.items.reduce((s, i) => s + i.qty, 0),
            },
          },
        ],
      }),
    );
  }

  if (settings.tracking.tiktokPixelId && secrets.tiktokToken) {
    tasks.push(
      post(
        "https://business-api.tiktok.com/open_api/v1.3/event/track/",
        {
          event_source: "web",
          event_source_id: settings.tracking.tiktokPixelId,
          data: [
            {
              event: "CompletePayment",
              event_time: eventTime,
              event_id: o.ref,
              user: { phone: sha(`+216${o.phone}`), external_id: sha(o.customerId), ttp: ctx.ttp, ttclid: ctx.ttclid, ip: ctx.ip, user_agent: ctx.ua },
              page: { url },
              properties: {
                currency: "TND",
                value,
                order_id: o.ref,
                content_type: "product",
                contents: o.items.map((i) => ({ content_id: i.productId, content_name: i.name, quantity: i.qty, price: i.unitPrice / 1000 })),
              },
            },
          ],
        },
        { "Access-Token": secrets.tiktokToken },
      ),
    );
  }

  // GA4: the browser sends the purchase itself when it happens at placement;
  // the server only reports purchases confirmed or delivered later, when no page is open.
  if (trigger !== "placed" && settings.tracking.ga4Id && secrets.ga4ApiSecret && ctx.gaClientId) {
    tasks.push(
      post(
        `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(settings.tracking.ga4Id)}&api_secret=${encodeURIComponent(secrets.ga4ApiSecret)}`,
        {
          client_id: ctx.gaClientId,
          events: [
            {
              name: "purchase",
              params: {
                transaction_id: o.ref,
                currency: "TND",
                value,
                items: o.items.map((i) => ({ item_id: i.productId, item_name: i.name, price: i.unitPrice / 1000, quantity: i.qty })),
              },
            },
          ],
        },
      ),
    );
  }

  await Promise.allSettled(tasks);
}

async function post(url: string, body: unknown, headers: Record<string, string> = {}) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) console.error(`[ads] ${new URL(url).hostname} HTTP ${res.status}`);
  } catch (e) {
    console.error(`[ads] ${new URL(url).hostname} failed`, e);
  }
}
