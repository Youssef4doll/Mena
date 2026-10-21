/**
 * How a spend row, a visit and an order are recognised as the same source,
 * campaign or ad. Pure and shared by the server (SQL in data.ts does the same
 * thing) and the import preview, so both always agree on what matches.
 *
 * Names are compared trimmed and lowercased: "Lampe-Oct" in Ads Manager is
 * "lampe-oct" in the link. Nothing fuzzier: two campaigns that only differ
 * by a dash stay two campaigns. Sources are folded the same way ("fb" is
 * "facebook"), and the ad traffic of every Meta app counts for "facebook",
 * where the Meta export's spend is (adSource, spendSource).
 */
import type { Level } from "./types";

/** Short names some links and exports use for the same platform. msg and an are what Meta's {{site_source_name}} writes for Messenger and the Audience Network. */
export const SOURCE_ALIASES: Record<string, string> = {
  fb: "facebook",
  "facebook.com": "facebook",
  meta: "facebook",
  ig: "instagram",
  "instagram.com": "instagram",
  msg: "messenger",
  an: "audience_network",
  tt: "tiktok",
  "tiktok.com": "tiktok",
};

/** Mediums that mean a paid click: what utm_medium usually says, and what the site writes for a click id without utm (paid_or_social). */
export const PAID_MEDIA = ["paid", "cpc", "ppc", "cpm", "cpv", "cpa", "paid_social", "paidsocial", "paid-social", "social_paid", "paid_or_social", "ads", "ad", "sponsored", "display", "retargeting"];

/**
 * Mediums that say the link is not an ad: a profile or bio link, a post, a
 * message, an email. "social" is what the site writes for a visit from a
 * social network without utm; Google Analytics also reads it as organic.
 */
export const ORGANIC_MEDIA = ["social", "social-network", "social-media", "social_media", "sm", "organic", "organic_social", "organic-social", "bio", "profile", "referral", "email", "e-mail", "newsletter", "sms", "chat", "none"];

/** Where the spend of a Meta ad account is saved (the Meta export's source), whatever app the ad ran in. */
export const META_SOURCE = "facebook";

/** The apps one Meta ad runs in (the ad set's placements): the same ad, the same spend, one line of the export. */
export const META_APPS = [META_SOURCE, "instagram", "messenger", "audience_network", "threads"];

/** The characters trimmed on both sides, the same as btrim(x, E' \t\r\n') in SQL. */
const EDGES = /^[ \t\r\n]+|[ \t\r\n]+$/g;

/** A campaign or ad name as it is matched; null when empty. */
export function normName(s: string | null | undefined): string | null {
  const v = (s ?? "").replace(EDGES, "").toLowerCase();
  return v === "" ? null : v;
}

/** A source as it is matched: "Facebook", "fb" → "facebook"; none → "direct". */
export function normSource(s: string | null | undefined): string {
  const v = normName(s);
  return v == null ? "direct" : (SOURCE_ALIASES[v] ?? v);
}

/** Whether a visit or an order came from an ad link: a paid medium, or a utm_campaign whose medium does not say it is organic. */
export function isPaidLink(medium: string | null | undefined, campaign: string | null | undefined): boolean {
  const m = normName(medium);
  if (m != null && PAID_MEDIA.includes(m)) return true;
  return normName(campaign) != null && (m == null || !ORGANIC_MEDIA.includes(m));
}

/**
 * The source a visit or an order is counted for. A Meta ad runs on Facebook,
 * Instagram and Messenger, and the export gives its spend once, saved under
 * "facebook"; a link with {{site_source_name}} says fb, ig or msg depending
 * on where the ad was tapped. So an ad link (isPaidLink) from a Meta app
 * counts for "facebook", where its spend is, and so does spend typed under
 * "instagram" (spendSource): both always meet. Instagram without an ad link
 * stays "instagram": a bio link or a post (medium social, or no utm at all)
 * is not paid traffic. data.ts writes the same rule in SQL.
 */
export function adSource(source: string | null | undefined, medium: string | null | undefined, campaign: string | null | undefined): string {
  const s = normSource(source);
  return META_APPS.includes(s) && isPaidLink(medium, campaign) ? META_SOURCE : s;
}

/** The source a spend row counts for: spend is always an ad's, so spend typed under "instagram" is the Meta account's. */
export function spendSource(source: string | null | undefined): string {
  const s = normSource(source);
  return META_APPS.includes(s) ? META_SOURCE : s;
}

// "|" separates the parts of a key; a name that contains one is escaped.
const esc = (s: string) => s.replace(/%/g, "%25").replace(/\|/g, "%7C");
const unesc = (s: string) => s.replace(/%7C/g, "|").replace(/%25/g, "%");

/**
 * The stable key of a row: "facebook", "facebook|lampe-oct",
 * "facebook|lampe-oct|video-1". Parts are matched names (lowercase); an ad
 * without a campaign gives "facebook||video-1".
 */
export function rowKey(level: Level, source: string | null | undefined, campaign?: string | null, ad?: string | null): string {
  const parts = [esc(normSource(source))];
  if (level !== "source") parts.push(esc(normName(campaign) ?? ""));
  if (level === "ad") parts.push(esc(normName(ad) ?? ""));
  return parts.join("|");
}

/** The parts of a key made by rowKey. */
export function parseRowKey(key: string): { level: Level; source: string; campaign: string | null; ad: string | null } {
  const parts = key.split("|").map(unesc);
  const level: Level = parts.length >= 3 ? "ad" : parts.length === 2 ? "campaign" : "source";
  return { level, source: parts[0] || "direct", campaign: parts[1] || null, ad: parts[2] || null };
}
