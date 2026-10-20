"use client";

import { Fragment, useEffect, useRef, useState } from "react";

/**
 * A sortable table that scrolls inside its own bordered box, so a wide table
 * never makes the page scroll sideways on a phone. The first column stays
 * in place while the others scroll. Rows can unfold a detail panel and
 * sub-rows (a campaign's ads); the detail panel is as wide as the box, not
 * as wide as the table, so it reads without scrolling.
 *
 * The page builds the cells on the server: each cell is a sort value and the
 * node to show (server-rendered elements pass through to this component).
 *
 *   <SortTable
 *     cols={[{ key: "name", label: "Campagne", asc: true }, { key: "spend", label: "Dépense", help: "…", align: "end" }, { key: "cpm", label: "CPM", extra: true }]}
 *     rows={[{ key, id?, cells: { name: { v: "lampe", node: <b>lampe</b> }, … }, detail?: <…/>, sub?: SortRow[] }]}
 *     initial={{ key: "spend", dir: "desc" }}
 *     foot={{ name: "Total", spend: "120,000 DT" }}
 *   />
 *
 * Each node is rendered as the only child of its box (see the first column):
 * keep it that way when editing, or React warns about missing keys.
 *
 * Unknown values (v null) always sort last. Columns marked `extra` appear
 * with "Toutes les colonnes". Every column's `help` is the header's title
 * and is listed under the table ("Ce que veulent dire les colonnes"), the
 * hidden columns too, so a detail panel can use the same words without
 * repeating them.
 */

export type SortCol = {
  key: string;
  label: string;
  /** One line in French: the header's title and the legend under the table. */
  help?: string;
  align?: "start" | "end";
  /** Shown only with "Toutes les colonnes". */
  extra?: boolean;
  /** False for a column that cannot be sorted (a chart, a list). */
  sortable?: boolean;
  /** The first click sorts ascending (names, ranks); amounts start descending. */
  asc?: boolean;
};

export type SortCell = { v: number | string | null; node: React.ReactNode };

export type SortRow = {
  key: string;
  /** DOM id, for links to a row (#…). */
  id?: string;
  cells: Record<string, SortCell>;
  detail?: React.ReactNode;
  sub?: SortRow[];
  /** Unfolded on the first render. */
  open?: boolean;
};

type Sort = { key: string; dir: "asc" | "desc" };

function compare(key: string, dir: Sort["dir"]) {
  return (a: SortRow, b: SortRow) => {
    const x = a.cells[key]?.v ?? null;
    const y = b.cells[key]?.v ?? null;
    if (x == null || y == null) return x == null && y == null ? 0 : x == null ? 1 : -1;
    const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "fr");
    return dir === "asc" ? c : -c;
  };
}

function openKeys(rows: SortRow[], out = new Set<string>()): Set<string> {
  for (const r of rows) {
    if (r.open) out.add(r.key);
    if (r.sub) openKeys(r.sub, out);
  }
  return out;
}

