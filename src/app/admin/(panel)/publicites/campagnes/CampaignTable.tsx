"use client";

import Link from "next/link";
import { formatTND } from "@/lib/money";
import { fmt } from "@/lib/viz";
import type { RowAdvice, Stage } from "@/lib/ads/advisor";
import { funnelSteps, kpiValue, plural, type KpiKey } from "@/lib/ads/kpis";
import type { AdRow } from "@/lib/ads/types";
import { AD_VERDICTS, CONFIDENCE, kpiText, rowId, rowLabel, sourceLabel, STAGE_STEP, VERDICTS } from "../_ui/format";
import { SortTable, type SortCell, type SortCol, type SortRow } from "../_ui/SortTable";
import { KpiGrid, kpiCell, kpiCol } from "../_ui/cells";
import { Budget, VerdictBadge } from "../_ui/Verdict";
import { FunnelBars, FunnelChips } from "../_ui/Funnel";
import { withPeriod } from "../_ui/range";

/**
 * The Campagnes table. The page sends the engine's figures as plain data
 * (each row and its advice); the cells and the unfolded detail are built
 * here, in the browser, so a page with many campaigns does not carry every
 * detail panel pre-rendered. No figure is computed here.
 *
 *   <CampaignTable items={[{ row, advice, ads: [{ row, advice }] }]} total={{ row, advice }} period={q} />
 *
 * The total line has figures but no verdict: the summed row's verdict does
 * not weigh each campaign's (a wearing ad, a weak stage), and could read as
 * the opposite of the lines above it.
 */

export type Line = { row: AdRow; advice: RowAdvice };
export type CampaignItem = Line & { ads: Line[] };

/** Shown by default, in this order, after the name and the verdict. */
const MAIN: KpiKey[] = ["orderRate", "confirmRate", "deliveryRate"];
const MONEY: KpiKey[] = ["breakEvenCpd", "roasDelivered", "poas", "contribution"];
/** Behind "Toutes les colonnes". */
const EXTRA: KpiKey[] = [
  "projectedCpd", "cpaPlaced", "breakEvenCpa", "costPerConfirmed", "projectedContribution", "profitBeforeAds", "marginPerDelivered", "breakEvenRoas",
  "cpm", "ctr", "cpc", "frequency", "landingRate", "costPerVisit", "viewRate", "formStartRate", "formCompletion",
  "cancelRate", "lateCancelRate", "netDeliveryRate", "openShare", "aov", "unitsPerOrder", "multiUnitShare", "newCustomerShare", "overReporting",
];

const COLS: SortCol[] = [
  { key: "name", label: "Campagne", asc: true },
  { key: "verdict", label: "Verdict", asc: true, help: "Ce que conseille l'analyse : monter, garder, corriger, couper, attendre (pas assez de données) ou réparer la mesure ; avec le changement de budget conseillé et la dépense actuelle par jour." },
  { key: "spend", label: "Dépense", align: "end", help: "Dépense saisie ou importée pour la période." },
  { key: "orders", label: "Commandes", align: "end", help: "Commandes passées depuis cette campagne, et combien sont livrées." },
  ...MAIN.map((k) => kpiCol(k)),
  { key: "cpd", label: "Coût / livrée", align: "end", asc: true, help: "Dépense divisée par les commandes livrées. Quand des commandes sont en cours, la 2e ligne donne la projection : c'est elle que le verdict utilise, et le tri aussi." },
  ...MONEY.map((k) => kpiCol(k)),
  { key: "weak", label: "Point faible", help: "L'étape de l'entonnoir qui coûte le plus cher à cette ligne, comparée au reste du compte ou à la boutique." },
  { key: "visits", label: "Visites", align: "end", extra: true, help: "Visites venues avec ce nom de campagne." },
  ...EXTRA.map((k) => kpiCol(k, { extra: true })),
  { key: "funnel", label: "Entonnoir", sortable: false, extra: true, help: "Part qui passe d'une étape à la suivante, du clic à la livraison. En rouge : le point faible." },
];

