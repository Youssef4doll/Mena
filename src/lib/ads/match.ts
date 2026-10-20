/**
 * How a spend row, a visit and an order are recognised as the same source,
 * campaign or ad. Pure and shared by the server (SQL in data.ts does the same
 * thing) and the import preview, so both always agree on what matches.
 *
 * Names are compared trimmed and lowercased: "Lampe-Oct" in Ads Manager is
 * "lampe-oct" in the link. Nothing fuzzier: two campaigns that only differ
 * by a dash stay two campaigns.
 */
import type { Level } from "./types";

/** Short names some links and exports use for the same platform. */
export const SOURCE_ALIASES: Record<string, string> = {
  fb: "facebook",
  "facebook.com": "facebook",
  meta: "facebook",
  ig: "instagram",
  "instagram.com": "instagram",
  tt: "tiktok",
  "tiktok.com": "tiktok",
};

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
