"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { dict, href, pick, type Lang } from "@/i18n";
import type { PublicSettings } from "@/lib/settings-schema";
import type { PublicQuote } from "@/lib/client/quote";
import { clearCart, itemKey, removeFromCart, replaceCart, setCartQty, useCart, cartCount, type CartItem } from "@/lib/client/cart";
import { useHydrated } from "@/lib/client/hydrated";
import { track } from "@/lib/client/track";
import { formatTND } from "@/lib/money";
import { OrderForm } from "./OrderForm";
import { IconCart, IconMinus, IconPlus } from "./Icons";

const noopSubscribe = () => () => {};
const readSearch = () => location.search;

/**
 * The basket: its lines with the server's prices, then the same
 * cash-on-delivery form as a product page. A line the server refuses (sold
 * out, an offer that ended) leaves the basket with a sentence saying so,
 * before anything is ordered.
 */
export function CartView({ lang, settings }: { lang: Lang; settings: PublicSettings }) {
  const t = dict(lang);
  const items = useCart();
  const hydrated = useHydrated();
  const [quote, setQuote] = useState<PublicQuote | null>(null);
  const [notices, setNotices] = useState<string[]>([]);
  const search = useSyncExternalStore(noopSubscribe, readSearch, () => "");
  const relance = new URLSearchParams(search).get("relance");
  const restoredCartId = relance && /^[a-z0-9]{20,40}$/.test(relance) ? relance : null;
  const tried = useRef(false);
  const viewed = useRef(false);
  const lines = useMemo(() => items.map((i) => ({ productId: i.productId, variantId: i.variantId, offerId: i.offerId, qty: i.qty })), [items]);

  // A reminder link fills an empty basket with what was left; a basket already in use is kept.
  useEffect(() => {
    if (!hydrated || !restoredCartId || tried.current || items.length > 0) return;
    tried.current = true;
    fetch(`/api/cart/${restoredCartId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { items?: CartItem[] } | null) => {
        if (d?.items?.length) {
          replaceCart(d.items);
          setNotices([t.cart.restored]);
        }
      })
      .catch(() => {});
  }, [hydrated, restoredCartId, items.length, t.cart.restored]);

  useEffect(() => {
    if (!hydrated || viewed.current || items.length === 0) return;
    viewed.current = true;
    track("cart_viewed", { props: { lines: items.length, units: cartCount(items) } });
  }, [hydrated, items]);

  const name = (i: { name: string; nameAr: string | null }) => pick(lang, i.name, i.nameAr);

  /** What the server refused, applied to the basket and said in plain words. */
  function onQuote(q: PublicQuote) {
    setQuote(q);
    if (q.problems.length === 0) return;
    const said: string[] = [];
    for (const pr of q.problems) {
      const option = items.filter((i) => i.productId === pr.productId && (i.variantId ?? null) === (pr.variantId ?? null));
      // The server names the refused line by its offer; only that line changes.
      const lines = pr.offerId !== undefined ? option.filter((i) => (i.offerId ?? null) === (pr.offerId ?? null)) : option;
      const label = lines[0] ? name(lines[0]) : option[0] ? name(option[0]) : "";
      if (pr.kind === "qty_reduced" && pr.available != null) {
        for (const i of lines) if (!i.offerId) setCartQty(itemKey(i), pr.available);
        said.push(t.cart.qtyReduced(label, pr.available));
      } else if (pr.kind === "offer_unavailable" || (pr.kind === "unavailable" && lines.some((i) => i.offerId))) {
        for (const i of lines) if (i.offerId) removeFromCart(itemKey(i));
        said.push(t.cart.offerGone(label));
      } else if (pr.kind === "variant_required") {
        for (const i of lines) removeFromCart(itemKey(i));
        said.push(t.cart.needsOption(label));
      } else if (pr.kind === "unavailable") {
        // That option is sold out; the product's other options stay.
        for (const i of lines) removeFromCart(itemKey(i));
        said.push(t.cart.gone(label));
      } else {
        for (const i of items.filter((x) => x.productId === pr.productId)) removeFromCart(itemKey(i));
        said.push(t.cart.gone(label));
      }
    }
    setNotices(said.filter(Boolean));
  }

  const priced = (i: CartItem) => quote?.lines.find((l) => l.productId === i.productId && (l.variantId ?? null) === (i.variantId ?? null) && (l.offerId ?? null) === (i.offerId ?? null));
  const units = cartCount(items);

  // The title is drawn at once, in the same place whatever the basket holds: the page never jumps.
  const title = (
    <h1 id="cart-title" tabIndex={-1} className="text-[26px] font-bold leading-tight text-ink outline-none md:text-[32px]">
      {t.cart.title} {hydrated && items.length > 0 && <span className="font-normal text-muted ltr-nums">({units})</span>}
    </h1>
  );

  if (!hydrated || items.length === 0)
    return (
      <div className="mx-auto max-w-6xl px-4 pb-16 pt-5 md:pt-8">
        {title}
        {hydrated && (
          <div className="mt-10 flex flex-col items-center gap-5 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-sand text-ink-2">
              <IconCart className="h-8 w-8" />
            </span>
            <p className="text-[20px] font-bold text-ink">{t.cart.empty}</p>
            {notices.map((n) => (
              <p key={n} className="rounded-xl bg-clay-soft px-4 py-3 text-[16px] text-clay">{n}</p>
            ))}
            <Link href={href(lang, "/boutique")} className="flex min-h-14 items-center rounded-full bg-ink px-7 text-[17px] font-bold text-white hover:bg-ink-2">
              {t.home.shopNow}
            </Link>
          </div>
        )}
      </div>
    );

  return (
    <div className="mx-auto grid max-w-6xl gap-5 px-4 pb-16 pt-5 md:grid-cols-[1fr_440px] md:items-start md:gap-8 md:pt-8">
      <section className="flex min-w-0 flex-col gap-3" aria-labelledby="cart-title">
        {title}
        {notices.length > 0 && (
          <div className="flex flex-col gap-1 rounded-xl bg-clay-soft px-4 py-3 text-[16px] text-clay" role="status">
            {notices.map((n) => (
              <p key={n}>{n}</p>
            ))}
          </div>
        )}
        <ul className="flex flex-col divide-y divide-line border-y border-line">
          {items.map((i) => {
            const key = itemKey(i);
            const pl = priced(i);
            const option = [i.variantName ? pick(lang, i.variantName, i.variantNameAr) : null, i.offerLabel ? pick(lang, i.offerLabel, i.offerLabelAr) : null].filter(Boolean).join(" · ");
            return (
              <li key={key} className="flex gap-3 py-4" data-testid="cart-line">
                <Link href={href(lang, `/produit/${i.slug}`)} className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-line bg-white" prefetch={false}>
                  {i.imageId && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/img/${i.imageId}/200`} alt="" className="h-full w-full object-cover" loading="lazy" />
                  )}
                </Link>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <Link href={href(lang, `/produit/${i.slug}`)} className="-my-1 line-clamp-2 py-1 text-[17px] font-bold leading-snug text-ink" prefetch={false}>
                    {name(i)}
                  </Link>
                  {option && <span className="text-[15px] text-muted">{option}</span>}
                  <span className="text-[19px] font-bold text-ink price-nums ltr-nums">{pl ? formatTND(pl.lineTotal, lang) : <span className="text-[15px] font-normal text-muted">{t.cart.loading}</span>}</span>
                  {pl && !i.offerId && i.qty > 1 && <span className="text-[15px] text-muted">{t.cart.unit(formatTND(pl.unitPrice, lang))}</span>}
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                    {i.offerId ? (
                      // An offer is a fixed pack: its size is said, nothing to change.
                      pl && pl.qty > 1 && !(i.offerLabel ?? "").includes(String(pl.qty)) ? <span className="rounded-full bg-sea-soft px-3 py-0.5 text-[15px] font-bold text-sea-2">{t.buy.units(pl.qty)}</span> : <span />
                    ) : (
                      <div className="inline-flex h-11 items-center rounded-full border border-field bg-white px-1" role="group" aria-label={t.buy.quantity}>
                        <button type="button" className="flex h-11 w-11 items-center justify-center disabled:opacity-30" disabled={i.qty <= 1} onClick={() => { setNotices([]); setCartQty(key, i.qty - 1); }} aria-label={t.buy.qtyLess}>
                          <IconMinus className="h-5 w-5" />
                        </button>
                        <span className="w-7 text-center text-[17px] font-bold ltr-nums" aria-live="polite">{i.qty}</span>
                        <button type="button" className="flex h-11 w-11 items-center justify-center disabled:opacity-30" disabled={i.qty >= 10} onClick={() => { setNotices([]); setCartQty(key, i.qty + 1); }} aria-label={t.buy.qtyMore}>
                          <IconPlus className="h-5 w-5" />
                        </button>
                      </div>
                    )}
                    <button
                      type="button"
                      className="min-h-11 min-w-11 px-2 text-[15px] text-muted underline underline-offset-4"
                      data-remove={key}
                      onClick={() => {
                        setNotices([]);
                        // Keyboard and screen-reader users stay where they were: the next line, or the title.
                        const at = items.findIndex((x) => itemKey(x) === key);
                        const next = items[at + 1] ?? items[at - 1];
                        removeFromCart(key);
                        track("remove_from_cart", { productId: i.productId });
                        requestAnimationFrame(() => (next ? document.querySelector<HTMLElement>(`[data-remove="${CSS.escape(itemKey(next))}"]`) : document.getElementById("cart-title"))?.focus());
                      }}
                    >
                      {t.cart.remove}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        <Link href={href(lang, "/boutique")} className="inline-flex min-h-11 items-center self-start text-[16px] text-sea underline underline-offset-4">
          {t.cart.keepShopping}
        </Link>
      </section>

      <div className="border-t border-line pt-6 md:sticky md:top-36 md:rounded-2xl md:border md:p-6">
        <OrderForm
          lang={lang}
          settings={settings}
          idp="cart"
          formId="panier-form"
          lines={lines}
          ready={lines.length > 0}
          pagePrice={null}
          priceLabel={t.cart.items(units)}
          onQuote={onQuote}
          origin="cart"
          pixelItems={() => items.map((i) => ({ id: i.productId, name: i.name, price: priced(i)?.unitPrice ?? 0, qty: priced(i)?.qty ?? i.qty }))}
          restoredCartId={restoredCartId}
          onPlaced={clearCart}
          waText={lang === "ar" ? `${t.trust.waHello}: ${items.map((i) => name(i)).join("، ")}` : `${t.trust.waHello} : ${items.map((i) => name(i)).join(", ")}`}
          submitTitle={t.cart.submit}
        />
      </div>
    </div>
  );
}