export function CampaignTable({ items, total, period, empty }: { items: CampaignItem[]; total: Line | null; period: string; empty: string }) {
  const rows: SortRow[] = items.map((c) => ({ ...tableRow(c, period, "campaign"), sub: c.ads.map((ad) => tableRow(ad, period, "ad")) }));
  const tk = total?.advice.kpis;
  return (
    <SortTable
      cols={COLS}
      rows={rows}
      initial={{ key: "spend", dir: "desc" }}
      empty={empty}
      foot={
        total && tk
          ? {
              name: "Total",
              spend: total.row.platform.spend != null ? formatTND(total.row.platform.spend) : "—",
              orders: fmt(total.row.funnel.orders, "int"),
              ...Object.fromEntries([...MAIN, ...MONEY, ...EXTRA].map((key) => [key, kpiText(tk, key)])),
              cpd: kpiText(tk, "costPerDelivered"),
              visits: fmt(total.row.funnel.sessions, "int"),
            }
          : undefined
      }
    />
  );
}

/** One line of the table, for a campaign or one of its ads: every cell from the engine's figures, and the unfolded detail. */
function tableRow({ row, advice: a }: Line, period: string, level: "campaign" | "ad"): SortRow {
  const k = a.kpis;
  const f = row.funnel;
  const projected = k.projection?.projected ?? false;
  const neck = a.bottleneck;
  const cell = (v: SortCell["v"], node: React.ReactNode): SortCell => ({ v, node });
  const cells: Record<string, SortCell> = {
    name: cell(rowLabel(row), (
      // Narrow on a phone, so the verdict column shows beside the frozen name.
      <span className="block w-[124px] sm:w-[190px]">
        <span className="block break-words font-medium text-ink">{rowLabel(row)}</span>
        <span className="block text-[11px] text-muted">{level === "ad" ? "publicité" : sourceLabel(row.source)}</span>
      </span>
    )),
    verdict: cell(VERDICTS[a.verdict].rank, (
      <span className="flex flex-col items-start gap-1">
        <VerdictBadge verdict={a.verdict} ad={level === "ad"} />
        <Budget change={a.budgetChange} perDay={a.budgetChange && a.spendPerDay != null ? formatTND(a.spendPerDay) : null} />
        {a.verdict === "wait" && a.moreSpend != null ? (
          <span className="whitespace-nowrap text-[11px] text-[#8a5a00]">peu de données : ~{formatTND(a.moreSpend)} de plus</span>
        ) : (
          a.verdict !== "wait" && <span className={`whitespace-nowrap text-[11px] ${a.confidence === "low" ? "text-[#8a5a00]" : "text-muted"}`}>{CONFIDENCE[a.confidence]}</span>
        )}
        {a.trend?.worse && (
          <span className="whitespace-nowrap text-[11px] text-[#8a5a00]" title={trendText(a.trend)}>
            plus cher ces derniers jours
          </span>
        )}
      </span>
    )),
    spend: cell(row.platform.spend, row.platform.spend == null ? <span className="text-muted" title="Aucune dépense saisie ou importée pour cette ligne">—</span> : <span className="whitespace-nowrap">{formatTND(row.platform.spend)}</span>),
    orders: cell(f.orders, (
      <span className="flex flex-col items-end">
        <span>{fmt(f.orders, "int")}</span>
        <span className="whitespace-nowrap text-[11px] text-muted">
          {f.delivered} livrée{f.delivered > 1 ? "s" : ""}
          {f.open > 0 ? ` · ${f.open} en cours` : ""}
        </span>
      </span>
    )),
    cpd: cell(a.judgedCpd ?? null, (
      <span className="flex flex-col items-end">
        {kpiCell(k, "costPerDelivered").node}
        {projected && kpiValue(k, "projectedCpd") != null && <span className="whitespace-nowrap text-[11px] text-muted">proj. {kpiText(k, "projectedCpd")}</span>}
      </span>
    )),
    weak: cell(neck?.factor ?? null, neck ? (
      <span className="block w-[170px] whitespace-normal">
        <span className="block font-medium text-clay">{neck.title}</span>
        <span className="block text-[11px] text-muted">
          {stageText(neck.rate, neck.stage)} contre {stageText(neck.reference, neck.stage)}
        </span>
      </span>
    ) : <span className="text-muted">—</span>),
    visits: cell(f.sessions, fmt(f.sessions, "int")),
    funnel: cell(null, <FunnelChips steps={funnelSteps(row)} weak={neck ? STAGE_STEP[neck.stage] : null} />),
  };
  for (const key of [...MAIN, ...MONEY, ...EXTRA]) cells[key] = kpiCell(k, key);
  // Young lines: the result so far carries the parcels sent and not yet paid; the projection goes under it, as for the cost.
  if (projected && kpiValue(k, "projectedContribution") != null) {
    const now = kpiCell(k, "contribution");
    cells.contribution = cell(now.v, (
      <span className="flex flex-col items-end">
        {now.node}
        <span className="whitespace-nowrap text-[11px] text-muted">proj. {kpiText(k, "projectedContribution")}</span>
      </span>
    ));
  }
  return { key: row.key, id: rowId(row.key), cells, detail: <RowDetail row={row} a={a} period={period} level={level} /> };
}

