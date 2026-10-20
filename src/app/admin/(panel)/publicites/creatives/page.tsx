import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";
import { formatTND } from "@/lib/money";
import { fmt } from "@/lib/viz";
import { adRows, dailyByRow } from "@/lib/ads/data";
import { advise, compareAds, creativeInsights, sortInsights, type AdComparison, type AdMetric, type RowAdvice } from "@/lib/ads/advisor";
import { rowKey } from "@/lib/ads/match";
import type { AdRow, Insight } from "@/lib/ads/types";
import { Badge, Card, Empty } from "@/components/admin/ui";
import { adRange, periodText, rangeQuery, withPeriod } from "../_ui/range";
import { adsBasics } from "../_ui/server";
import { chanceText, FIX_LINKS, fixHref, sourceLabel, valueText, type KpiUnit } from "../_ui/format";
import { VerdictBadge } from "../_ui/Verdict";
import { IntervalBar } from "../_ui/Interval";
import { InsightList } from "../_ui/Insight";

export const metadata = { title: "Créatives · Publicités" };

/** What the ads can be compared on: what decides (the cost per delivered order), then the rates that say why. */
/** "1 visite", "7 097 visites". */
const count = (n: number, one: string, many: string) => `${fmt(n, "int")} ${n > 1 ? many : one}`;

const METRICS: Record<AdMetric, { label: string; unit: KpiUnit; n: (n: number) => string; interval: string; best: string }> = {
  // The cost is read on projected deliveries, which are rarely whole: "environ 59 livrées".
  cost: { label: "Coût par livrée", unit: "money", n: (n) => (Number.isInteger(n) ? count(n, "livrée", "livrées") : `environ ${count(Math.round(n), "livrée", "livrées")}, projection comprise`), interval: "90 %", best: "la moins chère par livrée" },
  orderRate: { label: "Taux de commande", unit: "rate", n: (n) => count(n, "visite", "visites"), interval: "95 %", best: "celle qui fait le plus commander" },
  ctr: { label: "CTR lien", unit: "rate", n: (n) => count(n, "affichage", "affichages"), interval: "95 %", best: "celle qui fait le plus cliquer" },
  confirmRate: { label: "Confirmation", unit: "rate", n: (n) => count(n, "commande appelée", "commandes appelées"), interval: "95 %", best: "celle dont les commandes se confirment le mieux" },
  deliveryRate: { label: "Livraison", unit: "rate", n: (n) => count(n, "colis arrivé au bout", "colis arrivés au bout"), interval: "95 %", best: "celle dont les colis sont le mieux acceptés" },
};
const METRIC_KEYS = Object.keys(METRICS) as AdMetric[];

/** Room left at the end of a list's scale, so the widest range does not touch the edge. */
const SCALE_ROOM = 1.1;

type Group = { key: string; label: string; source: string; rows: AdRow[] };

/**
 * Créatives: the ads (utm_content) of each campaign side by side on one
 * metric, with the range where the true value probably is and the chance of
 * each being the best; the ads that wear out (daily trend); and what to test
 * next. Ads are compared inside their campaign: two campaigns sell different
 * products to different people.
 */
