/** RFC 4180 CSV with a BOM so Excel opens accents correctly; cells that could start a formula are neutralised. */
export function toCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    if (v == null) return "";
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s) && typeof v === "string") s = `'${s}`;
    return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
}

export function csvResponse(name: string, body: string) {
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "no-store",
    },
  });
}

/** Millimes → "89.900" (dot decimal: spreadsheets read it as a number in any locale setting chosen at import). */
export const dt = (m: number | null | undefined) => (m == null ? "" : (m / 1000).toFixed(3));
