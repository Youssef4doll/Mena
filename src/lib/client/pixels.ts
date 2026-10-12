"use client";

import { getConsent } from "./consent";

/**
 * Thin wrappers over the ad pixels. Each call is a no-op unless the pixel was
 * configured in the back office AND the visitor accepted cookies. Values in
 * TND (decimal), as the platforms expect.
 */
type W = typeof window & {
  fbq?: (...a: unknown[]) => void;
  ttq?: { track: (e: string, d?: unknown, o?: unknown) => void; page: () => void };
  gtag?: (...a: unknown[]) => void;
};

export type PixelItem = { id: string; name: string; price: number; qty: number };

function w(): W | null {
  if (typeof window === "undefined" || getConsent() !== "granted") return null;
  return window as W;
}

export function pixelViewContent(item: PixelItem) {
  const x = w();
  if (!x) return;
  const value = item.price / 1000;
  x.fbq?.("track", "ViewContent", { content_ids: [item.id], content_type: "product", content_name: item.name, value, currency: "TND" });
  x.ttq?.track("ViewContent", { contents: [{ content_id: item.id, content_name: item.name, price: value, quantity: 1 }], content_type: "product", value, currency: "TND" });
  x.gtag?.("event", "view_item", { currency: "TND", value, items: [{ item_id: item.id, item_name: item.name, price: value }] });
}

export function pixelInitiateCheckout(items: PixelItem[], total: number) {
  const x = w();
  if (!x) return;
  const value = total / 1000;
  x.fbq?.("track", "InitiateCheckout", { content_ids: items.map((i) => i.id), num_items: items.reduce((n, i) => n + i.qty, 0), value, currency: "TND" });
  x.ttq?.track("InitiateCheckout", { contents: items.map((i) => ({ content_id: i.id, quantity: i.qty, price: i.price / 1000 })), value, currency: "TND" });
  x.gtag?.("event", "begin_checkout", { currency: "TND", value, items: items.map((i) => ({ item_id: i.id, item_name: i.name, price: i.price / 1000, quantity: i.qty })) });
}

/** The thank-you page. eventId = order ref, the same id the server sends, so the platforms count it once. */
export function pixelPurchase(ref: string, items: PixelItem[], total: number) {
  const x = w();
  if (!x) return;
  const value = total / 1000;
  x.fbq?.("track", "Purchase", { content_ids: items.map((i) => i.id), content_type: "product", value, currency: "TND", num_items: items.reduce((n, i) => n + i.qty, 0) }, { eventID: ref });
  x.ttq?.track("CompletePayment", { contents: items.map((i) => ({ content_id: i.id, quantity: i.qty, price: i.price / 1000 })), content_type: "product", value, currency: "TND" }, { event_id: ref });
  x.gtag?.("event", "purchase", { transaction_id: ref, currency: "TND", value, items: items.map((i) => ({ item_id: i.id, item_name: i.name, price: i.price / 1000, quantity: i.qty })) });
}

export function pixelSearch(q: string) {
  const x = w();
  if (!x) return;
  x.fbq?.("track", "Search", { search_string: q });
  x.ttq?.track("Search", { query: q });
  x.gtag?.("event", "search", { search_term: q });
}

export function pixelContact() {
  const x = w();
  if (!x) return;
  x.fbq?.("track", "Contact");
  x.ttq?.track("Contact");
  x.gtag?.("event", "contact");
}