export function SortTable({
  cols,
  rows,
  initial,
  foot,
  subLabel = "publicité",
  empty = "Aucune ligne sur la période.",
}: {
  cols: SortCol[];
  rows: SortRow[];
  initial?: Sort;
  foot?: Record<string, React.ReactNode>;
  /** What a sub-row is, for the unfold button's label ("3 publicités"). */
  subLabel?: string;
  empty?: string;
}) {
  const [sort, setSort] = useState<Sort | null>(initial ?? null);
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<Set<string>>(() => openKeys(rows));
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(null);
  const [scrolls, setScrolls] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      setWidth(el.clientWidth);
      setScrolls(el.scrollWidth > el.clientWidth + 1);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, []);

  const visible = cols.filter((c) => all || !c.extra);
  const extraCount = cols.filter((c) => c.extra).length;
  const order = (list: SortRow[]) => (sort ? [...list].sort(compare(sort.key, sort.dir)) : list);
  const toggle = (key: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const sortBy = (c: SortCol) =>
    setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === "asc" ? "desc" : "asc" } : { key: c.key, dir: c.asc ? "asc" : "desc" }));

  if (rows.length === 0) return <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">{empty}</p>;

  const renderRow = (row: SortRow, depth: number): React.ReactNode => {
    const isOpen = open.has(row.key);
    const subs = row.sub ?? [];
    const can = Boolean(row.detail) || subs.length > 0;
    const bg = depth > 0 ? "bg-cream" : "bg-white";
    return (
      <Fragment key={row.key}>
        <tr id={row.id} className={`border-t border-line ${bg} scroll-mt-20`}>
          {visible.map((c, i) => {
            const cell = row.cells[c.key];
            const align = c.align === "end" ? "text-end" : "text-start";
            if (i === 0) {
              return (
                <td key={c.key} className={`sticky start-0 z-[1] ${bg} py-1 pe-3 ps-1 align-top`}>
                  <div className="flex items-start gap-1" style={{ paddingInlineStart: depth * 16 }}>
                    {can ? (
                      <button
                        type="button"
                        onClick={() => toggle(row.key)}
                        aria-expanded={isOpen}
                        aria-label={isOpen ? "Replier" : subs.length ? `Déplier : détail et ${subs.length} ${subLabel}${subs.length > 1 ? "s" : ""}` : "Déplier le détail"}
                        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-sand"
                      >
                        <svg viewBox="0 0 20 20" className={`h-4 w-4 transition-transform ${isOpen ? "rotate-90" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                          <path d="M8 5l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    ) : (
                      <span className="w-10 shrink-0" aria-hidden />
                    )}
                    <div className="min-w-0 py-2">
                      {/* A server node rendered alone in its box: Flight marks elements that came inside an array prop, and they warn when they sit among siblings. */}
                      <div>{cell?.node ?? "—"}</div>
                      {subs.length > 0 && !isOpen && (
                        <span className="mt-0.5 block text-[11px] text-muted">
                          {subs.length} {subLabel}
                          {subs.length > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  </div>
                </td>
              );
            }
            return (
              <td key={c.key} className={`px-2 py-3 align-top tabular-nums ${align}`}>
                {cell?.node ?? <span className="text-muted">—</span>}
              </td>
            );
          })}
        </tr>
        {isOpen && row.detail && (
          <tr className="border-t border-line bg-cream">
            <td colSpan={visible.length} className="p-0">
              <div className="sticky start-0 p-3 sm:p-4" style={width ? { width } : undefined}>
                {row.detail}
              </div>
            </td>
          </tr>
        )}
        {isOpen && order(subs).map((s) => renderRow(s, depth + 1))}
      </Fragment>
    );
  };

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-x-3">
        {extraCount > 0 && (
          <label className="flex min-h-10 cursor-pointer items-center gap-2 text-[13px] text-ink-2">
            <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} className="h-4 w-4 accent-[#1f5d8c]" />
            Toutes les colonnes ({extraCount} de plus)
          </label>
        )}
        {scrolls && <span className="text-xs text-muted">Faire glisser le tableau pour voir les autres colonnes.</span>}
      </div>
      <div ref={box} className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-[13px]">
          <thead className="bg-white text-xs text-muted">
            <tr>
              {visible.map((c, i) => {
                const active = sort?.key === c.key;
                const sortable = c.sortable !== false;
                const align = c.align === "end" ? "justify-end text-end" : "justify-start text-start";
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}
                    className={`${i === 0 ? "sticky start-0 z-[2] bg-white ps-12" : "px-2"} whitespace-nowrap py-0 font-medium`}
                  >
                    {sortable ? (
                      <button type="button" onClick={() => sortBy(c)} title={c.help} className={`flex min-h-10 w-full items-center gap-1 ${align} ${active ? "text-ink" : ""}`}>
                        {c.label}
                        <span aria-hidden className="text-[10px]">{active ? (sort!.dir === "asc" ? "▲" : "▼") : ""}</span>
                      </button>
                    ) : (
                      <span title={c.help} className={`flex min-h-10 items-center ${align}`}>
                        {c.label}
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>{order(rows).map((r) => renderRow(r, 0))}</tbody>
          {foot && (
            <tfoot className="border-t-2 border-line bg-sand font-medium">
              <tr>
                {visible.map((c, i) => (
                  <td key={c.key} className={`${i === 0 ? "sticky start-0 z-[1] bg-sand ps-12" : "px-2"} whitespace-nowrap py-3 align-top tabular-nums ${c.align === "end" ? "text-end" : "text-start"}`}>
                    {foot[c.key] ?? ""}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {cols.some((c) => c.help) && (
        <details className="text-xs">
          <summary className="flex min-h-10 cursor-pointer items-center text-muted">Ce que veulent dire les colonnes</summary>
          <dl className="grid gap-x-6 gap-y-1.5 pb-2 sm:grid-cols-2">
            {cols
              .filter((c) => c.help)
              .map((c) => (
                <div key={c.key}>
                  <dt className="inline font-medium text-ink">{c.label} : </dt>
                  <dd className="inline text-ink-2">{c.help}</dd>
                </div>
              ))}
          </dl>
        </details>
      )}
    </div>
  );
}
