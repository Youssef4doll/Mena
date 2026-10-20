"use server";

import { createHash } from "node:crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { tunisDay } from "@/lib/analytics-range";
import { normName, normSource } from "@/lib/ads/match";
import { MAX_EXPORT_ROWS, MAX_ROW_DAYS, type SpendRow } from "@/lib/ads/platform-csv";

const DAY = 86_400_000;

const ymd = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => s >= "2015-01-01" && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s);
const name = z
  .string()
  .trim()
  .max(120)
  .nullable()
  .transform((s) => s || null);
const count = z.number().int().min(0).max(2_000_000_000).nullable();
const rowSchema = z.object({
  day: ymd,
  days: z.number().int().min(1).max(MAX_ROW_DAYS),
  source: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{2,40}$/),
  campaign: name,
  adSet: name,
  ad: name,
  /** Millimes. The column is a 32-bit integer: two million dinars a row at most. */
  amount: z.number().int().min(1).max(2_000_000_000),
  impressions: count,
  clicks: count,
  reach: count,
  purchases: count,
});
const importSchema = z.object({ rows: z.array(rowSchema).min(1).max(MAX_EXPORT_ROWS), note: z.string().trim().max(200).optional() });

const FIELD_LABELS: Record<string, string> = { day: "date", days: "nombre de jours", source: "source", amount: "montant", campaign: "nom de campagne", adSet: "nom d'ensemble", ad: "nom de publicité" };

export type ImportResult = { ok: true; imported: number; replaced: number; overlaps: number; message: string } | { ok: false; error: string };

type Row = z.output<typeof rowSchema>;

/**
 * Same source, campaign, ad set, ad and days → same key, whatever the case
 * or the amounts: importing an export again (Meta revises yesterday's
 * figures) replaces its rows instead of adding them a second time.
 */
function importKey(r: Row): string {
  return createHash("sha256")
    .update(JSON.stringify([r.source, normName(r.campaign), normName(r.adSet), normName(r.ad), r.day, r.days]))
    .digest("hex");
}

/** Two names may describe the same spend when one is missing (a total) or both match. */
const compatible = (a: string | null, b: string | null) => a == null || b == null || normName(a) === normName(b);

/**
 * Saves the rows of a Meta or TikTok export read by readPlatformExport. The
 * rows come from the browser, so they are checked again here. Rows already
 * imported from the same export are replaced; rows typed by hand are never
 * touched, but the answer says how many imported rows cover the same days as
 * another spend of the same campaign, which would count twice.
 */
export async function importAdSpend(data: { rows: SpendRow[]; note?: string }): Promise<ImportResult> {
  await requireAdmin();
  const parsed = importSchema.safeParse(data);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const [, index, field] = issue?.path ?? [];
    if (typeof index === "number") return { ok: false, error: `Ligne ${index + 1} de l'aperçu : ${FIELD_LABELS[String(field)] ?? "nombre"} invalide.` };
    return { ok: false, error: `Rien à importer, ou plus de ${MAX_EXPORT_ROWS} lignes.` };
  }
  const today = tunisDay(new Date());
  const future = parsed.data.rows.find((r) => r.day > today);
  if (future) return { ok: false, error: `Une ligne commence le ${future.day}, après aujourd'hui : vérifiez les dates du fichier.` };

  // Lines with the same key (an export broken down by age or placement) are added up.
  const rows = new Map<string, Row & { importKey: string }>();
  for (const raw of parsed.data.rows) {
    const r = { ...raw, source: normSource(raw.source) };
    const key = importKey(r);
    const prev = rows.get(key);
    if (!prev) {
      rows.set(key, { ...r, importKey: key });
      continue;
    }
    const add = (a: number | null, b: number | null) => (a == null ? b : b == null ? a : a + b);
    prev.amount += r.amount;
    prev.impressions = add(prev.impressions, r.impressions);
    prev.clicks = add(prev.clicks, r.clicks);
    prev.reach = add(prev.reach, r.reach);
    prev.purchases = add(prev.purchases, r.purchases);
  }
  const list = [...rows.values()];
  if (list.some((r) => r.amount > 2_000_000_000)) return { ok: false, error: "Montant trop grand sur une ligne." };
  const keys = list.map((r) => r.importKey);

  // Other spend of the same campaign (typed by hand, or another export) on the same days.
  const start = (r: { day: string }) => Date.parse(`${r.day}T00:00:00Z`);
  const end = (r: { day: string; days: number }) => start(r) + r.days * DAY;
  const first = Math.min(...list.map(start));
  const last = Math.max(...list.map(end));
  const others = await prisma.adSpend.findMany({
    where: { day: { gte: new Date(first - MAX_ROW_DAYS * DAY), lt: new Date(last) }, OR: [{ importKey: null }, { importKey: { notIn: keys } }] },
    select: { day: true, days: true, source: true, campaign: true, adSet: true, ad: true },
  });
  const overlaps = list.filter((r) =>
    others.some((o) => {
      const od = { day: o.day.toISOString().slice(0, 10), days: o.days };
      return normSource(o.source) === r.source && start(od) < end(r) && start(r) < end(od) && compatible(o.campaign, r.campaign) && compatible(o.adSet, r.adSet) && compatible(o.ad, r.ad);
    }),
  ).length;

  const note = parsed.data.note || "Import";
  const replaced = await prisma.$transaction(
    async (tx) => {
      const gone = await tx.adSpend.deleteMany({ where: { importKey: { in: keys } } });
      for (let i = 0; i < list.length; i += 1000) {
        await tx.adSpend.createMany({
          data: list.slice(i, i + 1000).map((r) => ({
            day: new Date(`${r.day}T00:00:00Z`),
            days: r.days,
            source: r.source,
            campaign: r.campaign,
            adSet: r.adSet,
            ad: r.ad,
            amount: r.amount,
            impressions: r.impressions,
            clicks: r.clicks,
            reach: r.reach,
            purchases: r.purchases,
            note,
            importKey: r.importKey,
          })),
        });
      }
      return gone.count;
    },
    { timeout: 30_000 },
  );

  revalidatePath("/admin/publicites", "layout");
  revalidatePath("/admin/analytics");
  revalidatePath("/admin/depenses");
  const parts = [`${list.length} ligne${list.length > 1 ? "s" : ""} importée${list.length > 1 ? "s" : ""}`];
  if (replaced > 0) parts.push(`${replaced} remplaçai${replaced > 1 ? "ent" : "t"} un import précédent`);
  let message = `${parts.join(", dont ")}.`;
  if (overlaps > 0) {
    message += ` ${overlaps > 1 ? `${overlaps} de ces lignes couvrent` : "Une de ces lignes couvre"} des jours déjà comptés par une autre dépense de la même campagne : vérifiez « Dépenses pub » pour ne pas compter deux fois.`;
  }
  return { ok: true, imported: list.length, replaced, overlaps, message };
}
