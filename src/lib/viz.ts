/** Chart colours and number formats, shared by server pages and client charts. Palette validated with the dataviz checks on a white surface. */
export const VIZ = {
  s1: "#2a78d6",
  s2: "#eb6834",
  s3: "#1baf7a",
  grid: "#e1e0d9",
  axis: "#c3c2b7",
  ink: "#0b0b0b",
  ink2: "#52514e",
  muted: "#898781",
  good: "#0ca30c",
  critical: "#d03b3b",
  surface: "#ffffff",
};

export type Unit = "int" | "tnd" | "pct";

export function fmt(v: number | null | undefined, unit: Unit, compact = false): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (unit === "pct") return `${(v * 100).toLocaleString("fr-FR", { maximumFractionDigits: v < 0.1 ? 1 : 0 })} %`;
  if (unit === "tnd") {
    const dt = v / 1000;
    if (compact && Math.abs(dt) >= 1000) return `${(dt / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} k DT`;
    return `${dt.toLocaleString("fr-FR", { minimumFractionDigits: compact ? 0 : 3, maximumFractionDigits: compact ? 0 : 3 })} DT`;
  }
  if (compact && Math.abs(v) >= 1000) return `${(v / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} k`;
  return v.toLocaleString("fr-FR");
}

