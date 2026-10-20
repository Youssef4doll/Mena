import Link from "next/link";
import { KPI_DEFS, kpiValue, whyMissing, type KpiKey, type Kpis } from "@/lib/ads/kpis";
import { VIZ } from "@/lib/viz";
import { change, fixHref, kpiText, missingItems, type Change } from "./format";

/**
 * KPI tiles for the "Publicités" tabs. Server components (no state), usable
 * from client components too.
 *
 *   <KpiTile k={kpis} prev={prevKpis} kpi="costPerDelivered" period={q} />
 *     Label, value and one-line explanation from KPI_DEFS, the change from the
 *     previous period (rates in points, coloured by which way is good), and,
 *     when the value is unknown, what is missing with a link to give it.
 *     `sub` adds a line (a projection, a count); `label` overrides the name.
 *   <Tile label value change? sub? help? missing? />
 *     The same box for a figure that is not a KPI_DEFS key.
 *   <TileGrid>…</TileGrid>   2 columns on phones, 3 then 5 on wider screens.
 *
 * Values use proportional figures (the dataviz rule for standalone numbers);
 * tables keep tabular figures.
 */

const TONE_COLOR: Record<Change["tone"], string> = { good: "#006300", bad: VIZ.critical, neutral: VIZ.muted };

export function Tile({
  label,
  value,
  change: d,
  sub,
  help,
  missing,
}: {
  label: string;
  value: string;
  change?: Change | null;
  sub?: React.ReactNode;
  help?: string;
  missing?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col rounded-2xl border border-line bg-white p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 truncate text-[22px] font-semibold leading-tight text-ink">{value}</p>
      {(d || sub) && (
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
          {d && (
            <span className="font-medium" style={{ color: TONE_COLOR[d.tone] }}>
              {d.text}
            </span>
          )}
          {sub && <span>{sub}</span>}
        </p>
      )}
      {missing && <p className="mt-1 text-xs leading-snug text-[#8a5a00]">{missing}</p>}
      {help && <p className="mt-auto pt-2 text-[11px] leading-snug text-muted">{help}</p>}
    </div>
  );
}

export function KpiTile({ k, prev, kpi, label, sub, period = "", empty = "Rien de mesuré sur la période." }: { k: Kpis; prev?: Kpis | null; kpi: KpiKey; label?: string; sub?: React.ReactNode; period?: string; empty?: string }) {
  const def = KPI_DEFS[kpi];
  const value = kpiValue(k, kpi);
  const missing = value == null ? missingItems(whyMissing(k, kpi)) : [];
  const fix = missing.find((m) => m.fix)?.fix;
  return (
    <Tile
      label={label ?? def.label}
      value={kpiText(k, kpi)}
      change={prev ? change(value, kpiValue(prev, kpi), def.unit, def.better) : null}
      sub={sub}
      help={def.help}
      missing={
        value == null &&
        (missing.length ? (
          <>
            Manque : {missing.map((m) => m.label).join(", ")}.
            {fix && (
              <>
                {" "}
                <Link href={fixHref(fix, period)} className="underline">
                  Corriger
                </Link>
              </>
            )}
          </>
        ) : (
          <span className="text-muted">{empty}</span>
        ))
      }
    />
  );
}

export function TileGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">{children}</div>;
}
