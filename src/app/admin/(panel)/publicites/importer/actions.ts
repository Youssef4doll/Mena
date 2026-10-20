"use server";

import { z } from "zod";
import { requireAdmin } from "@/lib/admin-auth";
import { parseRange } from "@/lib/analytics-range";
import { knownKeys } from "@/lib/ads/data";

/**
 * The import preview's server side: which campaigns and ads of an export the
 * site already saw (visits or orders) on the days the export covers, so the
 * owner sees before importing which spend will meet its traffic and which
 * will stay alone (a link without utm_campaign, or a name spelt differently).
 */

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export type KnownResult = { ok: true; campaigns: string[]; ads: string[] } | { ok: false; error: string };

export async function exportKnownKeys(from: string, to: string): Promise<KnownResult> {
  await requireAdmin();
  const parsed = z.object({ from: ymd, to: ymd }).safeParse({ from, to });
  if (!parsed.success) return { ok: false, error: "Dates illisibles." };
  // Tunis days, `to` included, at most 366 days (parseRange clamps).
  const r = parseRange({ p: "custom", from: parsed.data.from, to: parsed.data.to });
  const keys = await knownKeys(r.from, r.to);
  return { ok: true, ...keys };
}
