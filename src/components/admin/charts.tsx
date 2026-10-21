"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * The back office's charts: hand-written SVG, no library. Specs from the
 * dataviz method — one hue per series (slot 1 blue), 2px lines, columns at
 * most 24px with a 4px rounded top, hairline solid grid, a crosshair and one
 * tooltip on lines, a per-mark tooltip on columns, text in ink tokens, and a
 * table view under every chart.
 */

export { VIZ, fmt, type Unit } from "@/lib/viz";
import { VIZ, fmt, type Unit } from "@/lib/viz";

/** Clean ticks: 0 and three round steps above. */
function ticks(max: number): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / 3;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  return [0, step, step * 2, step * 3];
}

const dayLabel = (d: string) => {
  const [, m, day] = d.split("-");
  return `${Number(day)}/${Number(m)}`;
};

type Point = { x: string; y: number };

const H = 200;
const PAD = { t: 12, r: 12, b: 26, l: 60 };

function Frame({ width, max, unit, children, xLabels }: { width: number; max: number; unit: Unit; children: React.ReactNode; xLabels: { x: number; text: string }[] }) {
  const t = ticks(max);
  const top = t[t.length - 1];
  const y = (v: number) => PAD.t + (H - PAD.t - PAD.b) * (1 - v / top);
  return (
    <>
      {t.map((v) => (
        <g key={v}>
          <line x1={PAD.l} x2={width - PAD.r} y1={y(v)} y2={y(v)} stroke={v === 0 ? VIZ.axis : VIZ.grid} strokeWidth={1} />
          <text x={PAD.l - 8} y={y(v)} dy="0.32em" textAnchor="end" fontSize={11} fill={VIZ.muted} style={{ fontVariantNumeric: "tabular-nums" }}>
            {fmt(v, unit, true)}
          </text>
        </g>
      ))}
      {xLabels.map((l) => (
        <text key={l.x} x={l.x} y={H - 8} textAnchor="middle" fontSize={11} fill={VIZ.muted}>
          {l.text}
        </text>
      ))}
      {children}
    </>
  );
}

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, w };
}

function every(n: number, max: number) {
  return Math.max(1, Math.ceil(n / max));
}

/** One series over days: a 2px line, a ~10% wash, a crosshair that snaps to the nearest day. */
export function LineChart({ points, unit, name, days = true }: { points: Point[]; unit: Unit; name: string; days?: boolean }) {
  const { ref, w } = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const gid = useId();
  const max = Math.max(0, ...points.map((p) => p.y));
  const t = ticks(max);
  const top = t[t.length - 1];
  const innerW = w - PAD.l - PAD.r;
  const x = (i: number) => PAD.l + (points.length <= 1 ? innerW / 2 : (innerW * i) / (points.length - 1));
  const y = (v: number) => PAD.t + (H - PAD.t - PAD.b) * (1 - v / top);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join("");
  const area = points.length ? `${path}L${x(points.length - 1)},${y(0)}L${x(0)},${y(0)}Z` : "";
  const step = every(points.length, Math.floor(innerW / 56));
  const last = points.length - 1;

  return (
    <div ref={ref} className="relative w-full">
      <svg
        width={w}
        height={H}
        role="img"
        aria-label={name}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const px = e.clientX - r.left;
          const i = Math.round(((px - PAD.l) / innerW) * (points.length - 1));
          setHover(Math.max(0, Math.min(last, i)));
        }}
        onPointerLeave={() => setHover(null)}
        className="touch-pan-y"
      >
        <Frame width={w} max={max} unit={unit} xLabels={points.map((p, i) => ({ x: x(i), text: days ? dayLabel(p.x) : p.x })).filter((_, i) => i % step === 0 || i === last)}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={VIZ.s1} stopOpacity={0.12} />
              <stop offset="1" stopColor={VIZ.s1} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${gid})`} />
          <path d={path} fill="none" stroke={VIZ.s1} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {last >= 0 && <circle cx={x(last)} cy={y(points[last].y)} r={4} fill={VIZ.s1} stroke={VIZ.surface} strokeWidth={2} />}
          {hover != null && (
            <g pointerEvents="none">
              <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} stroke={VIZ.axis} strokeWidth={1} />
              <circle cx={x(hover)} cy={y(points[hover].y)} r={4.5} fill={VIZ.s1} stroke={VIZ.surface} strokeWidth={2} />
            </g>
          )}
        </Frame>
      </svg>
      {hover != null && (
        <Tip left={x(hover)} width={w}>
          <span className="block text-[15px] font-semibold text-ink">{fmt(points[hover].y, unit)}</span>
          <span className="flex items-center gap-1.5 text-xs text-ink-2">
            <span className="inline-block h-0.5 w-3 rounded" style={{ background: VIZ.s1 }} />
            {name} · {days ? new Date(`${points[hover].x}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }) : points[hover].x}
          </span>
        </Tip>
      )}
    </div>
  );
}

