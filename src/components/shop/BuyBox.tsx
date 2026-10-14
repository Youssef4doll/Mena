"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useSyncExternalStore } from "react";
import { dict, pick, type Lang } from "@/i18n";
import type { ProductPage } from "@/lib/catalog";
import type { PublicSettings } from "@/lib/settings-schema";
import type { PublicQuote } from "@/lib/client/quote";
import { track } from "@/lib/client/track";
import { pixelAddToCart } from "@/lib/client/pixels";
import { addToCart, type CartItem } from "@/lib/client/cart";
import { formatTND } from "@/lib/money";
import { discountPct, formatDay } from "@/lib/offer-display";
import { OrderForm, StepBadge } from "./OrderForm";
import { IconCheck, IconMinus, IconPlus } from "./Icons";

type P = Omit<ProductPage, "related">;
type Offer = P["offers"][number];

const noopSubscribe = () => () => {};
const readSearch = () => location.search;

/**
 * What the customer picked: offer, option, quantity. Held by the product page
 * so the price at the top follows the form. A reminder link or an ad can
 * preselect them (?offre=, ?option=, ?qte=); the URL is read in the browser,
 * so the page itself stays static.
 */
export function useBuyChoice(p: P) {
  const search = useSyncExternalStore(noopSubscribe, readSearch, () => "");
  const url = useMemo(() => new URLSearchParams(search), [search]);
  const [pickedOffer, setOffer] = useState<string | null>(null);
  const [pickedVariant, setVariant] = useState<string | null>(null);
  const [pickedQty, setQty] = useState<number | null>(null);
  // What the server said at the last price check: offers that are gone, and units left per option.
  const [gone, setGone] = useState<string[]>([]);
  const [left, setLeft] = useState<Record<string, number>>({});

  const urlVariant = p.variants.find((v) => v.id === url.get("option") && !v.soldOut)?.id ?? null;
  const only = p.variants.length === 1 && !p.variants[0].soldOut ? p.variants[0].id : null;
  const variantId = pickedVariant ?? urlVariant ?? only;
  const variant = p.variants.find((v) => v.id === variantId) ?? null;
  const known = variant ? variant.maxUnits : p.maxUnits;
  const serverLeft = left[variantId ?? ""];
  const cap = serverLeft != null ? Math.min(serverLeft, known ?? Infinity) : known;
  const fits = (o: Offer) => !gone.includes(o.id) && (cap == null || o.quantity <= cap);
  const usable = p.offers.filter(fits);
  // With no pack that the stock can fill, the product is sold by the unit at its own price.
  const hasOffers = usable.length > 0;
  const offer = hasOffers ? (usable.find((o) => o.id === pickedOffer) ?? usable.find((o) => o.id === url.get("offre")) ?? usable[0]) : null;
  const maxQty = Math.max(1, Math.min(10, cap ?? 10));
  const urlQty = Number.parseInt(url.get("qte") ?? "", 10);
  const qty = Math.min(pickedQty ?? (urlQty > 0 ? urlQty : 1), maxQty);
  const relance = url.get("relance");

  return {
    variant,
    offer,
    hasOffers,
    fits,
    qty,
    maxQty,
    restoredCartId: relance && /^[a-z0-9]{20,40}$/.test(relance) ? relance : null,
    setOffer,
    setVariant: (id: string) => {
      setVariant(id);
      setQty(null);
    },
    setQty,
    offerGone: (id: string) => setGone((g) => [...g, id]),
    unitsLeft: (variantId: string | null, n: number) => setLeft((l) => ({ ...l, [variantId ?? ""]: n })),
  };
}
export type BuyChoice = ReturnType<typeof useBuyChoice>;

/** The current choice as a basket line, or null while an option is still to choose. */
export function choiceItem(p: P, c: BuyChoice): CartItem | null {
  if (p.variants.length > 0 && !c.variant) return null;
  return {
    productId: p.id,
    variantId: c.variant?.id ?? null,
    offerId: c.offer?.id ?? null,
    qty: c.offer ? 1 : c.qty,
    slug: p.slug,
    name: p.name,
    nameAr: p.nameAr,
    variantName: c.variant?.name ?? null,
    variantNameAr: c.variant?.nameAr ?? null,
    offerLabel: c.offer?.label ?? null,
    offerLabelAr: c.offer?.labelAr ?? null,
    imageId: p.images[0]?.id ?? null,
  };
}

