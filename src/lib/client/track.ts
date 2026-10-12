"use client";

import { session, visitorId } from "./attribution";
import type { ClientEvent } from "../events";

type Queued = { name: ClientEvent; path: string; productId?: string; value?: number; props?: Record<string, unknown>; at: string };

let queue: Queued[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function flush(useBeacon = false) {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (queue.length === 0) return;
  const s = session();
  const body = JSON.stringify({
    visitorId: visitorId(),
    sessionId: s.id,
    source: s.touch.source,
    medium: s.touch.medium,
    campaign: s.touch.campaign,
    events: queue.splice(0, 20),
  });
  try {
    if (useBeacon && navigator.sendBeacon) {
      navigator.sendBeacon("/api/events", new Blob([body], { type: "application/json" }));
    } else {
      void fetch("/api/events", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => {});
    }
  } catch {}
  if (queue.length) flush(useBeacon);
}

if (typeof window !== "undefined") {
  addEventListener("pagehide", () => flush(true));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush(true);
  });
}

/**
 * First-party analytics. Batched, never awaited, never throws: a lost event
 * is acceptable, a slow button is not. No personal data: ids, paths, counts.
 */
export function track(name: ClientEvent, data: { productId?: string; value?: number; props?: Record<string, unknown> } = {}) {
  try {
    queue.push({ name, path: location.pathname.slice(0, 200), ...data, at: new Date().toISOString() });
    if (queue.length >= 10) flush();
    else if (!timer) timer = setTimeout(() => flush(), 1500);
  } catch {}
}

export function trackNow(name: ClientEvent, data: { productId?: string; value?: number; props?: Record<string, unknown> } = {}) {
  track(name, data);
  flush(true);
}

export function currentAttribution() {
  const s = session();
  return { visitorId: visitorId(), sessionId: s.id, attribution: { source: s.touch.source, medium: s.touch.medium, campaign: s.touch.campaign ?? undefined, content: s.touch.content ?? undefined, landing: s.touch.landing } };
}