/** One series in columns (days or hours). Each column is its own hover target. */
export function ColumnChart({ points, unit, name, days = true, highlightMax = false }: { points: Point[]; unit: Unit; name: string; days?: boolean; highlightMax?: boolean }) {
  const { ref, w } = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(0, ...points.map((p) => p.y));
  const t = ticks(max);
  const top = t[t.length - 1];
  const innerW = w - PAD.l - PAD.r;
  const band = innerW / Math.max(1, points.length);
  const bw = Math.max(2, Math.min(24, band - 2));
  const y = (v: number) => PAD.t + (H - PAD.t - PAD.b) * (1 - v / top);
  const step = every(points.length, Math.floor(innerW / 44));
  const peak = highlightMax ? points.reduce((m, p, i) => (p.y > points[m].y ? i : m), 0) : -1;

  return (
    <div ref={ref} className="relative w-full">
      <svg width={w} height={H} role="img" aria-label={name} onPointerLeave={() => setHover(null)}>
        <Frame
          width={w}
          max={max}
          unit={unit}
          xLabels={points.map((p, i) => ({ x: PAD.l + band * i + band / 2, text: days ? dayLabel(p.x) : p.x })).filter((_, i) => i % step === 0)}
        >
          {points.map((p, i) => {
            const cx = PAD.l + band * i + band / 2;
            const h = y(0) - y(p.y);
            const r = Math.min(4, bw / 2, h);
            const x0 = cx - bw / 2;
            const top = y(p.y);
            const d = h <= 0 ? "" : `M${x0},${y(0)}V${top + r}Q${x0},${top} ${x0 + r},${top}H${x0 + bw - r}Q${x0 + bw},${top} ${x0 + bw},${top + r}V${y(0)}Z`;
            return (
              <g key={p.x} onPointerEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0} aria-label={`${p.x} : ${fmt(p.y, unit)}`}>
                <rect x={PAD.l + band * i} y={PAD.t} width={band} height={H - PAD.t - PAD.b} fill="transparent" />
                {d && <path d={d} fill={VIZ.s1} opacity={hover == null || hover === i ? 1 : 0.55} />}
                {i === peak && p.y > 0 && (
                  <text x={cx} y={top - 6} textAnchor="middle" fontSize={11} fill={VIZ.ink2}>
                    {fmt(p.y, unit, true)}
                  </text>
                )}
              </g>
            );
          })}
        </Frame>
      </svg>
      {hover != null && (
        <Tip left={PAD.l + band * hover + band / 2} width={w}>
          <span className="block text-[15px] font-semibold text-ink">{fmt(points[hover].y, unit)}</span>
          <span className="flex items-center gap-1.5 text-xs text-ink-2">
            <span className="inline-block h-2 w-2 rounded-sm" style={{ background: VIZ.s1 }} />
            {name} · {days ? new Date(`${points[hover].x}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }) : points[hover].x}
          </span>
        </Tip>
      )}
    </div>
  );
}

function Tip({ left, width, children }: { left: number; width: number; children: React.ReactNode }) {
  const clamped = Math.max(70, Math.min(width - 70, left));
  return (
    <div className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg border border-line bg-white px-2.5 py-1.5 shadow-soft" style={{ left: clamped }}>
      {children}
    </div>
  );
}

/** Horizontal bars, one hue, value and share written at the end of each bar. */
export function BarList({ rows, unit, max: maxIn }: { rows: { label: string; value: number; sub?: string }[]; unit: Unit; max?: number }) {
  const max = maxIn ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
          <span className="truncate text-[13px] text-ink-2">{r.label}</span>
          <span className="text-[13px] font-semibold tabular-nums text-ink">
            {fmt(r.value, unit)}
            {r.sub && <span className="ms-1.5 font-normal text-muted">{r.sub}</span>}
          </span>
          <span className="col-span-2 h-2 rounded-full bg-[#f0efec]">
            <span className="block h-2 rounded-full" style={{ width: `${Math.max(r.value > 0 ? 2 : 0, (r.value / max) * 100)}%`, background: VIZ.s1 }} />
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The table view every chart carries: the same numbers, readable without hovering. */
export function TableView({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <details className="mt-3 text-sm">
      <summary className="flex min-h-10 cursor-pointer items-center text-xs text-muted">Voir le tableau</summary>
      <div className="mt-2 max-h-72 overflow-auto">
        <table className="w-full text-[13px]">
          <thead className="sticky top-0 bg-white text-xs text-muted">
            <tr>{head.map((h) => <th key={h} className="py-1 pe-3 text-start font-medium">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-line tabular-nums">
            {rows.map((r, i) => (
              <tr key={i}>{r.map((c, j) => <td key={j} className="py-1 pe-3">{c}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
