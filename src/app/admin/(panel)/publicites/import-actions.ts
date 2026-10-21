"use server";

import { createHash } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { tunisDay } from "@/lib/analytics-range";
import { formatTND } from "@/lib/money";
import { normName, spendSource } from "@/lib/ads/match";
import { MAX_EXPORT_ROWS, MAX_ROW_DAYS, importKeyText, planImport, type ImportPlan, type SpendRow } from "@/lib/ads/platform-csv";

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
  /** Optional: a page loaded before the account was read sends none. */
  account: name.optional().transform((s) => s ?? null),
  /** Millimes. The column is a 32-bit integer: two million dinars a row at most. */
  amount: z.number().int().min(1).max(2_000_000_000),
  impressions: count,
  clicks: count,
  reach: count,
  purchases: count,
});
const importSchema = z.object({ rows: z.array(rowSchema).min(1).max(MAX_EXPORT_ROWS), note: z.string().trim().max(200).optional() });

const FIELD_LABELS: Record<string, string> = { day: "date", days: "nombre de jours", source: "source", amount: "montant", campaign: "nom de campagne", adSet: "nom d'ensemble", ad: "nom de publicité", account: "compte" };

/** `replaced`: earlier imported rows deleted; `overlaps`: rows kept that share days with the new ones (see planImport). */
export type ImportResult = { ok: true; imported: number; replaced: number; overlaps: ImportPlan["overlaps"]; message: string } | { ok: false; error: string };
/** `warning`: the rows kept on some of the same days, and the campaigns whose spend would drop, in words (null when none). */
export type ImportPreview = { ok: true; replaced: number; overlaps: ImportPlan["overlaps"]; warning: string | null } | { ok: false; error: string };

type Row = z.output<typeof rowSchema> & { importKey: string };
type Db = Prisma.TransactionClient | typeof prisma;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
/** A short hash of the ad account, or null when the export does not name it. */
const accountTag = (account: string | null) => {
  const a = normName(account);
  return a == null ? null : sha256(a).slice(0, 16);
};

/**
 * Same source, campaign, ad set, ad, days and ad account → same key, whatever
 * the case or the amounts: importing an export again (Meta revises
 * yesterday's figures) replaces its rows instead of adding them a second time.
 * When the export names the account, its tag follows the hash after a dot, so
 * a later import can tell another account's rows from its own (keyAccount).
 */
const importKey = (r: z.output<typeof rowSchema>) => {
  const tag = accountTag(r.account);
  return tag ? `${sha256(importKeyText(r))}.${tag}` : sha256(importKeyText(r));
};
/** The account tag a saved key carries: null for a row typed by hand or imported without the account. */
const keyAccount = (key: string | null) => key?.split(".")[1] ?? null;