/** The advisor's recent-cost check in figures: cost per placed order of the last days against the days before, each on its days with a known spend. */
function trendText(t: NonNullable<RowAdvice["trend"]>): string {
  const side = (w: typeof t.recent) => `${plural(w.days, "jour", "jours")}, ${plural(w.orders, "commande", "commandes")}`;
  return `Coût par commande passée : ${formatTND(t.recent.cpa)} sur les derniers jours (${side(t.recent)}), contre ${formatTND(t.base.cpa)} avant (${side(t.base)}).`;
}

/** A stage's rate in its unit: the CPM in money, every other stage in percent. */
function stageText(v: number, stage: Stage): string {
  return stage === "cpm" ? formatTND(Math.round(v)) : fmt(v, "pct");
}

/** The unfolded line: why the verdict, the weak stage and what to do, where people are lost, every figure. */
function RowDetail({ row, a, period, level }: { row: AdRow; a: RowAdvice; period: string; level: "campaign" | "ad" }) {
  const k = a.kpis;
  const neck = a.bottleneck;
  // The figures behind the "plus cher ces derniers jours" mark, which a phone cannot hover; left out
  // when the verdict already rests on them (its reason quotes the recent cost).
  const worse = a.trend?.worse ? a.trend : null;
  const trend = worse && !a.reasons.some((t) => t.includes(formatTND(worse.recent.cpa))) ? worse : null;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-3">
        <div>
          <p className="text-xs font-medium text-muted">Pourquoi « {((level === "ad" ? AD_VERDICTS[a.verdict] : undefined) ?? VERDICTS[a.verdict]).label.toLowerCase()} »</p>
          <ul className="mt-1 flex list-disc flex-col gap-1 ps-4 text-[13px] leading-relaxed text-ink-2">
            {a.reasons.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
        {trend && (
          <p className="text-[13px] leading-relaxed text-[#8a5a00]">
            <span className="font-medium">Plus cher ces derniers jours.</span> {trendText(trend)}
          </p>
        )}
        {neck && (
          <div className="rounded-xl border border-line bg-white p-3 text-[13px] leading-relaxed">
            <p className="font-medium text-clay">{neck.title}</p>
            <p className="text-ink-2">{neck.evidence}</p>
            <p className="mt-1 text-ink">
              <span className="font-medium">À faire : </span>
              {neck.action}
            </p>
          </div>
        )}
        {k.projection?.projected && <p className="text-xs leading-relaxed text-muted">{k.projection.note}</p>}
        <div>
          <p className="text-xs font-medium text-muted">Où les clients se perdent</p>
          <p className="mb-1.5 text-[11px] text-muted">Pourcentage et barre : la part de l&apos;étape d&apos;avant qui passe à celle-ci.</p>
          <FunnelBars steps={funnelSteps(row)} weak={neck ? STAGE_STEP[neck.stage] : null} />
        </div>
        {level === "campaign" && (
          <Link href={withPeriod(`/admin/publicites/creatives?c=${encodeURIComponent(row.key)}`, period)} className="inline-flex min-h-10 items-center self-start text-[13px] font-medium text-sea underline">
            Comparer ses publicités
          </Link>
        )}
      </div>
      <KpiGrid k={k} period={period} />
    </div>
  );
}
