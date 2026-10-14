"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { dict, href, pick, type Lang } from "@/i18n";
import type { ProductPage } from "@/lib/catalog";
import type { PublicSettings } from "@/lib/settings-schema";
import { fetchQuote, getGov, setGov, type PublicQuote } from "@/lib/client/quote";
import { currentAttribution, track, trackNow } from "@/lib/client/track";
import { adIds, getConsent } from "@/lib/client/consent";
import { pixelContact, pixelInitiateCheckout } from "@/lib/client/pixels";
import { randomId, store } from "@/lib/client/storage";
import { useHydrated } from "@/lib/client/hydrated";
import { formatTND } from "@/lib/money";
import { formatPhone, normalizePhone } from "@/lib/phone";
import { GOVERNORATES, governorateLabel } from "@/lib/governorates";
import { deliveryRangeLabel } from "@/lib/delivery";
import { discountPct, formatDay } from "@/lib/offer-display";
import { IconCheck, IconMinus, IconPlus, IconShield, IconTruck, IconWhatsApp } from "./Icons";

type P = Omit<ProductPage, "related">;
type Offer = P["offers"][number];
type Form = { name: string; phone: string; governorate: string; address: string };

const noopSubscribe = () => () => {};
const readSearch = () => location.search;

/** What a returning customer does not type twice. Kept in this browser only. */
const SAVED = "mena_details";
/** Ties an unfinished form to the back office's "commandes non terminées". Renewed after each order. */
const FORM_TOKEN = "mena_form_token";
const ADDRESS_MAX = 300;

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

/**
 * The whole purchase, on the product page: choose (offer or quantity, and
 * the option), give a name, a phone, a governorate and an address, confirm.
 * No basket, no second page. Every price shown is the server's answer for
 * exactly this choice and this governorate, or the page's own price while
 * that answer is on its way.
 */
