import { formatTND } from "@/lib/money";
import { fmt } from "@/lib/viz";
import { delta } from "@/lib/analytics-range";
import { INPUT_LABELS, KPI_DEFS, kpiValue, type FunnelStep, type Input, type KpiDef, type KpiKey, type Kpis } from "@/lib/ads/kpis";
import type { Stage } from "@/lib/ads/advisor";
import type { AdRow, Advice, Fix, Severity, Verdict } from "@/lib/ads/types";

/**
 * Words and number formats shared by every "Publicités" tab, so a verdict,
 * a missing input or a KPI reads the same everywhere. Pure, safe in client
 * components. No KPI is computed here: values come from the engine
 * (src/lib/ads/kpis.ts, advisor.ts); this only writes them.
 *
 *   valueText(v, unit)            → "12,400 DT" | "3,2 %" | "2,45×" | "1,8" | "—"
 *   kpiText(k, key)               → the same for one KPI of a Kpis
 *   change(cur, prev, unit, better) → { text: "▲ 12 %" | "▼ 3,1 pt" | "stable", tone } | null
 *   chanceText(p)                 → "72 %" | "plus de 99 %" | "moins de 1 %"   a probability without false certainty
 *   VERDICTS[verdict]             → { label, tone, rank, hint }   rank: most urgent first when sorted ascending
 *   CONFIDENCE[confidence]        → "confiance faible" …
 *   budgetText(change)            → "+20 %" | "−30 %" | "Pause" | "Inchangé" | "—"
 *   SEVERITIES[severity]          → { label, tone, edge }
 *   FIX_LINKS[fix], fixHref(fix, period) where an insight sends the owner
 *   INPUT_FIX[input], missingItems(inputs), MISSING_GROUPS   what a missing input needs, and where
 *   STAGE_STEP[stage], STEP_SHORT[step]   advisor stage → funnel step, short step names
 *   rowLabel(row), sourceLabel(source), rowId(key)   rowId: a DOM id for a row key, for links (#…)
 *   coverage(rows)                → { orders, tagged }   orders carrying a source, for trackingInsights
 */

export type KpiUnit = KpiDef["unit"];
/** The Badge tones of the admin UI kit. */
export type Tone = "neutral" | "warn" | "danger" | "ok" | "info";

const dec = (v: number, max: number) => v.toLocaleString("fr-FR", { maximumFractionDigits: max });

/** One value in its unit; "—" when it is unknown. */
export function valueText(v: number | null | undefined, unit: KpiUnit): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (unit === "money") return formatTND(Math.round(v));
  if (unit === "rate") return fmt(v, "pct");
  if (unit === "multiple") return `${dec(v, Math.abs(v) >= 10 ? 1 : 2)}×`;
  return dec(v, 1);
}

export function kpiText(k: Kpis, key: KpiKey): string {
  return valueText(kpiValue(k, key), KPI_DEFS[key].unit);
}

/** A probability as the advisor writes it: never "100 %" or "0 %". */
export function chanceText(p: number | null | undefined): string {
  if (p == null || !Number.isFinite(p)) return "—";
  return p > 0.99 ? "plus de 99 %" : p < 0.01 ? "moins de 1 %" : fmt(p, "pct");
}

export type Change = { text: string; tone: "good" | "bad" | "neutral" };

/**
 * The change from the previous period. Rates move in points (a confirmation
 * rate going from 60 % to 66 % is "+6 pt", not "+10 %"); money that is or was
 * negative moves in money (a loss turning into a profit has no sensible
 * percentage); everything else in percent. Null when either side is unknown
 * or the previous value is 0.
 */
export function change(cur: number | null | undefined, prev: number | null | undefined, unit: KpiUnit, better: KpiDef["better"]): Change | null {
  if (cur == null || prev == null || !Number.isFinite(cur) || !Number.isFinite(prev)) return null;
  const tone = (up: boolean): Change["tone"] => (better == null ? "neutral" : (better === "higher") === up ? "good" : "bad");
  const arrow = (up: boolean) => (up ? "▲" : "▼");
  if (unit === "rate") {
    const pts = (cur - prev) * 100;
    if (Math.abs(pts) < 0.05) return { text: "stable", tone: "neutral" };
    return { text: `${arrow(pts > 0)} ${dec(Math.abs(pts), Math.abs(pts) < 10 ? 1 : 0)} pt`, tone: tone(pts > 0) };
  }
  if (unit === "money" && (cur < 0 || prev <= 0)) {
    const diff = cur - prev;
    if (diff === 0) return { text: "stable", tone: "neutral" };
    return { text: `${arrow(diff > 0)} ${formatTND(Math.abs(Math.round(diff)))}`, tone: tone(diff > 0) };
  }
  const d = delta(cur, prev);
  if (d == null) return null;
  if (Math.abs(d) < 0.005) return { text: "stable", tone: "neutral" };
  return { text: `${arrow(d > 0)} ${fmt(Math.abs(d), "pct")}`, tone: tone(d > 0) };
}

export const VERDICTS: Record<Verdict, { label: string; tone: Tone; rank: number; hint: string }> = {
  cut: { label: "Couper", tone: "danger", rank: 0, hint: "Perd de l'argent avec assez de données pour le dire : mettre en pause." },
  tracking: { label: "Mesure cassée", tone: "danger", rank: 1, hint: "La dépense ne retrouve pas ses visites : le lien ou ses UTM sont à revoir avant de juger." },
  fix: { label: "À corriger", tone: "warn", rank: 2, hint: "Trop chère par livrée, avec une étape à réparer." },
  wait: { label: "Attendre", tone: "neutral", rank: 3, hint: "Pas encore assez de données pour juger." },
  keep: { label: "Garder", tone: "info", rank: 4, hint: "Sous le coût max, sans assez de marge ou de certitude pour monter." },
  scale: { label: "Monter", tone: "ok", rank: 5, hint: "Rentable avec de la marge : monter le budget par petits paliers." },
};

