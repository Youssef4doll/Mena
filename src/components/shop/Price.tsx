import { formatTND } from "@/lib/money";
import type { Lang } from "@/i18n";

export function Price({ value, compareAt, lang, size = "md", from }: { value: number; compareAt?: number | null; lang: Lang; size?: "sm" | "md" | "lg"; from?: string }) {
  const cls = size === "lg" ? "text-2xl" : size === "sm" ? "text-sm" : "text-base";
  const pct = compareAt && compareAt > value ? Math.round((1 - value / compareAt) * 100) : null;
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      {from && <span className="text-xs text-muted">{from}</span>}
      <span className={`ltr-nums font-semibold text-ink ${cls}`}>{formatTND(value, lang)}</span>
      {pct != null && compareAt && (
        <>
          <span className={`ltr-nums text-muted line-through ${size === "lg" ? "text-base" : "text-xs"}`}>{formatTND(compareAt, lang)}</span>
          <span className="ltr-nums rounded-full bg-clay-soft px-1.5 py-0.5 text-[11px] font-semibold text-clay">−{pct}%</span>
        </>
      )}
    </span>
  );
}