/** "Ajouter au panier": the current choice goes into the basket, with the same tracking wherever the button is. */
export function addChoiceToCart(p: P, c: BuyChoice, where: string): boolean {
  const item = choiceItem(p, c);
  if (!item) return false;
  const unit = c.offer ? Math.round(c.offer.price / c.offer.quantity) : (c.variant?.price ?? p.price);
  const units = c.offer ? c.offer.quantity : c.qty;
  const result = addToCart(item);
  if (result === "added" || result === "more") {
    track("add_to_cart", { productId: p.id, value: unit * units, props: { where, offer: Boolean(c.offer) } });
    pixelAddToCart({ id: p.id, name: p.name, price: unit, qty: units });
  }
  return true;
}

/**
 * The whole purchase, on the product page: choose (offer or quantity, and
 * the option), then the cash-on-delivery form. "Acheter maintenant" orders
 * this product on the spot; "Ajouter au panier" keeps it for an order of
 * several products.
 */
export function BuyBox({ p, lang, settings, url, choice, idp = "bb", onAdded }: { p: P; lang: Lang; settings: PublicSettings; url: string; choice: BuyChoice; idp?: string; onAdded?: () => void }) {
  // Ids are prefixed, so the quick form (in a sheet) and the product page's form never share one.
  const id = (k: string) => `${idp}-${k}`;
  const t = dict(lang);
  const router = useRouter();
  const { variant, offer, hasOffers, qty, maxQty } = choice;
  const offerId = offer?.id ?? null;
  const [notice, setNotice] = useState<string | null>(null);
  const [variantError, setVariantError] = useState(false);

  const unit = variant?.price ?? p.price;
  const out = p.stock.kind === "out" || (variant?.soldOut ?? false);
  const needsVariant = p.variants.length > 0 && !variant;
  const lines = useMemo(() => [{ productId: p.id, variantId: variant?.id ?? null, offerId, qty: offerId ? 1 : qty }], [p.id, variant?.id, offerId, qty]);
  const pageTotal = offer ? offer.price : unit * qty;
  const priceVaries = needsVariant && p.variants.some((v) => v.price !== p.variants[0].price);

  /** Turns what the server refused into a plain sentence next to the choice. */
  function onQuote(q: PublicQuote) {
    const pr = q.problems.find((x) => x.productId === p.id);
    if (!pr) return;
    if (pr.kind === "qty_reduced" && pr.available != null) {
      choice.unitsLeft(pr.variantId, pr.available);
      setNotice(t.buy.onlyLeft(pr.available));
    } else if (pr.kind === "unavailable" && offerId && pr.available) {
      choice.unitsLeft(pr.variantId, pr.available);
      setNotice(t.buy.packTooBig);
    } else if (pr.kind === "offer_unavailable" && offerId) {
      choice.offerGone(offerId);
      setNotice(t.buy.offerGone);
      router.refresh();
    } else if (pr.kind === "unavailable" || pr.kind === "not_found") {
      setNotice(t.buy.gone);
      router.refresh();
    }
  }

  const chose = () => {
    setNotice(null);
    setVariantError(false);
  };
  function askVariant() {
    setVariantError(true);
    document.getElementById(id("variants"))?.scrollIntoView({ behavior: "smooth", block: "center" });
    document.querySelector<HTMLButtonElement>(`#${id("variants")} button:not(:disabled)`)?.focus({ preventScroll: true });
  }
  const optionLabel = [variant ? pick(lang, variant.name, variant.nameAr) : null, offer ? pick(lang, offer.label, offer.labelAr) : null].filter(Boolean).join(" — ") || null;

  return (
    // The whole box is the place "Acheter maintenant" brings the reader back to.
    <div id={idp === "bb" ? "commander" : id("box")} className="flex scroll-mt-4 flex-col gap-4">
      {/* ------------------------------------------------------ 1. choose */}
      {p.offers.length > 0 && (
        <fieldset className="flex min-w-0 flex-col gap-2.5">
          <legend className="mb-3 flex items-center gap-2.5 text-[19px] font-bold text-ink">
            <StepBadge n={1} />
            {t.buy.step1}
          </legend>
          {p.offers.map((o) => (
            <OfferCard
              key={o.id}
              o={o}
              lang={lang}
              name={`${idp}-offer`}
              locale={lang === "ar" ? "ar-TN" : "fr-FR"}
              imageId={p.images[0]?.id ?? null}
              checked={offerId === o.id}
              disabled={!choice.fits(o)}
              onSelect={() => {
                choice.setOffer(o.id);
                chose();
              }}
            />
          ))}
        </fieldset>
      )}

      {p.variants.length > 0 && (
        <div id={id("variants")} className="flex scroll-mt-24 flex-col gap-2" role="group" aria-labelledby={id("variants-label")}>
          <p id={id("variants-label")} className={`text-[19px] font-bold ${variantError && needsVariant ? "text-danger" : "text-ink"}`} aria-live="polite">
            {variantError && needsVariant ? t.buy.variantError : t.product.choose}
            {variant && <span className="font-normal text-muted">{lang === "ar" ? ": " : " : "}{pick(lang, variant.name, variant.nameAr)}</span>}
          </p>
          {/* Tiles like the shops customers know: the name, its price when it differs, and whether it is there. */}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-2">
            {p.variants.map((v) => (
              <button
                key={v.id}
                type="button"
                disabled={v.soldOut}
                onClick={() => {
                  choice.setVariant(v.id);
                  chose();
                }}
                aria-pressed={variant?.id === v.id}
                className={`flex min-h-14 flex-col items-start justify-center rounded-xl border-2 px-3 py-2 text-start transition ${
                  variant?.id === v.id ? "border-sea bg-sea-soft ring-2 ring-sea/30" : "border-field bg-white hover:border-sea/60"
                } disabled:cursor-not-allowed disabled:border-dashed disabled:border-line disabled:bg-sand/50`}
              >
                <span className={`text-[16px] leading-tight ${variant?.id === v.id ? "font-bold text-sea-2" : "text-ink"} ${v.soldOut ? "text-muted line-through" : ""}`}>{pick(lang, v.name, v.nameAr)}</span>
                {v.soldOut ? (
                  <span className="text-[14px] text-muted">{t.product.out}</span>
                ) : (
                  !hasOffers && v.price !== p.price && <span className="text-[14px] font-bold text-ink-2 price-nums ltr-nums">{formatTND(v.price, lang)}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {!hasOffers && !out && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-[17px] font-bold text-ink" id={id("qty-label")}>{t.buy.quantity}</span>
          <div className="inline-flex h-12 items-center rounded-xl border-2 border-field bg-white" role="group" aria-labelledby={id("qty-label")}>
            <button type="button" className="flex h-12 w-12 items-center justify-center disabled:opacity-30" onClick={() => { choice.setQty(Math.max(1, qty - 1)); chose(); }} disabled={qty <= 1} aria-label={t.buy.qtyLess}>
              <IconMinus className="h-5 w-5" />
            </button>
            <span className="w-8 text-center text-[18px] font-bold ltr-nums" aria-live="polite">{qty}</span>
            <button type="button" className="flex h-12 w-12 items-center justify-center disabled:opacity-30" onClick={() => { choice.setQty(Math.min(maxQty, qty + 1)); chose(); }} disabled={qty >= maxQty} aria-label={t.buy.qtyMore}>
              <IconPlus className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      {notice && (
        <p className="rounded-xl bg-clay-soft px-4 py-3 text-[16px] text-clay" role="status">
          {notice}
        </p>
      )}

      {out ? (
        <p className="rounded-2xl bg-sand px-4 py-4 text-[16px] text-ink-2">{t.product.outSub}</p>
      ) : (
        <OrderForm
          lang={lang}
          settings={settings}
          idp={idp}
          formId={idp === "bb" ? "commander-form" : id("form")}
          lines={lines}
          ready={!needsVariant}
          onNotReady={askVariant}
          pagePrice={pageTotal}
          priceLabel={t.buy.price}
          priceNote={offer ? pick(lang, offer.label, offer.labelAr) : null}
          priceVaries={priceVaries}
          freeOffer={offer?.freeDelivery}
          onQuote={onQuote}
          origin={idp === "bb" ? "product" : "quick"}
          productId={p.id}
          pixelItems={() => [{ id: p.id, name: p.name, price: offer ? Math.round(offer.price / offer.quantity) : unit, qty: offer ? offer.quantity : qty }]}
          restoredCartId={choice.restoredCartId}
          waText={t.product.whatsappText(pick(lang, p.name, p.nameAr), optionLabel, formatTND(pageTotal, lang), url)}
          onAddToCart={() => {
            if (needsVariant) {
              askVariant();
              return false;
            }
            addChoiceToCart(p, choice, idp === "bb" ? "product" : "quick");
            onAdded?.();
            return true;
          }}
          submitTitle={t.product.buyNow}
          submitSub={t.buy.submitSub}
          step={p.offers.length > 0 ? 2 : null}
        />
      )}
    </div>
  );
}

/**
 * One offer, laid out like the cards Tunisian shoppers already know: the
 * picture with its quantity, the name, the price with the real price it
 * replaces and the saving, and the round choice at the end.
 */
function OfferCard({ o, lang, name, locale, imageId, checked, disabled, onSelect }: { o: Offer; lang: Lang; name: string; locale: string; imageId: string | null; checked: boolean; disabled: boolean; onSelect: () => void }) {
  const t = dict(lang);
  // "Instead of" comes from the server: a real price, or nothing. The % is only
  // given for packs, all measured against the same one-unit offer, so a bigger
  // pack never looks like a smaller saving.
  const pct = o.quantity > 1 ? discountPct(o.price, o.compareAt) : 0;
  const struck = o.compareAt != null && o.compareAt > o.price ? o.compareAt : null;
  return (
    <label
      className={`relative flex items-center gap-3 rounded-2xl border-2 p-2.5 transition sm:p-3 ${
        disabled ? "cursor-not-allowed border-dashed border-line bg-sand/50 opacity-70" : checked ? "cursor-pointer border-sea bg-sea-soft shadow-soft ring-2 ring-sea/30" : "cursor-pointer border-field bg-white hover:border-sea/60"
      }`}
    >
      <span className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-xl bg-sand">
        {imageId && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/img/${imageId}/200`} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
        )}
        <span aria-hidden className="absolute bottom-1 end-1 rounded-md bg-sea px-2 text-[15px] font-bold leading-6 text-white">
          <span className="ltr-nums">×{o.quantity}</span>
        </span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[17px] font-bold leading-snug text-ink">{pick(lang, o.label, o.labelAr)}</span>
          {o.mostChosen && !disabled && (
            <span className="inline-flex items-center gap-1 rounded-full bg-sea px-2 py-0.5 text-[14px] font-bold text-white">
              <IconCheck className="h-3.5 w-3.5" /> {t.buy.mostChosen}
            </span>
          )}
        </span>
        <span className="relative flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="whitespace-nowrap text-[19px] font-bold text-ink price-nums ltr-nums">{formatTND(o.price, lang)}</span>
          {struck != null && !disabled && (
            <>
              <span className="sr-only">{t.buy.instead(formatTND(struck, lang))}</span>
              <span aria-hidden className="whitespace-nowrap text-[15px] text-muted line-through price-nums ltr-nums">{formatTND(struck, lang)}</span>
            </>
          )}
          {pct > 0 && !disabled && (
            <span className="rounded-md bg-deal px-2 py-0.5 text-[14px] font-bold text-white">
              <span className="ltr-nums">−{pct}%</span>
            </span>
          )}
        </span>
        {disabled ? (
          <span className="text-[15px] text-muted">{t.buy.packTooBig}</span>
        ) : (
          (o.freeDelivery || o.lastDay) && (
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px]">
              {o.freeDelivery && <span className="rounded-lg bg-olive-soft px-2 py-0.5 font-bold text-olive">{t.buy.freeDelivery}</span>}
              {o.lastDay && <span className="text-muted">{t.buy.until(formatDay(o.lastDay, locale))}</span>}
            </span>
          )
        )}
      </span>
      <input type="radio" name={name} checked={checked} disabled={disabled} onChange={onSelect} className="h-6 w-6 shrink-0 accent-[var(--color-sea)]" data-testid={`offer-${o.quantity}`} />
    </label>
  );
}
