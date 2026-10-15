"use client";

import { store } from "./storage";

/** "granted" | "denied" | null (not asked yet). Ad pixels load only on "granted". */
const KEY = "mena_consent";
type Listener = (v: Consent) => void;
export type Consent = "granted" | "denied" | null;
const listeners = new Set<Listener>();

export function getConsent(): Consent {
  const v = store.get(KEY);
  return v === "granted" || v === "denied" ? v : null;
}

export function setConsent(v: "granted" | "denied") {
  store.set(KEY, v);
  listeners.forEach((l) => l(v));
}

export function onConsent(l: Listener) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function cookie(name: string): string | undefined {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : undefined;
}

/** The Facebook click id of the landing URL, as Meta formats it (fb.1.<first seen>.<id>), for 90 days. */
function storedFbc(): string | undefined {
  try {
    const v = JSON.parse(store.get("mena_fbclid") ?? "null") as { v?: unknown; at?: unknown } | null;
    if (!v || typeof v.v !== "string" || typeof v.at !== "number" || Date.now() - v.at > 90 * 86_400_000) return undefined;
    return `fb.1.${v.at}.${v.v}`;
  } catch {
    return undefined;
  }
}

/** Browser ids the Conversions APIs use to match the purchase to the ad click. Only read with consent. */
export function adIds() {
  if (getConsent() !== "granted") return undefined;
  const ga = cookie("_ga");
  const params = new URLSearchParams(location.search);
  return {
    fbp: cookie("_fbp"),
    // The pixel's cookie; else the click id of this URL, or the one kept from the landing page.
    fbc: cookie("_fbc") ?? (params.get("fbclid") ? `fb.1.${Date.now()}.${params.get("fbclid")}` : storedFbc()),
    ttp: cookie("_ttp"),
    ttclid: params.get("ttclid") ?? store.get("mena_ttclid") ?? undefined,
    gaClientId: ga ? ga.split(".").slice(-2).join(".") : undefined,
  };
}
