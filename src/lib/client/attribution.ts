"use client";

import { randomId, store } from "./storage";

/**
 * Who is visiting, and where they came from.
 *
 *  - visitorId: one per browser, kept.
 *  - session: renewed after 30 minutes without activity. Each session gets
 *    the source it landed with (utm_*, or the referrer). A session with no
 *    source of its own (typed URL, bookmark) inherits the visitor's last
 *    non-direct source from the past 30 days — so the order placed the day
 *    after a Facebook ad is credited to the ad, the usual analytics rule.
 */
const VISITOR = "mena_vid";
const SESSION = "mena_sess";
const LAST_TOUCH = "mena_touch";
const SESSION_MS = 30 * 60_000;
const TOUCH_MS = 30 * 86_400_000;

export type Touch = { source: string; medium: string; campaign: string | null; content: string | null; landing: string; at: number };
type Session = { id: string; last: number; touch: Touch };

const SOCIAL: Record<string, string> = {
  "facebook.com": "facebook",
  "m.facebook.com": "facebook",
  "l.facebook.com": "facebook",
  "lm.facebook.com": "facebook",
  "instagram.com": "instagram",
  "l.instagram.com": "instagram",
  "tiktok.com": "tiktok",
  "wa.me": "whatsapp",
  "web.whatsapp.com": "whatsapp",
  "t.co": "twitter",
  "x.com": "twitter",
  "youtube.com": "youtube",
  "snapchat.com": "snapchat",
};
const SEARCH = ["google.", "bing.", "yahoo.", "duckduckgo.", "yandex."];

function fromLocation(): Touch | null {
  const p = new URLSearchParams(location.search);
  const landing = location.pathname;
  const at = Date.now();
  const utm = p.get("utm_source");
  if (utm) {
    return { source: utm.toLowerCase().slice(0, 60), medium: (p.get("utm_medium") ?? "").toLowerCase().slice(0, 60) || "unknown", campaign: p.get("utm_campaign")?.slice(0, 120) ?? null, content: p.get("utm_content")?.slice(0, 120) ?? null, landing, at };
  }
  // Click ids without utm: the platform is still known.
  if (p.get("fbclid")) return { source: "facebook", medium: "paid_or_social", campaign: null, content: null, landing, at };
  if (p.get("ttclid")) return { source: "tiktok", medium: "cpc", campaign: null, content: null, landing, at };
  if (p.get("gclid")) return { source: "google", medium: "cpc", campaign: null, content: null, landing, at };
  const ref = document.referrer;
  if (!ref) return null;
  try {
    const host = new URL(ref).hostname.replace(/^www\./, "");
    if (host === location.hostname) return null;
    if (SOCIAL[host]) return { source: SOCIAL[host], medium: "social", campaign: null, content: null, landing, at };
    if (SEARCH.some((s) => host.includes(s))) return { source: host.split(".")[0], medium: "organic", campaign: null, content: null, landing, at };
    return { source: host.slice(0, 60), medium: "referral", campaign: null, content: null, landing, at };
  } catch {
    return null;
  }
}

export function visitorId(): string {
  let id = store.get(VISITOR);
  if (!id) {
    id = randomId();
    store.set(VISITOR, id);
  }
  return id;
}

/** The current session, opening a new one when the last was idle for 30 minutes or a new campaign link was followed. */
export function session(): Session {
  const now = Date.now();
  let s: Session | null = null;
  try {
    s = JSON.parse(store.get(SESSION) ?? "null");
  } catch {}
  const here = fromLocation();
  const expired = !s || now - s.last > SESSION_MS;
  const newCampaign = here && s && (here.source !== s.touch.source || here.campaign !== s.touch.campaign) && new URLSearchParams(location.search).has("utm_source");
  if (expired || newCampaign) {
    let touch = here;
    if (touch) store.set(LAST_TOUCH, JSON.stringify(touch));
    else {
      try {
        const last = JSON.parse(store.get(LAST_TOUCH) ?? "null") as Touch | null;
        if (last && now - last.at < TOUCH_MS) touch = { ...last, landing: location.pathname };
      } catch {}
    }
    s = { id: randomId(), last: now, touch: touch ?? { source: "direct", medium: "none", campaign: null, content: null, landing: location.pathname, at: now } };
  } else {
    s!.last = now;
  }
  store.set(SESSION, JSON.stringify(s));
  return s!;
}
