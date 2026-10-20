import { VIZ } from "@/lib/viz";
import { valueText, type KpiUnit } from "./format";

/**
 * A measured value with its uncertainty, on a scale shared by the lines of
 * one list, so the lines compare by eye: the range (where the true value
 * probably is) as a pale bar, the value as a dot, and an optional target as
 * a dashed tick (the max cost per delivered order, a shop rate).
 *
 *   <IntervalBar value={0.031} low={0.02} high={0.045} max={0.08} unit="rate" target={0.03} label="Vidéo 1" />
 *
 * `high` null means no upper bound yet (a cost with no delivered order): the
 * bar runs to the end of the scale and fades. Nothing is drawn when the
 * scale or the range is unknown. The numbers are always written next to it
 * by the caller; the bar only shows them.
 */
export function IntervalBar({
  value,
  low,
  high,
  max,
  unit,
  target,
  label,
}: {
  value: number | null;
  low: number | null;
  high: number | null;
  max: number | null;
  unit: KpiUnit;
  target?: number | null;
  label: string;
}) {
  if (max == null || !(max > 0) || low == null) return <div className="h-3" aria-hidden />;
  const x = (v: number) => `${Math.max(0, Math.min(1, v / max)) * 100}%`;
  const open = high == null;
  const end = open ? max : high;
  const text = `${label} : ${valueText(value, unit)}, entre ${valueText(low, unit)} et ${open ? "plus" : valueText(high, unit)}${target != null ? ` ; repère ${valueText(target, unit)}` : ""}`;
  return (
    <div className="relative h-3 w-full" role="img" aria-label={text} title={text}>
      <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2" style={{ background: VIZ.grid }} />
      <div
        className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full"
        style={{
          left: x(low),
          width: `calc(${x(end)} - ${x(low)})`,
          minWidth: 4,
          background: open ? `linear-gradient(to right, ${VIZ.s1}55, ${VIZ.s1}08)` : `${VIZ.s1}40`,
        }}
      />
      {target != null && <div className="absolute -top-0.5 h-4 border-s border-dashed" style={{ left: x(target), borderColor: VIZ.ink2 }} />}
      {value != null && (
        <div className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white" style={{ left: x(value), background: VIZ.s1 }} />
      )}
    </div>
  );
}