export function BuyBox({ p, lang, settings, url, choice, idp = "bb" }: { p: P; lang: Lang; settings: PublicSettings; url: string; choice: BuyChoice; idp?: string }) {
  // Ids are prefixed, so the quick form (in a sheet) and the product page's form never share one.
  const id = (k: string) => `${idp}-${k}`;
  const t = dict(lang);
  const router = useRouter();
  const hydrated = useHydrated();
  const { variant, offer, hasOffers, qty, maxQty } = choice;
  const offerId = offer?.id ?? null;
  // A returning customer's details, read from this browser once the page is live
  // (the server renders the form empty, so hydration never disagrees).
  const savedRaw = useSyncExternalStore(noopSubscribe, () => store.get(SAVED) ?? "", () => "");
  const savedGov = useSyncExternalStore(noopSubscribe, () => getGov() ?? "", () => "");
  const saved = useMemo<Partial<Form>>(() => {
    try {
      return JSON.parse(savedRaw || "{}");
    } catch {
      return {};
    }
  }, [savedRaw]);
  const [edits, setEdits] = useState<Partial<Form>>({});
  const f: Form = {
    name: edits.name ?? saved.name ?? "",
    phone: edits.phone ?? saved.phone ?? "",
    address: edits.address ?? saved.address ?? "",
    governorate: edits.governorate ?? (saved.governorate || savedGov || ""),
  };
  const [touched, setTouched] = useState<Partial<Record<keyof Form | "variant", boolean>>>({});
  const [serverBad, setServerBad] = useState<string[]>([]);
  const [showPromo, setShowPromo] = useState(false);
  const [promoInput, setPromoInput] = useState("");
  const [promo, setPromo] = useState<string | null>(null);
  const [answer, setAnswer] = useState<{ key: string; q: PublicQuote } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The visitor has used the form itself (not just looked at the page with saved details).
  const [engaged, setEngaged] = useState(false);
  const phoneLogged = useRef(false);

  const unit = variant?.price ?? p.price;
  const out = p.stock.kind === "out" || (variant?.soldOut ?? false);
  const needsVariant = p.variants.length > 0 && !variant;
  const phone = normalizePhone(f.phone);
  const line = useMemo(() => ({ productId: p.id, variantId: variant?.id ?? null, offerId, qty: offerId ? 1 : qty }), [p.id, variant?.id, offerId, qty]);
  // A price answer counts only for the exact choice it was asked for.
  const quoteKey = JSON.stringify([line, f.governorate, promo, promo ? phone : null]);
  const quote = answer?.key === quoteKey ? answer.q : null;

  /** Takes the server's answer, and turns what it refused into a plain sentence next to the choice. */
  function absorb(q: PublicQuote, key: string) {
    setAnswer({ key, q });
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

  // The server's price for this exact choice. A product with options is
  // priced once the option is chosen; before that the page shows its own price.
  useEffect(() => {
    if (!hydrated || needsVariant || out) return;
    const ctrl = new AbortController();
    const key = quoteKey;
    fetchQuote({ lines: [line], governorate: f.governorate || null, promoCode: promo, phone }, ctrl.signal).then((q) => {
      if (!ctrl.signal.aborted && q) absorb(q, key);
    });
    return () => ctrl.abort();
    // absorb only reads values that are part of quoteKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, quoteKey, needsVariant, out]);

  // An unfinished form with a valid phone shows up in the back office, to be called once.
  // Only once the visitor has used the form: a phone saved from an earlier order is not a new start.
  useEffect(() => {
    if (!engaged || !phone || out) return;
    if (!phoneLogged.current) {
      phoneLogged.current = true;
      track("checkout_phone_entered", { productId: p.id });
    }
    const timer = setTimeout(() => {
      let token = store.get(FORM_TOKEN);
      if (!token) {
        token = randomId();
        store.set(FORM_TOKEN, token);
      }
      const a = currentAttribution();
      void fetch("/api/cart", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, lines: [line], phone, name: f.name || undefined, governorate: f.governorate || undefined, visitorId: a.visitorId, source: a.attribution.source, campaign: a.attribution.campaign }),
        keepalive: true,
      }).catch(() => {});
    }, 900);
    return () => clearTimeout(timer);
  }, [engaged, phone, f.name, f.governorate, line, out, p.id]);

  const pageTotal = offer ? offer.price : unit * qty;

  function start() {
    if (engaged) return;
    setEngaged(true);
    track("checkout_started", { productId: p.id, value: pageTotal });
    pixelInitiateCheckout([{ id: p.id, name: p.name, price: offer ? Math.round(offer.price / offer.quantity) : unit, qty: offer ? offer.quantity : qty }], pageTotal);
  }

  function update(k: keyof Form, v: string) {
    start();
    setEdits((x) => ({ ...x, [k]: v }));
    if (k === "governorate" && v) setGov(v);
    setServerBad((b) => b.filter((x) => x !== k));
  }
  const blur = (k: keyof Form) => () => setTouched((x) => ({ ...x, [k]: true }));
  /** Enter moves to the next field instead of sending a half-filled order. */
  const next = (id: string) => (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    e.preventDefault();
    document.getElementById(id)?.focus();
  };
  const chose = () => {
    setNotice(null);
    setError(null);
  };

  const problems = {
    variant: needsVariant,
    name: f.name.trim().length < 2,
    phone: !phone,
    // In the order the fields are on screen: the first empty one gets the focus.
    governorate: !f.governorate,
    address: f.address.trim().length < 4,
  };
  const show = (k: keyof typeof problems) => Boolean((touched[k] && problems[k]) || serverBad.includes(k));

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || out) return;
    start();
    const bad = (Object.keys(problems) as (keyof typeof problems)[]).filter((k) => problems[k]);
    if (bad.length) {
      setTouched(Object.fromEntries(bad.map((k) => [k, true])));
      if (bad[0] === "variant") {
        document.getElementById(id("variants"))?.scrollIntoView({ behavior: "smooth", block: "center" });
        document.querySelector<HTMLButtonElement>(`#${id("variants")} button:not(:disabled)`)?.focus({ preventScroll: true });
      } else document.getElementById(id(bad[0]))?.focus();
      return;
    }
    const honeypot = (e.currentTarget.elements.namedItem("website") as HTMLInputElement | null)?.value ?? "";
    setBusy(true);
    setError(null);
    try {
      // The price check may still be on its way (slow network) or may have failed: ask again now.
      let q = quote;
      if (!q) {
        q = await fetchQuote({ lines: [line], governorate: f.governorate, promoCode: promo, phone });
        if (!q) {
          setError(t.checkout.errors.server);
          return;
        }
        absorb(q, quoteKey);
        if (q.lines.length === 0 || q.problems.some((x) => x.productId === p.id)) return;
      }
      const a = currentAttribution();
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          lines: [line],
          phone: f.phone,
          name: f.name,
          governorate: f.governorate,
          address: f.address,
          promoCode: promo ?? undefined,
          payment: "COD",
          expectedTotal: q.total,
          cartToken: store.get(FORM_TOKEN) ?? undefined,
          restoredCartId: choice.restoredCartId ?? undefined,
          visitorId: a.visitorId,
          sessionId: a.sessionId,
          attribution: a.attribution,
          consentAds: getConsent() === "granted",
          ad: adIds(),
          locale: lang,
          website: honeypot,
        }),
      });
      const data = await res.json().catch(() => ({ ok: false, error: "server" }));
      if (data.ok) {
        store.set(SAVED, JSON.stringify({ name: f.name, phone: f.phone, governorate: f.governorate, address: f.address, ref: data.ref }));
        store.remove(FORM_TOKEN);
        router.push(href(lang, `/commande/merci/${data.ref}`));
        return;
      }
      trackNow("checkout_failed", { productId: p.id, props: { error: data.error } });
      if (data.quote) absorb(data.quote, quoteKey);
      if (data.error === "invalid") setServerBad(data.fields ?? []);
      const offerGone = data.quote?.problems?.some((x: { kind: string }) => x.kind === "offer_unavailable");
      setError(offerGone ? t.buy.offerGone : (t.checkout.errors[data.error] ?? t.checkout.errors.server));
    } catch {
      setError(t.checkout.errors.server);
    } finally {
      setBusy(false);
    }
  }

  // Before the server answers (or before an option is chosen), the page's own figures; never a 0 for a refused line.
  const priced = quote != null && quote.lines.length > 0;
  const price = priced ? quote.subtotal : pageTotal;
  const delivery = priced ? quote.delivery : null;
  const discount = priced ? quote.discount : 0;
  // Free delivery is often known before the governorate: a free-delivery offer, a promo code, or the shop's threshold.
  const promoFree = Boolean(priced && quote.promo?.result.ok && quote.promo.result.freeDelivery);
  const threshold = settings.delivery.freeThreshold;
  const freeKnown = delivery ? delivery.free : Boolean(offer?.freeDelivery) || promoFree || (threshold != null && price - discount >= threshold);
  // With options at different prices and none chosen, the amount is only a "from".
  const priceVaries = needsVariant && p.variants.some((v) => v.price !== p.variants[0].price);
  const promoError = quote?.promo && !quote.promo.result.ok ? t.checkout.promoErrors[quote.promo.result.reason] : null;
  const shopPhone = normalizePhone(settings.shop.phone);
  const waText = t.product.whatsappText(pick(lang, p.name, p.nameAr), [variant?.name, offer ? pick(lang, offer.label, offer.labelAr) : null].filter(Boolean).join(" — ") || null, formatTND(price, lang), url);
  const locale = lang === "ar" ? "ar-TN" : "fr-FR";
  const zoneFees = Object.values(settings.delivery.zones)
    .filter((z) => z.enabled !== false)
    .map((z) => z.fee);
  const fees = zoneFees.length ? { min: Math.min(...zoneFees), max: Math.max(...zoneFees) } : null;

  return (
    // A container: the fields go two by two when the form itself is wide enough, wherever it sits.
    <form id={idp === "bb" ? "commander" : id("form")} onSubmit={submit} noValidate className="@container flex flex-col gap-4">
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
              locale={locale}
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
        <div id={id("variants")} className="flex flex-col gap-2" role="group" aria-labelledby={id("variants-label")}>
          <p id={id("variants-label")} className={`text-[19px] font-bold ${show("variant") ? "text-danger" : "text-ink"}`} aria-live="polite">
            {show("variant") ? t.buy.variantError : t.product.choose}
            {variant && <span className="font-normal text-muted"> · {variant.name}</span>}
          </p>
          <div className="flex flex-wrap gap-2">
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
                className={`min-h-12 rounded-xl border-2 px-4 text-[16px] transition ${
                  variant?.id === v.id ? "border-sea bg-sea-soft font-bold text-sea-2" : "border-field bg-white text-ink hover:border-sea/60"
                } disabled:cursor-not-allowed disabled:border-dashed disabled:border-line disabled:text-muted disabled:line-through`}
              >
                {v.name}
                {!hasOffers && v.price !== p.price && (
                  <span className="ms-1.5 text-[14px] opacity-80">
                    <span className="price-nums ltr-nums">{formatTND(v.price, lang)}</span>
                  </span>
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
        <>
          {/* -------------------------------------------- 2. details: two by two when there is room, like the shops customers know */}
          <fieldset className="grid min-w-0 items-start gap-x-3 gap-y-3.5 @lg:grid-cols-2" onFocus={start}>
            <legend className="mb-3 flex items-center gap-2.5 text-[19px] font-bold text-ink">
              {p.offers.length > 0 && <StepBadge n={2} />}
              {t.buy.step2}
            </legend>
            <Field id={id("name")} label={t.buy.name} error={show("name") ? t.buy.nameError : null}>
              <input id={id("name")} value={f.name} onChange={(e) => update("name", e.target.value)} onBlur={blur("name")} onKeyDown={next(id("phone"))} enterKeyHint="next" autoComplete="name" placeholder={t.buy.namePh} className={inputCls(show("name"))} aria-invalid={show("name")} aria-describedby={show("name") ? id("name-msg") : undefined} data-testid="name" />
            </Field>
            <Field id={id("phone")} label={t.buy.phone} error={show("phone") ? (f.phone.trim() ? t.checkout.phoneInvalid : t.buy.phoneRequired) : null} hint={t.buy.phoneHint}>
              <div className={`flex h-14 items-stretch overflow-hidden rounded-xl border-2 bg-white focus-within:border-sea ${show("phone") ? "border-danger" : "border-field"}`} dir="ltr">
                <span className="flex items-center border-e-2 border-line bg-sand px-2.5 text-[18px] text-ink-2">+216</span>
                <input id={id("phone")} value={f.phone} onChange={(e) => update("phone", e.target.value)} onBlur={blur("phone")} onKeyDown={next(id("governorate"))} enterKeyHint="next" inputMode="tel" autoComplete="tel-national" placeholder="22 123 456" maxLength={16} className="min-w-0 flex-1 bg-transparent px-3 text-[19px] tracking-wide outline-none placeholder:text-placeholder" aria-invalid={show("phone")} aria-describedby={id("phone-msg")} data-testid="phone" />
              </div>
            </Field>
            <Field id={id("governorate")} label={t.buy.governorate} error={show("governorate") ? t.buy.govError : null}>
              <select id={id("governorate")} value={f.governorate} onChange={(e) => update("governorate", e.target.value)} onBlur={blur("governorate")} autoComplete="address-level1" className={inputCls(show("governorate"))} aria-invalid={show("governorate")} aria-describedby={show("governorate") ? id("governorate-msg") : undefined} data-testid="governorate">
                <option value="">{t.buy.chooseGov}</option>
                {GOVERNORATES.map((g) => (
                  <option key={g.id} value={g.id} disabled={settings.delivery.zones[g.id]?.enabled === false}>
                    {governorateLabel(g.id, lang)}
                  </option>
                ))}
              </select>
            </Field>
            <Field id={id("address")} label={t.buy.address} error={show("address") ? t.buy.addressError : null} hint={t.buy.addressHint}>
              {/* Grows with what is typed, so the whole address can be read again before confirming. */}
              <textarea id={id("address")} value={f.address} onChange={(e) => update("address", e.target.value)} onBlur={blur("address")} enterKeyHint="done" autoComplete="street-address" rows={2} maxLength={ADDRESS_MAX} placeholder={t.buy.addressPh} className={`${inputCls(show("address"))} h-auto max-h-40 min-h-14 resize-none py-3 leading-snug [field-sizing:content]`} aria-invalid={show("address")} aria-describedby={id("address-msg")} data-testid="address" />
            </Field>
          </fieldset>

          {/* ------------------------------------------------ summary */}
          <dl className="flex flex-col gap-2 text-[16px]">
            <div className="flex justify-between gap-3 text-ink-2">
              <dt>
                {t.buy.price}
                {offer && <span className="text-muted"> · {pick(lang, offer.label, offer.labelAr)}</span>}
              </dt>
              <dd className="shrink-0 whitespace-nowrap price-nums ltr-nums">{formatTND(price, lang)}</dd>
            </div>
            {priced && quote.discount > 0 && (
              <div className="flex justify-between gap-3 text-olive">
                <dt>{t.checkout.discount}</dt>
                <dd className="shrink-0 whitespace-nowrap price-nums ltr-nums">−{formatTND(quote.discount, lang)}</dd>
              </div>
            )}
            <div className="flex justify-between gap-3 text-ink-2">
              <dt>
                {t.buy.delivery}
                {f.governorate && <span className="text-muted"> · {governorateLabel(f.governorate, lang)}</span>}
              </dt>
              <dd className="shrink-0 whitespace-nowrap price-nums ltr-nums">
                {freeKnown ? (
                  <span className="font-bold text-olive">{t.product.free}</span>
                ) : delivery ? (
                  formatTND(delivery.fee, lang)
                ) : fees ? (
                  // Before a governorate is chosen: the shop's real fees, lowest to highest.
                  fees.min === fees.max ? formatTND(fees.min, lang) : t.buy.deliveryRange(formatTND(fees.min, lang), formatTND(fees.max, lang))
                ) : (
                  <span className="text-muted">{t.buy.deliveryChoose}</span>
                )}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 border-t border-line pt-2.5">
              <dt className="font-bold text-ink">{t.buy.total}</dt>
              <dd className="shrink-0 text-end" data-testid="total">
                {priced && (delivery || freeKnown) ? (
                  <span className="whitespace-nowrap text-[23px] font-bold text-ink price-nums ltr-nums">{formatTND(delivery ? quote.total : price - discount, lang)}</span>
                ) : (
                  // Never a dash: the price is known, only the delivery (or the option) is still to come.
                  <>
                    <span className="block whitespace-nowrap text-[23px] font-bold text-ink">
                      {priceVaries && <span className="text-[15px] font-normal text-muted">{t.product.from} </span>}
                      <span className="price-nums ltr-nums">{formatTND(price - discount, lang)}</span>
                    </span>
                    {!freeKnown && <span className="block text-[15px] font-normal text-muted">{t.buy.plusDelivery}</span>}
                  </>
                )}
              </dd>
            </div>
            {delivery && (
              <p className="flex items-center gap-2 text-[15px] text-muted">
                <IconTruck className="h-4 w-4 shrink-0" />
                {t.checkout.deliveryDelay(deliveryRangeLabel(delivery.minDays, delivery.maxDays, lang))}
              </p>
            )}
            {quote?.deliveryUnavailable && <p className="text-[15px] text-danger">{t.checkout.errors.delivery_unavailable}</p>}
            {!delivery && !freeKnown && settings.delivery.freeThreshold != null && <p className="text-[15px] text-muted">{t.product.freeFrom(formatTND(settings.delivery.freeThreshold, lang))}</p>}
          </dl>

          {error && (
            <p className="rounded-xl bg-clay-soft px-4 py-3 text-[16px] text-clay" role="alert">
              {error}
            </p>
          )}

          {/* The one warm button on the page: dark blue opens the form, amber confirms it. */}
          <button type="submit" disabled={busy} className="flex min-h-[60px] w-full items-center justify-center gap-3 rounded-2xl bg-amber px-4 py-2.5 text-night shadow-[inset_0_-3px_0_var(--color-amber-2)] transition [--focus-ring:var(--color-night)] hover:bg-amber-2 active:scale-[.99] disabled:bg-amber-2 disabled:opacity-80" data-testid="place-order">
            <IconTruck className="h-7 w-7 shrink-0" />
            <span className="flex flex-col items-start leading-tight">
              <span className="text-[19px] font-bold">{busy ? t.buy.sending : t.buy.submit}</span>
              {!busy && <span className="text-[15px] text-night/85">{t.buy.submitSub}</span>}
            </span>
          </button>

          {/* The cash-on-delivery promises, right where the decision is made. */}
          <div className="flex flex-col items-center gap-1.5 text-center">
            <p className="inline-flex max-w-full items-start gap-2 text-start text-[16px] font-bold text-olive">
              <IconCheck className="mt-0.5 h-5 w-5 shrink-0" />
              {t.buy.reassure}
            </p>
            {settings.delivery.openBeforePaying && (
              <p className="inline-flex max-w-full items-start gap-2 text-start text-[16px] text-ink-2">
                <IconShield className="mt-0.5 h-5 w-5 shrink-0 text-sea" />
                {t.trust.openBeforePaying}
              </p>
            )}
            <p className="mt-1 text-[15px] leading-relaxed text-muted">
              {t.buy.consentPhone} {t.buy.consentTerms}{" "}
              <Link href={href(lang, "/conditions")} className="py-2 underline underline-offset-2" prefetch={false}>
                {t.buy.termsLink}
              </Link>
              .
            </p>
          </div>

          {(shopPhone || settings.contact.whatsapp) && (
            <div className="grid gap-2 border-t border-line pt-4 @lg:grid-cols-2">
              {shopPhone && (
                <a
                  href={`tel:+216${shopPhone}`}
                  className="flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 border-field px-3 text-center text-[16px] text-ink"
                  onClick={() => {
                    track("phone_clicked", { productId: p.id, props: { where: "product" } });
                    pixelContact();
                  }}
                >
                  {t.buy.callUs} : <strong className="ltr-nums">{formatPhone(shopPhone)}</strong>
                </a>
              )}
              {settings.contact.whatsapp && (
                <a
                  href={`https://wa.me/216${settings.contact.whatsapp}?text=${encodeURIComponent(waText)}`}
                  target="_blank"
                  rel="noopener"
                  onClick={() => {
                    track("whatsapp_clicked", { productId: p.id, props: { where: "product" } });
                    pixelContact();
                  }}
                  className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-wa-soft px-3 text-[16px] font-bold text-wa-ink"
                >
                  <IconWhatsApp className="h-5 w-5" />
                  {t.buy.whatsapp}
                </a>
              )}
            </div>
          )}
          {!showPromo && !promo ? (
            <button type="button" onClick={() => setShowPromo(true)} className="inline-flex min-h-11 items-center self-center px-3 text-[15px] text-muted underline underline-offset-4">
              {t.buy.promo}
            </button>
          ) : promo ? (
            <div className="flex items-center justify-between text-[15px]">
              <span className="rounded-full bg-sea-soft px-3 py-1 font-bold text-sea-2 ltr-nums">{promo}</span>
              <button type="button" className="text-muted underline" onClick={() => setPromo(null)}>
                {t.checkout.removeCode}
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                value={promoInput}
                onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  // "OK" on the phone keyboard applies the code; it never sends the order without it.
                  if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
                  e.preventDefault();
                  if (promoInput.trim()) setPromo(promoInput.trim());
                }}
                enterKeyHint="done"
                placeholder={t.checkout.promo}
                aria-label={t.checkout.promo}
                className="h-12 min-w-0 flex-1 rounded-xl border-2 border-field px-3 text-[17px] uppercase outline-none placeholder:text-placeholder focus:border-sea"
                dir="ltr"
                autoCapitalize="characters"
              />
              <button type="button" onClick={() => promoInput.trim() && setPromo(promoInput.trim())} className="h-12 rounded-xl bg-ink px-4 text-[16px] font-bold text-white">
                {t.checkout.apply}
              </button>
            </div>
          )}
          {promo && promoError && <p className="-mt-2 text-[15px] text-danger">{promoError}</p>}
          {/* Honeypot: invisible to people, irresistible to bots. */}
          <input type="text" name="website" tabIndex={-1} autoComplete="off" className="absolute -start-[9999px] h-0 w-0 opacity-0" aria-hidden />
        </>
      )}
    </form>
  );
}

