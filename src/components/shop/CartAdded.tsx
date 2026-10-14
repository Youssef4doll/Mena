"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { dict, href, pick, type Lang } from "@/i18n";
import { cartCount, onCartAdded, useCart, type AddResult, type CartItem } from "@/lib/client/cart";
import { IconCheck, IconClose } from "./Icons";

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

  useEffect(() => onCartAdded((a) => setShown(a)), []);

  useEffect(() => {
    if (!shown) return;
    const back = document.activeElement as HTMLElement | null;
    primary.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShown(null);
    };
    addEventListener("keydown", onKey);
    return () => {
      removeEventListener("keydown", onKey);
      back?.focus?.({ preventScroll: true });
    };
  }, [shown]);

  if (!shown) return null;
  const { item, result } = shown;
  const title = result === "full" ? t.cart.full : result === "already" ? t.cart.already : t.cart.added;
  const option = [item.variantName, item.offerLabel ? pick(lang, item.offerLabel, item.offerLabelAr) : null].filter(Boolean).join(" · ");
  const close = () => setShown(null);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center md:items-start md:justify-end md:p-6" role="dialog" aria-modal="true" aria-labelledby="cart-added-title">
      <button type="button" className="absolute inset-0 animate-fade bg-night/40 md:bg-night/20" onClick={close} aria-label={t.nav.close} tabIndex={-1} />
      <div className="relative w-full animate-sheet-up rounded-t-3xl bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 shadow-lift md:max-w-sm md:animate-fade md:rounded-2xl md:p-5">
        <div className="flex items-start justify-between gap-3">
          <p id="cart-added-title" className={`flex items-center gap-2 text-[19px] font-bold ${result === "full" ? "text-clay" : "text-olive"}`} role="status">
            {result !== "full" && (
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-olive text-white">
                <IconCheck className="h-4 w-4" />
              </span>
            )}
            {title}
          </p>
          <button type="button" onClick={close} className="-me-2 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink-2 hover:bg-sand" aria-label={t.nav.close}>
            <IconClose className="h-6 w-6" />
          </button>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-sand">
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
          <Link ref={primary} href={href(lang, "/panier")} onClick={close} className="flex min-h-14 items-center justify-center rounded-2xl bg-buy px-4 text-[18px] font-bold text-night shadow-[inset_0_-3px_0_var(--color-buy-2)] [--focus-ring:var(--color-night)]" data-testid="go-to-cart">
            {t.cart.checkout(n)}
          </Link>
          <button type="button" onClick={close} className="flex min-h-14 items-center justify-center rounded-2xl border-2 border-field px-4 text-[17px] font-bold text-ink">
            {t.cart.keepShopping}
          </button>
        </div>
      </div>
    </div>
  );
}