export const CONFIDENCE: Record<Advice["confidence"], string> = { low: "confiance faible", medium: "confiance moyenne", high: "confiance élevée" };

/** The advisor's budget change in words: −100 % is a pause. */
export function budgetText(change: number | null | undefined): string {
  if (change == null) return "—";
  if (change <= -100) return "Pause";
  if (change === 0) return "Inchangé";
  return change > 0 ? `+${change} %` : `−${Math.abs(change)} %`;
}

export const SEVERITIES: Record<Severity, { label: string; tone: Tone; edge: string }> = {
  critical: { label: "Urgent", tone: "danger", edge: "border-s-clay" },
  warning: { label: "À surveiller", tone: "warn", edge: "border-s-amber-2" },
  good: { label: "Bon signe", tone: "ok", edge: "border-s-olive" },
  info: { label: "Info", tone: "info", edge: "border-s-sea" },
};

/** Back-office pages behind an insight's `fix`. The Idées tab carries the ads' link builder under #liens. */
export const FIX_LINKS: Record<Fix, { href: string; label: string }> = {
  costs: { href: "/admin/parametres", label: "Renseigner les coûts" },
  tracking: { href: "/admin/parametres", label: "Régler le suivi" },
  spend: { href: "/admin/depenses", label: "Saisir une dépense" },
  import: { href: "/admin/publicites/importer", label: "Importer un export" },
  productCost: { href: "/admin/produits", label: "Coûts des produits" },
  links: { href: "/admin/publicites/idees#liens", label: "Créer le bon lien" },
  brief: { href: "/admin/publicites/idees", label: "Préparer des créatives" },
};

/** A fix link; the period follows when it stays in the ads section. */
export function fixHref(fix: Fix, period = ""): string {
  const href = FIX_LINKS[fix].href;
  if (!period || !href.startsWith("/admin/publicites")) return href;
  const [path, hash] = href.split("#");
  return `${path}?${period}${hash != null ? `#${hash}` : ""}`;
}

/** Where each missing input is given. The shop's own rates need no action: they appear with the first finished orders. */
export const INPUT_FIX: Record<Input, Fix | null> = {
  spend: "import",
  impressions: "import",
  clicks: "import",
  reach: "import",
  purchases: "import",
  productCost: "productCost",
  carrierCost: "costs",
  returnCost: "costs",
  baseline: null,
};

/** Missing inputs by what they unlock, the ones that decide the money first. */
export const MISSING_GROUPS: { title: string; inputs: Input[] }[] = [
  { title: "Pour le coût par livrée et la marge", inputs: ["spend", "productCost", "carrierCost", "returnCost"] },
  { title: "Pour le CTR, le CPM et la fréquence", inputs: ["impressions", "clicks", "reach"] },
  { title: "Pour comparer avec le pixel", inputs: ["purchases"] },
  { title: "Pour les projections", inputs: ["baseline"] },
];

const INPUT_ORDER = MISSING_GROUPS.flatMap((g) => g.inputs);

/** Each missing input once, in the order above, with its French label and where to fix it. */
export function missingItems(inputs: Input[]): { input: Input; label: string; fix: Fix | null }[] {
  const set = new Set(inputs);
  return INPUT_ORDER.filter((i) => set.has(i)).map((input) => ({ input, label: INPUT_LABELS[input], fix: INPUT_FIX[input] }));
}

/** The funnel step an advisor stage is read on (the stage's rate is that step over the one before). */
export const STAGE_STEP: Record<Stage, FunnelStep["key"]> = {
  cpm: "impressions",
  ctr: "clicks",
  landing: "sessions",
  view: "productViews",
  formStart: "formStarts",
  formCompletion: "orders",
  confirmation: "confirmed",
  delivery: "delivered",
};

export const STEP_SHORT: Record<FunnelStep["key"], string> = {
  impressions: "Affich.",
  clicks: "Clic",
  sessions: "Arrivée",
  productViews: "Fiche",
  formStarts: "Form.",
  orders: "Cmd",
  confirmed: "Conf.",
  delivered: "Livr.",
};

/** The name a row is known by: the ad, else the campaign, else the source. */
export function rowLabel(row: Pick<AdRow, "source" | "campaign" | "ad">): string {
  return row.ad ?? row.campaign ?? sourceLabel(row.source);
}

const SOURCES: Record<string, string> = { facebook: "Facebook (Meta)", instagram: "Instagram", tiktok: "TikTok", google: "Google", snapchat: "Snapchat", whatsapp: "WhatsApp", direct: "Sans source" };

export function sourceLabel(source: string): string {
  return SOURCES[source] ?? source;
}

/** "r-facebook-lampe-oct" for "facebook|lampe-oct": letters, digits and dashes only, so it works after a "#". */
export function rowId(key: string): string {
  return `r-${key.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

/** Orders of the period and those that carry a source (anything but "direct"): how well the links are tagged. */
export function coverage(rows: AdRow[]): { orders: number; tagged: number } {
  let orders = 0;
  let tagged = 0;
  for (const r of rows) {
    orders += r.funnel.orders;
    if (r.source !== "direct") tagged += r.funnel.orders;
  }
  return { orders, tagged };
}