/** The rows from the browser, checked again, with the lines of one key (an export broken down by age or placement) added up. */
function readRows(data: unknown): { ok: true; rows: Row[]; note: string | undefined } | { ok: false; error: string } {
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

  const rows = new Map<string, Row>();
  for (const raw of parsed.data.rows) {
    const r = { ...raw, source: spendSource(raw.source) };
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
  return { ok: true, rows: list, note: parsed.data.note };
}

/**
 * What saving the rows does to the spend already saved (planImport): the
 * earlier imported rows they replace, the rows kept on some of the same
 * days, and the campaigns whose spend falls. A row with one of the new keys
 * is always replaced.
 */
async function planFor(db: Db, list: Row[]): Promise<ImportPlan> {
  const start = (r: { day: string }) => Date.parse(`${r.day}T00:00:00Z`);
  const first = Math.min(...list.map(start));
  const last = Math.max(...list.map((r) => start(r) + r.days * DAY));
  // A saved row covers at most MAX_ROW_DAYS: one starting earlier cannot reach the file's days.
  const saved = await db.adSpend.findMany({
    where: { day: { gte: new Date(first - MAX_ROW_DAYS * DAY), lt: new Date(last) } },
    select: { id: true, day: true, days: true, source: true, campaign: true, adSet: true, ad: true, amount: true, importKey: true },
  });
  const plan = planImport(
    list.map((r) => ({ ...r, account: accountTag(r.account) })),
    saved.map((s) => ({ ...s, day: s.day.toISOString().slice(0, 10), account: keyAccount(s.importKey), imported: s.importKey != null })),
  );
  const keys = new Set(list.map((r) => r.importKey));
  const sameKey = saved.filter((s) => s.importKey != null && keys.has(s.importKey)).map((s) => s.id);
  return { ...plan, replaced: [...new Set([...plan.replaced, ...sameKey])] };
}

/**
 * The preview's side of the import: how many rows already imported the file
 * would replace, and how many rows it would leave on some of the same days.
 * Nothing is written.
 */
export async function previewImport(data: { rows: SpendRow[] }): Promise<ImportPreview> {
  await requireAdmin();
  const read = readRows(data);
  if (!read.ok) return read;
  const plan = await planFor(prisma, read.rows);
  return { ok: true, replaced: plan.replaced.length, overlaps: plan.overlaps, warning: [overlapText(plan.overlaps), shrinkText(plan.shrinks, false)].filter(Boolean).join(" ") || null };
}

/** Two imports at once: the same keys inserted twice, or the database ending one transaction to let the other through. */
const clash = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && (e.code === "P2002" || e.code === "P2034");

/**
 * Saves the rows of a Meta or TikTok export read by readPlatformExport. The
 * rows come from the browser, so they are checked again here. In one
 * transaction, the earlier imported rows the file supersedes (planImport) are
 * deleted and the new ones written; rows typed by hand are never touched, but
 * the answer says how many rows still share days with the new ones, which
 * would count twice.
 */
export async function importAdSpend(data: { rows: SpendRow[]; note?: string }): Promise<ImportResult> {
  await requireAdmin();
  const read = readRows(data);
  if (!read.ok) return read;
  const list = read.rows;
  const keys = list.map((r) => r.importKey);
  const note = read.note || "Import";

  const save = () =>
    prisma.$transaction(
      async (tx) => {
        const plan = await planFor(tx, list);
        const gone = await tx.adSpend.deleteMany({ where: { OR: [{ id: { in: plan.replaced } }, { importKey: { in: keys } }] } });
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
        return { replaced: gone.count, overlaps: plan.overlaps, shrinks: plan.shrinks };
      },
      { timeout: 30_000 },
    );
  let done: Awaited<ReturnType<typeof save>>;
  try {
    done = await save();
  } catch (e) {
    if (!clash(e)) throw e;
    // The same file sent twice at once: the other import is saved now, and this one replaces it.
    try {
      done = await save();
    } catch (again) {
      if (!clash(again)) throw again;
      return { ok: false, error: "Un autre import des mêmes lignes est en cours. Attendez quelques secondes, puis vérifiez « Dépenses pub » avant de réessayer." };
    }
  }

  revalidatePath("/admin/publicites", "layout");
  revalidatePath("/admin/analytics");
  revalidatePath("/admin/depenses");
  const { replaced, overlaps, shrinks } = done;
  let message = `${list.length} ligne${list.length > 1 ? "s" : ""} importée${list.length > 1 ? "s" : ""}.`;
  if (replaced > 0) message += ` ${replaced} ligne${replaced > 1 ? "s" : ""} d'un import précédent ${replaced > 1 ? "remplacées" : "remplacée"} (même campagne, mêmes jours).`;
  for (const warning of [overlapText(overlaps), shrinkText(shrinks, true)]) if (warning) message += ` ${warning}`;
  return { ok: true, imported: list.length, replaced, overlaps, message };
}

/**
 * The campaigns whose spend on the replaced rows' days falls (planImport's
 * shrinks), with both amounts, or null: before the import (`done` false) and
 * after it. A file filtered to some ads would lose the others' spend.
 */
function shrinkText(shrinks: ImportPlan["shrinks"], done: boolean): string | null {
  if (shrinks.length === 0) return null;
  const MAX = 3;
  const one = (x: ImportPlan["shrinks"][number]) => `« ${x.campaign ?? "sans campagne"} » ${done ? "est passée" : "passerait"} de ${formatTND(x.before)} à ${formatTND(x.after)}`;
  const rest = shrinks.length - MAX;
  const many = shrinks.length > 1;
  const whole = many ? "les campagnes entières" : "la campagne entière";
  return `Sur les jours remplacés, la dépense de ${shrinks.slice(0, MAX).map(one).join(", celle de ")}${rest > 0 ? ` (et ${rest > 1 ? `${rest} autres campagnes` : "une autre campagne"})` : ""}. Si le fichier a été filtré sur certaines publicités, la dépense des autres ${done ? `a été retirée : importez ${whole}` : `serait retirée : exportez ${whole}`}.`;
}

/** The warning for rows kept on some of the imported days, or null. Shown by the preview and after the import. */
function overlapText(o: ImportPlan["overlaps"]): string | null {
  const parts: string[] = [];
  if (o.imported > 0) parts.push(o.imported > 1 ? `${o.imported} lignes d'un import précédent` : "une ligne d'un import précédent");
  if (o.typed > 0) parts.push(o.typed > 1 ? `${o.typed} dépenses saisies à la main` : "une dépense saisie à la main");
  if (parts.length === 0) return null;
  const many = o.imported + o.typed > 1;
  const who = parts.join(" et ");
  return `${who.charAt(0).toUpperCase()}${who.slice(1)} ${many ? "couvrent" : "couvre"} aussi certains de ces jours et ${many ? "restent comptées" : "reste comptée"} : vérifiez « Dépenses pub » pour ne pas compter deux fois.`;
}
