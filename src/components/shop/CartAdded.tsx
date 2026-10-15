"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { dict, href, pick, type Lang } from "@/i18n";
import { cartCount, onCartAdded, useCart, type AddResult, type CartItem } from "@/lib/client/cart";
import { IconCheck, IconClose } from "./Icons";
import { useFocusTrap } from "@/lib/client/focus-trap";
import { useBackToClose } from "@/lib/client/back-to-close";

/**
 * Told by any "Ajouter au panier" on the page: what was added, and the two
 * ways on — order the basket now, or keep shopping. A sheet from the bottom
 * on a phone, a small window on a computer.
 */
export function CartAdded({ lang }: { lang: Lang }) {
  const t = dict(lang);
  const [shown, setShown] = useState<{ item: CartItem; result: AddResult } | null>(null);
  const n = cartCount(useCart());
  const primary = useRef<HTMLAnchorElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useFocusTrap(panel, shown != null, true);
  const { close, dismiss } = useBackToClose(shown != null, () => setShown(null), "panier");

  useEffect(() => onCartAdded((a) => setShown(a)), []);

  // Mounted with the layout: another page never keeps the sheet of the previous one.
  const pathname = usePathname();
  const [openedOn, setOpenedOn] = useState(pathname);
  if (shown && openedOn !== pathname) {
    setOpenedOn(pathname);
    setShown(null);
  } else if (!shown && openedOn !== pathname) setOpenedOn(pathname);

  useEffect(() => {
    if (!shown) return;
    const back = document.activeElement as HTMLElement | null;
    primary.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    addEventListener("keydown", onKey);
    return () => {
      removeEventListener("keydown", onKey);
      back?.focus?.({ preventScroll: true });
    };
  }, [shown, close]);

  if (!shown) return null;
  const { item, result } = shown;
  const title = result === "full" ? t.cart.full : result === "already" ? t.cart.already : result === "replaced" ? t.cart.replaced : t.cart.added;
  // A check mark only when something was put in the basket.
  const done = result === "added" || result === "more" || result === "replaced";
  const option = [item.variantName ? pick(lang, item.variantName, item.variantNameAr) : null, item.offerLabel ? pick(lang, item.offerLabel, item.offerLabelAr) : null].filter(Boolean).join(" · ");

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center md:items-start md:justify-end md:p-6" role="dialog" aria-modal="true" aria-labelledby="cart-added-title">
      <button type="button" className="absolute inset-0 animate-fade bg-night/40 md:bg-night/20" onClick={close} aria-label={t.nav.close} tabIndex={-1} />
      <div ref={panel} className="relative w-full animate-sheet-up rounded-t-3xl bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 shadow-lift md:max-w-sm md:animate-fade md:rounded-2xl md:p-5">
        <div className="flex items-start justify-between gap-3">
          <p id="cart-added-title" className={`flex items-center gap-2 text-[19px] font-bold ${result === "full" ? "text-clay" : done ? "text-olive" : "text-ink"}`} role="status">
            {done && (
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-olive text-white">
                <IconCheck className="h-4 w-4" />
              </span>
            )}
            {title}
          </p>
          <button type="button" onClick={close} className="-me-2 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-2 hover:bg-sand" aria-label={t.nav.close}>
            <IconClose className="h-6 w-6" />
          </button>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-line bg-sand">
            {item.imageId && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/img/${item.imageId}/128`} alt="" className="h-full w-full object-cover" />
            )}
          </span>
          <span className="min-w-0">
            <span className="line-clamp-2 block text-[16px] font-bold leading-snug text-ink">{pick(lang, item.name, item.nameAr)}</span>
            {option && <span className="block text-[15px] text-muted">{option}</span>}
            {!item.offerId && item.qty > 1 && <span className="block text-[15px] text-muted ltr-nums">×{item.qty}</span>}
          </span>
        </div>
        <div className="mt-4 flex flex-col gap-2">
          {/* Replaces the sheet's entry: Back from the basket returns to this page. */}
          <Link ref={primary} href={href(lang, "/panier")} replace onClick={dismiss} className="flex min-h-[54px] items-center justify-center rounded-full bg-buy px-5 text-[18px] font-bold text-night shadow-[inset_0_-3px_0_var(--color-buy-2)] transition [--focus-ring:var(--color-night)] hover:bg-buy-2" data-testid="go-to-cart">
            {t.cart.checkout(n)}
          </Link>
          <button type="button" onClick={close} className="flex min-h-[52px] items-center justify-center rounded-full border border-ink/60 bg-white px-5 text-[17px] font-bold text-ink transition hover:bg-sand">
            {t.cart.keepShopping}
          </button>
        </div>
      </div>
    </div>
  );
}
