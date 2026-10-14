import { formatTND } from "@/lib/money";
import { discountPct } from "@/lib/offer-display";
import { dict, type Lang } from "@/i18n";

/**
 * The price, large and dark. A struck former price only when it is real and
 * higher; the saving in green, not red. `steady` keeps it on one line on a
 * phone (the struck price and the saving then show from tablet width), so
 * choosing an offer never moves the cards under the customer's finger.
 */
export function Price({ value, compareAt, lang, size = "md", from, steady = false }: { value: number; compareAt?: number | null; lang: Lang; size?: "sm" | "md" | "lg"; from?: string; steady?: boolean }) {
  const t = dict(lang);
  const cls = size === "lg" ? "text-[28px]" : size === "sm" ? "text-[16px]" : "text-[19px]";
  const pct = discountPct(value, compareAt);
  const hide = steady ? "max-md:hidden" : "";
  return (
    // relative: the screen-reader text stays inside the price instead of stretching the page.
    <span className="relative inline-flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      {from && <span className="text-[14px] text-muted">{from}</span>}
      <span className={`whitespace-nowrap font-bold text-ink price-nums ltr-nums ${cls}`}>{formatTND(value, lang)}</span>
      {pct > 0 && compareAt && (
        <>
          <span className="sr-only">{t.buy.instead(formatTND(compareAt, lang))}</span>
          <span aria-hidden className={`whitespace-nowrap text-muted line-through price-nums ltr-nums ${size === "lg" ? "text-[17px]" : "text-[14px]"} ${hide}`}>{formatTND(compareAt, lang)}</span>
          {size === "lg" && <span className={`rounded-full bg-olive-soft px-2 py-0.5 text-[14px] font-bold text-olive ltr-nums ${hide}`}>−{pct}%</span>}
        </>
      )}
    </span>
  );
}
