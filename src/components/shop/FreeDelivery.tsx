import { dict, type Lang } from "@/i18n";
import { formatTND } from "@/lib/money";

/**
 * "Livraison ~~8,000 DT~~ offerte" (توصيل ~~8,000 د.ت~~ مجاني): free delivery
 * with the fee it saves, the shop's own delivery fee, struck through. A shop
 * whose delivery is always free says only "Livraison offerte". Screen readers
 * hear one plain sentence.
 */
export function FreeDelivery({ lang, fee }: { lang: Lang; fee: number }) {
  const t = dict(lang);
  if (!(fee > 0)) return <>{t.buy.freeDelivery}</>;
  return (
    <>
      <span className="sr-only">{t.buy.freeInstead(formatTND(fee, lang))}</span>
      <span aria-hidden>
        {t.buy.freeBefore}{" "}
        <s className="whitespace-nowrap font-normal text-muted decoration-[1.5px] price-nums ltr-nums">
          {formatTND(fee, lang)}
        </s>{" "}
        {t.buy.freeAfter}
      </span>
    </>
  );
}
