import type { FunnelStep } from "@/lib/ads/kpis";
import { fmt, VIZ } from "@/lib/viz";
import { STEP_SHORT } from "./format";

/**
 * Where people are lost, from funnelSteps(row) (src/lib/ads/kpis.ts).
 *
 *   <FunnelBars steps={funnelSteps(row)} weak="formStarts" />
 *     One line per step: its count and, after it, the share of the step
 *     before that reached it, drawn as a meter (say so in the card's hint).
 *     The weak step (the advisor's bottleneck, mapped with STAGE_STEP) is
 *     drawn in the critical colour and labelled.
 *     Steps the platform figures would give (affichages, clics) say "non
 *     importé" when they are missing.
 *   <FunnelChips steps={…} weak={…} />
 *     The same rates in one compact line for a table cell: "Clic 1,2 % › Arrivée 85 % › …".
 *
 * Rates come from the engine; nothing is computed here.
 */

type Weak = FunnelStep["key"] | null | undefined;

export function FunnelBars({ steps, weak }: { steps: FunnelStep[]; weak?: Weak }) {
  return (
    <ol className="flex flex-col gap-2.5">
      {steps.map((s, i) => {
        const prev = steps[i - 1];
        const isWeak = s.key === weak;
        return (
          <li key={s.key}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
              <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-ink-2">
                <span>{s.label}</span>
                {isWeak && <span className="rounded-full bg-clay-soft px-1.5 py-0.5 text-[11px] font-medium text-clay">point faible</span>}
              </span>
              <span className="shrink-0 tabular-nums" title={s.rate != null && prev ? `${fmt(s.rate, "pct")} de « ${prev.label.toLowerCase()} »` : undefined}>
                {s.count == null ? (
                  <span className="text-xs text-muted">non importé</span>
                ) : (
                  <>
                    <strong className="font-semibold text-ink">{fmt(s.count, "int")}</strong>
                    {s.rate != null && prev && <span className={`ms-2 text-xs ${isWeak ? "font-medium text-clay" : "text-muted"}`}>{fmt(s.rate, "pct")}</span>}
                  </>
                )}
              </span>
            </div>
            {s.rate != null && (
              <div className="h-2 rounded-full" style={{ background: isWeak ? "#f7eae3" : "#e8f1fb" }} role="img" aria-label={`${s.label} : ${fmt(s.rate, "pct")} de l'étape d'avant`}>
                <div className="h-2 rounded-full" style={{ width: `${Math.max(s.rate > 0 ? 1.5 : 0, Math.min(1, s.rate) * 100)}%`, background: isWeak ? VIZ.critical : VIZ.s1 }} />
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function FunnelChips({ steps, weak }: { steps: FunnelStep[]; weak?: Weak }) {
  const shown = steps.filter((s, i) => s.rate != null && steps[i - 1]?.count != null);
  if (shown.length === 0) return <span className="text-xs text-muted">—</span>;
  return (
    <ol className="flex items-center gap-1 whitespace-nowrap text-[11px]">
      {shown.map((s, i) => {
        const prev = steps[steps.indexOf(s) - 1];
        const isWeak = s.key === weak;
        return (
          <li key={s.key} className="flex items-center gap-1">
            {i > 0 && <span className="text-muted" aria-hidden>›</span>}
            <span title={`${s.label} : ${fmt(s.rate, "pct")} de « ${prev.label.toLowerCase()} »`} className={`rounded-md px-1.5 py-0.5 ${isWeak ? "bg-clay-soft text-clay" : "bg-sand text-ink-2"}`}>
              <span className={isWeak ? "" : "text-muted"}>{STEP_SHORT[s.key]}</span> <span className="font-medium tabular-nums">{fmt(s.rate, "pct")}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