/**
 * One offer, laid out like the cards Tunisian shoppers already know: the
 * picture with its quantity, the name, the price with the real price it
 * replaces and the saving, and the round choice at the end.
 */
function OfferCard({ o, lang, locale, imageId, checked, disabled, onSelect }: { o: Offer; lang: Lang; locale: string; imageId: string | null; checked: boolean; disabled: boolean; onSelect: () => void }) {
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
          {pct > 0 && !disabled && <span className="rounded-full bg-olive px-2 py-0.5 text-[14px] font-bold text-white ltr-nums">−{pct}%</span>}
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
      <input type="radio" name="offer" checked={checked} disabled={disabled} onChange={onSelect} className="h-6 w-6 shrink-0 accent-[var(--color-sea)]" data-testid={`offer-${o.quantity}`} />
    </label>
  );
}

function StepBadge({ n }: { n: number }) {
  return (
    <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy text-[16px] text-white">
      {n}
    </span>
  );
}

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string | null; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-[16px] font-bold text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-msg`} className="text-[15px] font-bold text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-msg`} className="text-[15px] leading-snug text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function inputCls(invalid: boolean) {
  return `h-14 w-full min-w-0 rounded-xl border-2 bg-white px-3 text-[18px] text-ink outline-none placeholder:text-placeholder focus:border-sea ${invalid ? "border-danger" : "border-field"}`;
}