export default async function CreativesPage({ searchParams }: PageProps<"/admin/publicites/creatives">) {
  await requireAdmin();
  const sp = await searchParams;
  const r = adRange(sp);
  const q = rangeQuery(r);
  const metric: AdMetric = METRIC_KEYS.find((m) => m === sp.m) ?? "cost";
  const only = typeof sp.c === "string" ? sp.c : null;
  const [ads, daily, { costs, baseline, tracking }] = await Promise.all([adRows(r.from, r.to, "ad"), dailyByRow(r.from, r.to, "ad"), adsBasics(r.to)]);
  const report = advise({ rows: ads, costs, baseline, days: r.days, daily, tracking });
  const advice = new Map(report.rows.map((a) => [a.key, a]));

  const groups = new Map<string, Group>();
  for (const ad of ads) {
    const key = rowKey("campaign", ad.source, ad.campaign);
    const g = groups.get(key) ?? { key, label: ad.campaign ?? "Sans campagne", source: ad.source, rows: [] };
    g.rows.push(ad);
    groups.set(key, g);
  }
  const all = [...groups.values()];
  const shown = only ? all.filter((g) => g.key === only) : all;
  const here = (m: AdMetric, c: string | null) => {
    const parts = [m !== "cost" ? `m=${m}` : "", c ? `c=${encodeURIComponent(c)}` : ""].filter(Boolean);
    return withPeriod(`/admin/publicites/creatives${parts.length ? `?${parts.join("&")}` : ""}`, q);
  };
  // Visits carry the ad's name only since that capture was added; orders always did.
  const noVisits = ads.filter((x) => x.funnel.orders > 0 && x.funnel.sessions === 0).length;

  // Per campaign: the comparison, and the advice about its ads (the creative read first, then each ad's).
  const blocks = shown.map((g) => {
    const keys = new Set(g.rows.map((x) => x.key));
    const own = creativeInsights(g.rows, costs, baseline);
    // The report also names each campaign's best ad: keep one copy.
    const theirs = report.insights.filter((i) => i.key != null && keys.has(i.key) && !own.some((o) => o.key === i.key && o.title === i.title));
    const insights = sortInsights([...own, ...theirs]);
    return { g, comps: compareAds(g.rows, metric, costs, baseline), insights };
  });
  const next = dedupe(blocks.flatMap((b) => b.insights.filter((i) => i.fix === "brief")));

  if (ads.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <Empty>
          Aucune publicité reconnue {periodText(r)}. Une publicité apparaît ici quand ses liens portent utm_content (le nom de la publicité) : les commandes et les visites qui en viennent, et la dépense importée par publicité.
        </Empty>
        <Link href={withPeriod("/admin/publicites/idees#liens", q)} className="inline-flex min-h-10 items-center self-start text-[13px] font-medium text-sea underline">
          Créer des liens avec le nom de chaque publicité
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted">
        Période {periodText(r)}. Les publicités sont comparées dans leur campagne.
        {noVisits > 0 && ` ${noVisits} publicité${noVisits > 1 ? "s ont" : " a"} des commandes sans visite comptée : les visites ne portent le nom de la publicité que depuis peu, ces lignes sont jugées sur leurs commandes.`}
      </p>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Comparer sur">
          <span className="flex w-full items-center text-xs text-muted sm:w-auto sm:pe-1">Comparer sur</span>
          {METRIC_KEYS.map((m) => (
            <Link key={m} href={here(m, only)} aria-current={m === metric ? "true" : undefined} className={`flex min-h-10 items-center rounded-full border px-3 text-[13px] ${m === metric ? "border-ink bg-ink text-white" : "border-line bg-white text-ink-2"}`}>
              {METRICS[m].label}
            </Link>
          ))}
        </div>
        {all.length > 1 && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Campagne">
            <span className="flex w-full items-center text-xs text-muted sm:w-auto sm:pe-1">Campagne</span>
            <Link href={here(metric, null)} aria-current={only == null ? "true" : undefined} className={`flex min-h-10 items-center rounded-full border px-3 text-[13px] ${only == null ? "border-sea bg-sea-soft font-medium text-sea-2" : "border-line bg-white text-ink-2"}`}>
              Toutes
            </Link>
            {all.map((g) => (
              <Link key={g.key} href={here(metric, g.key)} title={g.label} aria-current={only === g.key ? "true" : undefined} className={`flex min-h-10 max-w-full items-center rounded-full border px-3 text-[13px] ${only === g.key ? "border-sea bg-sea-soft font-medium text-sea-2" : "border-line bg-white text-ink-2"}`}>
                <span className="truncate">{g.label}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs leading-relaxed text-muted">
        Barre : là où se trouve probablement la vraie valeur ({METRICS[metric].interval} de chances), plus étroite avec plus de données. Point : la valeur mesurée.
        {metric === "cost" && " Trait pointillé : le coût max par livrée."} « Chance d&apos;être la meilleure » : probabilité tirée des chiffres de la période, donnée quand chaque publicité a assez de données.
      </p>

      {shown.length === 0 && <Empty>Cette campagne n&apos;a pas de publicité reconnue sur la période.</Empty>}

      <div className="grid gap-4 xl:grid-cols-2">
        {blocks.map(({ g, comps, insights }) => (
          <Card
            key={g.key}
            title={g.label}
            hint={`${sourceLabel(g.source)} · ${g.rows.length} publicité${g.rows.length > 1 ? "s" : ""}${spendText(g.rows)}`}
            aside={
              g.key !== only && all.length > 1 ? (
                <Link href={here(metric, g.key)} className="inline-flex min-h-10 items-center text-[13px] text-sea underline">
                  Afficher seule
                </Link>
              ) : undefined
            }
          >
            <Comparison comps={comps} metric={metric} advice={advice} />
            {insights.length > 0 && (
              <div className="mt-4 border-t border-line pt-3">
                <InsightList insights={insights} limit={2} period={q} />
              </div>
            )}
          </Card>
        ))}
      </div>

      <Card title="À tester ensuite" hint="Les publicités qui s'usent ou qui gagnent, et ce qu'il faut préparer pour elles.">
        {next.length > 0 ? (
          <InsightList insights={next} limit={4} period={q} />
        ) : (
          <p className="text-sm text-muted">Aucune publicité ne demande de relève pour l&apos;instant.</p>
        )}
        <Link href={fixHref("brief", q)} className="mt-2 inline-flex min-h-10 items-center text-[13px] font-medium text-sea underline">
          {FIX_LINKS.brief.label} : angles, accroches et textes par produit
        </Link>
      </Card>
    </div>
  );
}

/** " · 120,000 DT dépensés" when the campaign's ads have spend. */
function spendText(rows: AdRow[]): string {
  const known = rows.filter((x) => x.platform.spend != null);
  if (known.length === 0) return " · dépense par publicité non importée";
  return ` · ${formatTND(known.reduce((s, x) => s + (x.platform.spend ?? 0), 0))} dépensés`;
}

/** The ads of one campaign on one metric: best odds first, each with its range on a shared scale. */
function Comparison({ comps, metric, advice }: { comps: AdComparison[]; metric: AdMetric; advice: Map<string, RowAdvice> }) {
  const m = METRICS[metric];
  const ordered = [...comps].sort((a, b) => (b.probBest ?? -1) - (a.probBest ?? -1) || (b.n ?? 0) - (a.n ?? 0));
  const targets = comps.map((c) => (metric === "cost" ? (advice.get(c.key)?.target ?? null) : null));
  const ends = comps.flatMap((c, i) => [c.high, c.value, targets[i]]).filter((v): v is number => v != null && Number.isFinite(v));
  const max = ends.length ? Math.max(...ends) * SCALE_ROOM : null;
  const scale = m.unit === "rate" && max != null ? Math.min(1, max) : max;
  const single = comps.length < 2;
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y divide-line">
        {ordered.map((c) => {
          const a = advice.get(c.key);
          const target = metric === "cost" ? (a?.target ?? null) : null;
          const fat = a?.fatigue && a.fatigue.level !== "none" ? a.fatigue : null;
          return (
            <li key={c.key} className="flex flex-col gap-1.5 py-3 first:pt-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-words text-[13px] font-medium text-ink">{c.label}</p>
                  <p className="text-xs text-muted">
                    {m.label} : <span className="font-medium text-ink">{valueText(c.value, m.unit)}</span>
                    {c.low != null && ` (entre ${valueText(c.low, m.unit)} et ${c.high == null ? "plus" : valueText(c.high, m.unit)})`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {fat && (
                    <span title={fat.evidence}>
                      <Badge tone={fat.level === "clear" ? "warn" : "info"}>{fat.level === "clear" ? "S'use" : "Début d'usure"}</Badge>
                    </span>
                  )}
                  {a && <VerdictBadge verdict={a.verdict} ad />}
                </div>
              </div>
              <IntervalBar value={c.value} low={c.low} high={c.high} max={scale} unit={m.unit} target={target} label={c.label} />
              <p className="text-xs text-ink-2">
                {single ? (
                  <span className="text-muted">Seule publicité de la campagne : rien à comparer.</span>
                ) : c.enough && c.probBest != null ? (
                  <>
                    Chance d&apos;être {m.best} : <strong className="font-semibold text-ink">{chanceText(c.probBest)}</strong>
                  </>
                ) : (
                  <span className="text-[#8a5a00]">Pas assez de données pour comparer</span>
                )}
                <span className="text-muted"> · sur {m.n(c.n)}</span>
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The same advice once, even when two campaigns raise it. */
function dedupe(list: Insight[]): Insight[] {
  const seen = new Set<string>();
  return list.filter((i) => {
    const id = `${i.key}|${i.title}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
