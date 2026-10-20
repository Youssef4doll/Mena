import { INPUT_LABELS, KPI_DEFS, kpiValue, whyMissing, type KpiKey, type Kpis } from "@/lib/ads/kpis";
import type { SortCell, SortCol } from "./SortTable";
import { kpiText } from "./format";
import { MissingNote } from "./Missing";

/**
 * KPIs as table cells and as a detail grid, from the engine's Kpis.
 *
 *   kpiCol("cpaPlaced", { extra: true })  → SortCol   label and help from KPI_DEFS; costs sort cheapest first
 *   kpiCell(k, "cpaPlaced")               → SortCell  value and its text; "—" titled with what is missing
 *   <KpiGrid k={k} groups={KPI_GROUPS} period={q} legend? />   every KPI by family, with what is missing;
 *     `legend` adds each KPI's one-line help as a tooltip and a list under it. Leave it off when
 *     the grid repeats (a detail panel per table row) and the table's own legend explains the columns.
 *   KPI_GROUPS                            every KpiKey, by family (platform, landing, shop, cash on delivery, basket, money)
 *   MARGIN_BASIS[basis]                   where the margin per delivered order comes from, in words
 */

export function kpiCol(key: KpiKey, opts: Partial<SortCol> = {}): SortCol {
  const def = KPI_DEFS[key];
  return { key, label: def.label, help: def.help, align: "end", asc: def.better === "lower", ...opts };
}

export function kpiCell(k: Kpis, key: KpiKey): SortCell {
  const v = kpiValue(k, key);
  if (v != null) return { v, node: <span className="whitespace-nowrap">{kpiText(k, key)}</span> };
  const missing = whyMissing(k, key).map((m) => INPUT_LABELS[m]);
  return { v: null, node: <span className="text-muted" title={missing.length ? `Manque : ${missing.join(", ")}` : "Rien de mesuré sur la période"}>—</span> };
}

export const KPI_GROUPS: { title: string; keys: KpiKey[] }[] = [
  { title: "Argent", keys: ["costPerDelivered", "projectedCpd", "breakEvenCpd", "cpaPlaced", "breakEvenCpa", "costPerConfirmed", "roasDelivered", "breakEvenRoas", "poas", "marginPerDelivered", "profitBeforeAds", "contribution", "projectedContribution", "projectedDelivered"] },
  { title: "Paiement à la livraison", keys: ["confirmRate", "cancelRate", "deliveryRate", "netDeliveryRate", "openShare"] },
  { title: "Sur la boutique", keys: ["orderRate", "viewRate", "formStartRate", "formCompletion"] },
  { title: "Arrivée sur la boutique", keys: ["landingRate", "costPerVisit"] },
  { title: "Plateforme", keys: ["cpm", "ctr", "cpc", "frequency", "overReporting"] },
  { title: "Panier et clients", keys: ["aov", "unitsPerOrder", "multiUnitShare", "newCustomerShare"] },
];

export const MARGIN_BASIS: Record<NonNullable<Kpis["marginBasis"]>, string> = {
  row: "marge des commandes livrées de cette ligne",
  blend: "marge de cette ligne, ajustée sur celle de la boutique (peu de livrées)",
  shop: "marge moyenne d'une livrée de la boutique sur 180 jours (pas encore de livrée au coût connu sur cette ligne)",
  account: "marge moyenne des commandes livrées du compte sur la période (pas encore de livrée sur cette ligne)",
};

export function KpiGrid({ k, groups = KPI_GROUPS, period = "", legend = false }: { k: Kpis; groups?: { title: string; keys: KpiKey[] }[]; period?: string; legend?: boolean }) {
  const keys = groups.flatMap((g) => g.keys);
  const missing = [...new Set(keys.flatMap((key) => (kpiValue(k, key) == null ? whyMissing(k, key) : [])))];
  return (
    <div className="@container flex min-w-0 flex-col gap-3">
      {groups.map((g) => (
        <div key={g.title}>
          <p className="mb-1 text-xs font-medium text-muted">{g.title}</p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 @md:grid-cols-3 @2xl:grid-cols-5">
            {g.keys.map((key) => {
              const v = kpiValue(k, key);
              return (
                <div key={key} className="min-w-0" title={legend ? KPI_DEFS[key].help : undefined}>
                  <dt className="text-[11px] leading-snug text-muted">{KPI_DEFS[key].label}</dt>
                  <dd className={`text-[13px] font-medium tabular-nums ${v == null ? "text-muted" : "text-ink"}`}>{kpiText(k, key)}</dd>
                </div>
              );
            })}
          </dl>
        </div>
      ))}
      {k.marginBasis && <p className="text-xs text-muted">Coût max et marge calculés sur la {MARGIN_BASIS[k.marginBasis]}.</p>}
      <MissingNote inputs={missing} period={period} />
      {legend && (
        <details className="text-xs">
          <summary className="flex min-h-10 cursor-pointer items-center text-muted">Ce que veulent dire ces chiffres</summary>
          <dl className="grid gap-x-6 gap-y-1.5 pb-1 @2xl:grid-cols-2">
            {keys.map((key) => (
              <div key={key}>
                <dt className="inline font-medium text-ink">{KPI_DEFS[key].label} : </dt>
                <dd className="inline text-ink-2">{KPI_DEFS[key].help}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </div>
  );
}
