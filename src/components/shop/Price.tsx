import { formatTND } from "@/lib/money";
import type { Lang } from "@/i18n";

/** The price, large and dark. A struck former price only when it is real and higher; the saving in green, not red. */
export function Price({ value, compareAt, lang, size = "md", from }: { value: number; compareAt?: number | null; lang: Lang; size?: "sm" | "md" | "lg"; from?: string }) {
  const cls = size === "lg" ? "text-[28px]" : size === "sm" ? "text-[16px]" : "text-[19px]";
  const pct = compareAt && compareAt > value ? Math.round((1 - value / compareAt) * 100) : null;
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      {from && <span className="text-[14px] text-muted">{from}</span>}
      <span className={`whitespace-nowrap font-bold text-ink ltr-nums ${cls}`}>{formatTND(value, lang)}</span>
      {pct != null && compareAt && (
        <>
          <span className={`whitespace-nowrap text-muted line-through ltr-nums ${size === "lg" ? "text-[17px]" : "text-[14px]"}`}>{formatTND(compareAt, lang)}</span>
          {size === "lg" && <span className="rounded-full bg-olive-soft px-2 py-0.5 text-[14px] font-bold text-olive ltr-nums">−{pct}%</span>}
        </>
      )}
    </span>
  );
}
