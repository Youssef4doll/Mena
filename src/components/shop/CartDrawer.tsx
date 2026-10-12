"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { dict, href, pick, type Lang } from "@/i18n";
import { useCart } from "@/lib/client/cart-store";
import { fetchQuote, getGov, type PublicQuote } from "@/lib/client/quote";
import { currentAttribution } from "@/lib/client/track";
import { track } from "@/lib/client/track";
import { formatTND } from "@/lib/money";
import { Sheet } from "./Header";
import { IconClose, IconMinus, IconPlus, IconTruck } from "./Icons";

export function CartDrawer({ lang }: { lang: Lang }) {
  const t = dict(lang);
  const { open, setOpen, lines, setQty, remove, replace, token } = useCart();
  const [quote, setQuote] = useState<PublicQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const key = useMemo(() => JSON.stringify(lines.map((l) => [l.productId, l.variantId, l.qty])), [lines]);

  // Prices are always the server's.
  useEffect(() => {
    if (!open || lines.length === 0) return;
    const ctrl = new AbortController();
    setLoading(true);
    fetchQuote({ lines: lines.map(({ productId, variantId, qty }) => ({ productId, variantId, qty })), governorate: getGov() }, ctrl.signal).then((q) => {
      if (ctrl.signal.aborted) return;
      setQuote(q);
      setLoading(false);
      // Lines the server dropped (gone, sold out) leave the basket, with a word about it.
      if (q && q.problems.length > 0) {
        const keep = lines
          .filter((l) => q.lines.some((x) => x.productId === l.productId && x.variantId === l.variantId))
          .map((l) => ({ ...l, qty: q.lines.find((x) => x.productId === l.productId && x.variantId === l.variantId)?.qty ?? l.qty }));
        if (keep.length !== lines.length || keep.some((l, i) => l.qty !== lines[i]?.qty)) replace(keep);
      }
    });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, key]);

  // The server's copy of the basket, for the abandoned-cart list.
  useEffect(() => {
    if (!token || lines.length === 0) return;
    const id = setTimeout(() => {
      const a = currentAttribution();
      void fetch("/api/cart", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, lines: lines.map(({ productId, variantId, qty }) => ({ productId, variantId, qty })), visitorId: a.visitorId, source: a.attribution.source, campaign: a.attribution.campaign }),
        keepalive: true,
      }).catch(() => {});
    }, 1200);
    return () => clearTimeout(id);
  }, [key, token, lines]);

  if (!open) return null;
  const priced = (productId: string, variantId: string | null) => quote?.lines.find((l) => l.productId === productId && l.variantId === variantId);

  return (
    <Sheet side="end" onClose={() => setOpen(false)} label={t.cart.title} wide>
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <h2 className="font-display text-xl">{t.cart.title}</h2>
        <button type="button" onClick={() => setOpen(false)} className="-me-2 rounded-full p-2" aria-label={t.nav.close}>
          <IconClose />
        </button>
      </div>

      {lines.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
          <p className="text-muted">{t.cart.empty}</p>
          <button type="button" onClick={() => setOpen(false)} className="rounded-full bg-ink px-5 py-3 text-sm font-medium text-white">
            {t.cart.continue}
          </button>
        </div>
      ) : (
        <>
          {quote && quote.freeThreshold != null && (
            <FreeBar lang={lang} remaining={quote.freeDeliveryRemaining} threshold={quote.freeThreshold} subtotal={quote.subtotal - quote.discount} />
          )}
          <ul className="flex-1 divide-y divide-line overflow-y-auto px-5">
            {lines.map((l) => {
              const p = priced(l.productId, l.variantId);
              return (
                <li key={`${l.productId}-${l.variantId}`} className="flex gap-3 py-4">
                  <Link href={href(lang, `/produit/${l.slug}`)} onClick={() => setOpen(false)} className="relative h-24 w-20 shrink-0 overflow-hidden rounded-xl bg-sand">
                    {l.imageId && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/img/${l.imageId}/200`} alt="" className="h-full w-full object-cover" />
                    )}
                  </Link>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <p className="line-clamp-2 text-sm text-ink">{p ? pick(lang, p.name, p.nameAr) : l.name}</p>
                    {l.variantName && <p className="text-xs text-muted">{l.variantName}</p>}
                    <div className="mt-auto flex items-center justify-between pt-2">
                      <Qty value={l.qty} onChange={(q) => setQty(l.productId, l.variantId, q)} />
                      <span className="text-sm font-semibold ltr-nums">{p ? formatTND(p.lineTotal, lang) : loading ? "…" : ""}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        remove(l.productId, l.variantId);
                        track("remove_from_cart", { productId: l.productId });
                      }}
                      className="mt-1 self-start text-xs text-muted underline underline-offset-2"
                    >
                      {t.cart.remove}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="border-t border-line bg-white/70 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
            {quote?.problems.some((p) => p.kind !== "qty_reduced") && <p className="mb-2 text-xs text-clay">{t.checkout.errors.cart_changed}</p>}
            <Row label={t.cart.subtotal} value={quote ? formatTND(quote.subtotal, lang) : t.cart.loading} />
            <Row label={t.cart.delivery} value={quote?.delivery ? (quote.delivery.free ? t.product.free : formatTND(quote.delivery.fee, lang)) : t.cart.deliveryAtCheckout} muted />
            <Link
              href={href(lang, "/commande")}
              onClick={() => setOpen(false)}
              className="mt-3 flex h-[52px] w-full items-center justify-center gap-2 rounded-full bg-sea text-[15px] font-semibold text-white shadow-soft transition active:scale-[.99]"
              data-testid="drawer-checkout"
            >
              {t.cart.checkout}
              {quote && <span className="ltr-nums opacity-90">· {formatTND(quote.total, lang)}</span>}
            </Link>
            <p className="mt-2 text-center text-xs text-muted">{t.trust.cod}</p>
          </div>
        </>
      )}
    </Sheet>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-0.5 text-sm ${muted ? "text-muted" : ""}`}>
      <span>{label}</span>
      <span className="ltr-nums">{value}</span>
    </div>
  );
}

export function Qty({ value, onChange, max = 10 }: { value: number; onChange: (v: number) => void; max?: number }) {
  return (
    <div className="inline-flex h-9 items-center rounded-full border border-line bg-white">
      <button type="button" className="flex h-9 w-9 items-center justify-center disabled:opacity-30" onClick={() => onChange(value - 1)} disabled={value <= 1} aria-label="−">
        <IconMinus />
      </button>
      <span className="w-6 text-center text-sm ltr-nums">{value}</span>
      <button type="button" className="flex h-9 w-9 items-center justify-center disabled:opacity-30" onClick={() => onChange(value + 1)} disabled={value >= max} aria-label="+">
        <IconPlus />
      </button>
    </div>
  );
}

/** A real threshold, a real remainder: the bar is only drawn when the shop set free delivery. */
export function FreeBar({ lang, remaining, threshold, subtotal }: { lang: Lang; remaining: number | null; threshold: number; subtotal: number }) {
  const t = dict(lang);
  const pct = Math.min(100, Math.round((subtotal / threshold) * 100));
  const reached = remaining == null || remaining <= 0;
  return (
    <div className="border-b border-line bg-sea-soft/60 px-5 py-3">
      <p className="flex items-center gap-2 text-[13px] text-sea-2">
        <IconTruck className="h-4 w-4" />
        {reached ? t.cart.freeReached : t.cart.freeRemaining(formatTND(remaining!, lang))}
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white">
        <div className="h-full rounded-full bg-sea transition-all" style={{ width: `${reached ? 100 : pct}%` }} />
      </div>
    </div>
  );
}
