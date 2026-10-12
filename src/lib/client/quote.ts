"use client";

import type { PublicQuote } from "../quote-server";
import { store } from "./storage";

export type { PublicQuote };

export async function fetchQuote(body: { lines: { productId: string; variantId: string | null; qty: number }[]; governorate?: string | null; promoCode?: string | null; phone?: string | null }, signal?: AbortSignal): Promise<PublicQuote | null> {
  try {
    const res = await fetch("/api/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal });
    if (!res.ok) return null;
    return (await res.json()) as PublicQuote;
  } catch {
    return null;
  }
}

/** The governorate the visitor picked last (product page, cart or checkout), so they choose it once. */
export const GOV_KEY = "mena_gov";
export const getGov = () => store.get(GOV_KEY);
export const setGov = (g: string) => store.set(GOV_KEY, g);
