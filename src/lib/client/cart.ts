"use client";

import { useSyncExternalStore } from "react";
import { store } from "./storage";

/**
 * The basket, kept in this browser. Ids and quantities, plus the name and
 * picture so a line can be drawn before the server answers. Never a price:
 * every amount on the basket page is the server's quote for these ids.
 */
export type CartItem = {
  productId: string;
  variantId: string | null;
  offerId: string | null;
  /** Units for a plain line; always 1 for an offer (the offer is the pack). */
  qty: number;
  slug: string;
  name: string;
  nameAr: string | null;
  variantName: string | null;
  variantNameAr?: string | null;
  offerLabel: string | null;
  offerLabelAr: string | null;
  imageId: string | null;
};

const KEY = "mena_cart";
const MAX_LINES = 30;
const MAX_QTY = 10;
const EMPTY: CartItem[] = [];

let cache: CartItem[] | null = null;
const listeners = new Set<() => void>();

const str = (v: unknown, max = 200) => (typeof v === "string" && v.length <= max ? v : null);

/** Whatever is in storage is re-checked: a hand-edited or old basket never breaks the page. */
function clean(raw: unknown): CartItem[] {
  if (!Array.isArray(raw)) return EMPTY;
  const out: CartItem[] = [];
  for (const r of raw.slice(0, MAX_LINES)) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const productId = str(o.productId, 40);
    const slug = str(o.slug, 140);
    const name = str(o.name, 200);
    const qty = typeof o.qty === "number" && Number.isInteger(o.qty) ? Math.min(MAX_QTY, Math.max(1, o.qty)) : 1;
    if (!productId || !slug || !name) continue;
    const offerId = str(o.offerId, 40);
    out.push({
      productId,
      variantId: str(o.variantId, 40),
      offerId,
      qty: offerId ? 1 : qty,
      slug,
      name,
      nameAr: str(o.nameAr),
      variantName: str(o.variantName),
      variantNameAr: str(o.variantNameAr),
      offerLabel: str(o.offerLabel),
      offerLabelAr: str(o.offerLabelAr),
      imageId: str(o.imageId, 40),
    });
  }
  return out;
}

function read(): CartItem[] {
  if (cache) return cache;
  try {
    cache = clean(JSON.parse(store.get(KEY) || "[]"));
  } catch {
    cache = EMPTY;
  }
  return cache;
}

function write(items: CartItem[]) {
  cache = items.length ? items : EMPTY;
  if (items.length) store.set(KEY, JSON.stringify(items));
  else store.remove(KEY);
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  // Another tab changed the basket.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    cache = null;
    l();
  };
  addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    removeEventListener("storage", onStorage);
  };
}

/** The basket; empty on the server and during hydration, so the page never disagrees with itself. */
export function useCart(): CartItem[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

/** Pieces in the basket, as the header badge counts them: a pack counts once. */
export const cartCount = (items: CartItem[]) => items.reduce((n, i) => n + i.qty, 0);

export const itemKey = (i: Pick<CartItem, "productId" | "variantId" | "offerId">) => `${i.productId}|${i.variantId ?? ""}|${i.offerId ?? ""}`;

export type AddResult = "added" | "more" | "already" | "replaced" | "full";

const sameChoice = (a: Pick<CartItem, "productId" | "variantId">, b: Pick<CartItem, "productId" | "variantId">) => a.productId === b.productId && (a.variantId ?? null) === (b.variantId ?? null);

/**
 * Same product, option and offer twice: a plain line gets more units (10 at
 * most), an offer stays once — the server takes an offer once per order.
 * Another offer of a product already in the basket takes the old one's place:
 * "1 unité" then "2 + 1 offerte" is one pack of three, not two lines that
 * cost more than the pack.
 */
export function addToCart(item: CartItem): AddResult {
  const items = read();
  const key = itemKey(item);
  const existing = items.find((i) => itemKey(i) === key);
  const otherOffer = existing ? null : items.find((i) => sameChoice(i, item) && (i.offerId || item.offerId));
  let result: AddResult;
  if (otherOffer) {
    const next = { ...item, qty: item.offerId ? 1 : Math.min(MAX_QTY, Math.max(1, item.qty)) };
    write(items.map((i) => (i === otherOffer ? next : i)));
    result = "replaced";
  } else if (existing) {
    if (item.offerId || existing.qty >= MAX_QTY) result = "already";
    else {
      write(items.map((i) => (itemKey(i) === key ? { ...i, qty: Math.min(MAX_QTY, i.qty + item.qty) } : i)));
      result = "more";
    }
  } else if (items.length >= MAX_LINES) result = "full";
  else {
    write([...items, { ...item, qty: item.offerId ? 1 : Math.min(MAX_QTY, Math.max(1, item.qty)) }]);
    result = "added";
  }
  for (const l of addedListeners) l({ item, result });
  return result;
}

export function setCartQty(key: string, qty: number) {
  write(read().map((i) => (itemKey(i) === key && !i.offerId ? { ...i, qty: Math.min(MAX_QTY, Math.max(1, qty)) } : i)));
}

export function removeFromCart(key: string) {
  write(read().filter((i) => itemKey(i) !== key));
}

export function replaceCart(items: CartItem[]) {
  write(clean(items));
}

export function clearCart() {
  write([]);
}

/** After an order from a product page or the quick form: the same product and option leave the basket. */
export function removeOrdered(lines: Pick<CartItem, "productId" | "variantId">[]) {
  const items = read();
  const left = items.filter((i) => !lines.some((l) => sameChoice(i, l)));
  if (left.length !== items.length) write(left);
}

/** Tells the "added to your basket" sheet what was just added, wherever the button was. */
type Added = { item: CartItem; result: AddResult };
const addedListeners = new Set<(a: Added) => void>();
export function onCartAdded(l: (a: Added) => void) {
  addedListeners.add(l);
  return () => {
    addedListeners.delete(l);
  };
}
