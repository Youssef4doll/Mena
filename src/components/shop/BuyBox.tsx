"use client";

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
import { IconCheck, IconMinus, IconPlus, IconTruck, IconWhatsApp } from "./Icons";

type P = Omit<ProductPage, "related">;
type Offer = P["offers"][number];
type Form = { name: string; phone: string; governorate: string; address: string };

const noopSubscribe = () => () => {};

/** What a returning customer does not type twice. Kept in this browser only. */
const SAVED = "mena_details";
/** Ties an unfinished form to the back office's "commandes non terminées". Renewed after each order. */
const FORM_TOKEN = "mena_form_token";

/**
 * The whole purchase, on the product page: choose (offer or quantity, and
 * the option), give a name, a phone, a governorate and an address, confirm.
 * No basket, no second page. Every price shown is the server's answer for
 * exactly this choice and this governorate.
 */
/** "?offre=<id>": the offer a reminder link or an ad points to. Read on the client, so the page stays static. */
const offerFromUrl = () => new URLSearchParams(location.search).get("offre") ?? "";

export function BuyBox({ p, lang, settings, url }: { p: P; lang: Lang; settings: PublicSettings; url: string }) {
  const t = dict(lang);
  const router = useRouter();
  const hydrated = useHydrated();
  const hasOffers = p.offers.length > 0;
  const firstAvailable = p.variants.find((v) => !v.soldOut);
  const urlOffer = useSyncExternalStore(noopSubscribe, offerFromUrl, () => "");
  const [pickedOffer, setOfferId] = useState<string | null>(null);
  const offerId = hasOffers ? (pickedOffer ?? p.offers.find((o) => o.id === urlOffer)?.id ?? p.offers[0].id) : null;
  const [qty, setQty] = useState(1);
  const [variantId, setVariantId] = useState<string | null>(p.variants.length === 1 && firstAvailable ? firstAvailable.id : null);
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
  const [quote, setQuote] = useState<PublicQuote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const started = useRef(false);
  const phoneLogged = useRef(false);

  const variant = p.variants.find((v) => v.id === variantId) ?? null;
  const unit = variant?.price ?? p.price;
  const out = p.stock.kind === "out" || (variant?.soldOut ?? false);
  const needsVariant = p.variants.length > 0 && !variant;
  const maxQty = p.stock.kind === "low" ? p.stock.qty : (variant?.lowQty ?? 10);
  const phone = normalizePhone(f.phone);
  const line = useMemo(() => ({ productId: p.id, variantId, offerId, qty: offerId ? 1 : qty }), [p.id, variantId, offerId, qty]);

  // The server's price for this exact choice. A product with variants is
  // priced once the option is chosen; before that the page shows the offer's own price.
  useEffect(() => {
    if (!hydrated || needsVariant || out) return;
    const ctrl = new AbortController();
    fetchQuote({ lines: [line], governorate: f.governorate || null, promoCode: promo, phone }, ctrl.signal).then((q) => {
      if (!ctrl.signal.aborted && q) setQuote(q);
    });
    return () => ctrl.abort();
  }, [hydrated, line, f.governorate, promo, phone, needsVariant, out]);

  // An unfinished form with a valid phone shows up in the back office, to be called once.
  useEffect(() => {
    if (!phone || out) return;
    if (!phoneLogged.current) {
      phoneLogged.current = true;
      track("checkout_phone_entered", { productId: p.id });
    }
    const id = setTimeout(() => {
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
    return () => clearTimeout(id);
  }, [phone, f.name, f.governorate, line, out, p.id]);

  function start() {
    if (started.current) return;
    started.current = true;
    const value = quote?.subtotal ?? (offerId ? (p.offers.find((o) => o.id === offerId)?.price ?? unit) : unit * qty);
    track("checkout_started", { productId: p.id, value });
    pixelInitiateCheckout([{ id: p.id, name: p.name, price: unit, qty: offerId ? (p.offers.find((o) => o.id === offerId)?.quantity ?? 1) : qty }], value);
  }

  function update(k: keyof Form, v: string) {
    start();
    setEdits((x) => ({ ...x, [k]: v }));
    if (k === "governorate" && v) setGov(v);
    setServerBad((b) => b.filter((x) => x !== k));
  }
  const blur = (k: keyof Form) => () => setTouched((x) => ({ ...x, [k]: true }));

  const problems = {
    variant: needsVariant,
    name: f.name.trim().length < 2,
    phone: !phone,
    governorate: !f.governorate,
    address: f.address.trim().length < 4,
  };
  const show = (k: keyof typeof problems) => Boolean((touched[k] && problems[k]) || serverBad.includes(k));

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || out) return;
    start();
    const bad = (Object.keys(problems) as (keyof typeof problems)[]).filter((k) => problems[k]);
    if (bad.length || !quote) {
      setTouched(Object.fromEntries((bad.length ? bad : ["governorate"]).map((k) => [k, true])));
      const first = bad[0];
      if (first === "variant") document.getElementById("variants")?.scrollIntoView({ behavior: "smooth", block: "center" });
      else if (first) document.getElementById(`bb-${first}`)?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    const a = currentAttribution();
    const honeypot = (e.currentTarget.elements.namedItem("website") as HTMLInputElement | null)?.value ?? "";
    try {
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
          expectedTotal: quote.total,
          cartToken: store.get(FORM_TOKEN) ?? undefined,
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
        store.set(SAVED, JSON.stringify({ name: f.name, phone: f.phone, governorate: f.governorate, address: f.address }));
        store.remove(FORM_TOKEN);
        router.push(href(lang, `/commande/merci/${data.ref}`));
        return;
      }
      trackNow("checkout_failed", { productId: p.id, props: { error: data.error } });
      if (data.quote) setQuote(data.quote);
      if (data.error === "invalid") setServerBad(data.fields ?? []);
      const offerGone = data.quote?.problems?.some((x: { kind: string }) => x.kind === "offer_unavailable");
      setError(offerGone ? t.buy.offerGone : (t.checkout.errors[data.error] ?? t.checkout.errors.server));
      if (offerGone) router.refresh();
    } catch {
      setError(t.checkout.errors.server);
    } finally {
      setBusy(false);
    }
  }

  const chosenOffer = p.offers.find((o) => o.id === offerId) ?? null;
  // Before the server answers (or before an option is chosen), the page's own figures.
  const price = quote?.subtotal ?? (chosenOffer ? chosenOffer.price : unit * qty);
  const delivery = quote?.delivery ?? null;
  const promoError = quote?.promo && !quote.promo.result.ok ? t.checkout.promoErrors[quote.promo.result.reason] : null;
  const shopPhone = normalizePhone(settings.shop.phone);
  const waText = t.product.whatsappText(pick(lang, p.name, p.nameAr), [variant?.name, chosenOffer ? pick(lang, chosenOffer.label, chosenOffer.labelAr) : null].filter(Boolean).join(" — ") || null, formatTND(price, lang), url);

  return (
    <form id="commander" onSubmit={submit} noValidate className="scroll-mt-20 flex flex-col gap-5 rounded-3xl border border-line bg-white p-4 shadow-soft sm:p-6">
      {/* ------------------------------------------------------ 1. choose */}
      {hasOffers && (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-[17px] font-bold text-ink">{t.buy.step1}</legend>
          {p.offers.map((o) => (
            <OfferCard key={o.id} o={o} lang={lang} unit={unit} imageId={p.images[0]?.id ?? null} checked={offerId === o.id} onSelect={() => { setOfferId(o.id); start(); }} />
          ))}
        </fieldset>
      )}

      {p.variants.length > 0 && (
        <div id="variants" className="flex flex-col gap-2.5 scroll-mt-24">
          <p className={`text-[17px] font-bold ${show("variant") ? "text-danger" : "text-ink"}`}>
            {show("variant") ? t.buy.variantError : t.product.choose}
            {variant && <span className="font-normal text-muted"> · {variant.name}</span>}
          </p>
          <div className="flex flex-wrap gap-2.5">
            {p.variants.map((v) => (
              <button
                key={v.id}
                type="button"
                disabled={v.soldOut}
                onClick={() => {
                  setVariantId(v.id);
                  setQty(1);
                  start();
                }}
                aria-pressed={variantId === v.id}
                className={`min-h-12 rounded-xl border-2 px-4 text-[16px] transition ${
                  variantId === v.id ? "border-sea bg-sea-soft font-bold text-sea-2" : "border-line bg-white text-ink hover:border-sea/50"
                } disabled:cursor-not-allowed disabled:border-dashed disabled:text-muted disabled:line-through`}
              >
                {v.name}
                {!hasOffers && v.price !== p.price && <span className="ms-1.5 text-[14px] opacity-80 ltr-nums">{formatTND(v.price, lang)}</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {!hasOffers && !out && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-[17px] font-bold text-ink">{t.buy.quantity}</span>
          <div className="inline-flex h-12 items-center rounded-xl border-2 border-line bg-white">
            <button type="button" className="flex h-12 w-12 items-center justify-center disabled:opacity-30" onClick={() => setQty((x) => Math.max(1, x - 1))} disabled={qty <= 1} aria-label="−">
              <IconMinus className="h-5 w-5" />
            </button>
            <span className="w-8 text-center text-[18px] font-bold ltr-nums" aria-live="polite">{qty}</span>
            <button type="button" className="flex h-12 w-12 items-center justify-center disabled:opacity-30" onClick={() => setQty((x) => Math.min(maxQty, x + 1))} disabled={qty >= maxQty} aria-label="+">
              <IconPlus className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      {out ? (
        <p className="rounded-2xl bg-sand px-4 py-4 text-[16px] text-ink-2">{t.product.outSub}</p>
      ) : (
        <>
          {/* -------------------------------------------- 2. details */}
          <fieldset className="flex flex-col gap-4" onFocus={start}>
            <legend className="mb-2 text-[17px] font-bold text-ink">{t.buy.step2}</legend>
            <Field id="name" label={t.buy.name} error={show("name") ? t.buy.nameError : null}>
              <input id="bb-name" value={f.name} onChange={(e) => update("name", e.target.value)} onBlur={blur("name")} autoComplete="name" placeholder={t.buy.namePh} className={inputCls(show("name"))} data-testid="name" />
            </Field>
            <Field id="phone" label={t.buy.phone} error={show("phone") ? t.checkout.phoneInvalid : null} hint={t.buy.phoneHint}>
              <div className={`flex h-14 items-stretch overflow-hidden rounded-xl border-2 bg-white focus-within:border-sea ${show("phone") ? "border-danger" : "border-line"}`} dir="ltr">
                <span className="flex items-center border-e-2 border-line bg-sand px-3 text-[18px] text-ink-2">+216</span>
                <input id="bb-phone" value={f.phone} onChange={(e) => update("phone", e.target.value)} onBlur={blur("phone")} inputMode="tel" autoComplete="tel-national" placeholder="22 123 456" maxLength={16} className="min-w-0 flex-1 bg-transparent px-3 text-[19px] tracking-wide outline-none" aria-invalid={show("phone")} data-testid="phone" />
              </div>
            </Field>
            <Field id="governorate" label={t.buy.governorate} error={show("governorate") ? t.buy.govError : null}>
              <select id="bb-governorate" value={f.governorate} onChange={(e) => update("governorate", e.target.value)} onBlur={blur("governorate")} autoComplete="address-level1" className={inputCls(show("governorate"))} data-testid="governorate">
                <option value="">{t.buy.chooseGov}</option>
                {GOVERNORATES.map((g) => (
                  <option key={g.id} value={g.id} disabled={settings.delivery.zones[g.id]?.enabled === false}>
                    {governorateLabel(g.id, lang)}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="address" label={t.buy.address} error={show("address") ? t.buy.addressError : null}>
              <textarea id="bb-address" value={f.address} onChange={(e) => update("address", e.target.value)} onBlur={blur("address")} autoComplete="street-address" rows={2} placeholder={t.buy.addressPh} className={`${inputCls(show("address"))} h-auto py-3 leading-snug`} data-testid="address" />
            </Field>
          </fieldset>

          {/* ------------------------------------------------ summary */}
          <dl className="flex flex-col gap-2 rounded-2xl bg-sand/70 p-4 text-[16px]">
            <div className="flex justify-between gap-3 text-ink-2">
              <dt>{t.buy.price}{chosenOffer && <span className="text-muted"> · {pick(lang, chosenOffer.label, chosenOffer.labelAr)}</span>}</dt>
              <dd className="ltr-nums">{formatTND(price, lang)}</dd>
            </div>
            {quote && quote.discount > 0 && (
              <div className="flex justify-between gap-3 text-olive">
                <dt>{t.checkout.discount}</dt>
                <dd className="ltr-nums">−{formatTND(quote.discount, lang)}</dd>
              </div>
            )}
            <div className="flex justify-between gap-3 text-ink-2">
              <dt>{t.buy.delivery}{f.governorate && <span className="text-muted"> · {governorateLabel(f.governorate, lang)}</span>}</dt>
              <dd className="ltr-nums">{delivery ? (delivery.free ? <span className="font-bold text-olive">{t.product.free}</span> : formatTND(delivery.fee, lang)) : <span className="text-muted">{t.buy.deliveryChoose}</span>}</dd>
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-sand-2 pt-3">
              <dt className="font-bold text-ink">{t.buy.total}</dt>
              <dd className="text-[24px] font-bold text-ink ltr-nums" data-testid="total">
                {quote && delivery ? formatTND(quote.total, lang) : "—"}
              </dd>
            </div>
            {delivery && (
              <p className="flex items-center gap-2 text-[14px] text-muted">
                <IconTruck className="h-4 w-4" />
                {t.checkout.deliveryDelay(deliveryRangeLabel(delivery.minDays, delivery.maxDays, lang))}
              </p>
            )}
            {quote?.deliveryUnavailable && <p className="text-[14px] text-danger">{t.checkout.errors.delivery_unavailable}</p>}
            {!delivery && settings.delivery.freeThreshold != null && <p className="text-[14px] text-muted">{t.product.freeFrom(formatTND(settings.delivery.freeThreshold, lang))}</p>}
          </dl>

          {!showPromo && !promo ? (
            <button type="button" onClick={() => setShowPromo(true)} className="-mt-2 self-start text-[15px] text-sea underline underline-offset-4">
              {t.buy.promo}
            </button>
          ) : promo ? (
            <div className="-mt-2 flex items-center justify-between text-[15px]">
              <span className="rounded-full bg-sea-soft px-3 py-1 font-bold text-sea-2 ltr-nums">{promo}</span>
              <button type="button" className="text-muted underline" onClick={() => setPromo(null)}>
                {t.checkout.removeCode}
              </button>
            </div>
          ) : (
            <div className="-mt-2 flex gap-2">
              <input value={promoInput} onChange={(e) => setPromoInput(e.target.value.toUpperCase())} placeholder={t.checkout.promo} className="h-12 min-w-0 flex-1 rounded-xl border-2 border-line px-3 text-[17px] uppercase outline-none focus:border-sea" dir="ltr" autoCapitalize="characters" />
              <button type="button" onClick={() => promoInput.trim() && setPromo(promoInput.trim())} className="h-12 rounded-xl bg-ink px-4 text-[16px] font-bold text-white">
                {t.checkout.apply}
              </button>
            </div>
          )}
          {promo && promoError && <p className="-mt-3 text-[14px] text-danger">{promoError}</p>}

          {error && (
            <p className="rounded-xl bg-clay-soft px-4 py-3 text-[16px] text-clay" role="alert">
              {error}
            </p>
          )}

          <button type="submit" disabled={busy} className="flex min-h-16 w-full flex-col items-center justify-center rounded-2xl bg-sea px-4 py-3 text-white shadow-soft transition hover:bg-sea-2 active:scale-[.99] disabled:opacity-60" data-testid="place-order">
            <span className="text-[19px] font-bold leading-tight">{busy ? t.buy.sending : t.buy.submit}</span>
            {!busy && <span className="text-[14px] leading-tight text-white/90">{t.buy.submitSub}</span>}
          </button>
          <p className="-mt-2 text-center text-[14px] leading-relaxed text-muted">{t.buy.reassure}</p>

          {(shopPhone || settings.contact.whatsapp) && (
            <div className="flex flex-col gap-2 border-t border-line pt-4">
              {shopPhone && (
                <a href={`tel:+216${shopPhone}`} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 border-line text-[16px] text-ink" onClick={() => { track("phone_clicked", { productId: p.id }); pixelContact(); }}>
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
                  className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#e8f6ee] text-[16px] font-bold text-[#17663a]"
                >
                  <IconWhatsApp className="h-5 w-5" />
                  {t.buy.whatsapp}
                </a>
              )}
            </div>
          )}
          <p className="text-center text-[13px] leading-relaxed text-muted">{t.checkout.consent}</p>
          {/* Honeypot: invisible to people, irresistible to bots. */}
          <input type="text" name="website" tabIndex={-1} autoComplete="off" className="absolute -start-[9999px] h-0 w-0 opacity-0" aria-hidden />
        </>
      )}
    </form>
  );
}

function OfferCard({ o, lang, unit, imageId, checked, onSelect }: { o: Offer; lang: Lang; unit: number; imageId: string | null; checked: boolean; onSelect: () => void }) {
  const t = dict(lang);
  // "Instead of" is what the same units cost one by one: a real price, never an invented one.
  const separately = unit * o.quantity;
  const saving = separately > o.price ? separately - o.price : 0;
  return (
    <label className={`relative flex cursor-pointer items-center gap-3 rounded-2xl border-2 p-3 transition ${checked ? "border-sea bg-sea-soft/60" : "border-line bg-white hover:border-sea/40"}`}>
      <input type="radio" name="offer" checked={checked} onChange={onSelect} className="h-6 w-6 shrink-0 accent-[var(--color-sea)]" data-testid={`offer-${o.quantity}`} />
      <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-sand">
        {imageId && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/img/${imageId}/128`} alt="" className="h-full w-full object-cover" />
        )}
        <span className="absolute bottom-1 end-1 rounded-md bg-sea px-1.5 text-[12px] font-bold text-white ltr-nums">×{o.quantity}</span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        {o.mostChosen && (
          <span className="inline-flex items-center gap-1 self-start rounded-full bg-sea px-2 py-0.5 text-[12px] font-bold text-white">
            <IconCheck className="h-3 w-3" /> {t.buy.mostChosen}
          </span>
        )}
        <span className="text-[17px] font-bold leading-snug text-ink">{pick(lang, o.label, o.labelAr)}</span>
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-[19px] font-bold text-ink ltr-nums">{formatTND(o.price, lang)}</span>
          {saving > 0 && <span className="text-[14px] text-muted line-through ltr-nums">{formatTND(separately, lang)}</span>}
        </span>
        <span className="flex flex-wrap gap-1.5">
          {saving > 0 && <span className="rounded-full bg-olive-soft px-2 py-0.5 text-[13px] font-bold text-olive">{t.buy.save(formatTND(saving, lang))}</span>}
          {o.freeDelivery && <span className="rounded-full bg-sea-soft px-2 py-0.5 text-[13px] font-bold text-sea-2">{t.buy.freeDelivery}</span>}
        </span>
        {o.endsAt && (
          <span className="text-[13px] text-muted">{t.buy.until(new Date(o.endsAt).toLocaleDateString(lang === "ar" ? "ar-TN" : "fr-FR", { day: "numeric", month: "long" }))}</span>
        )}
      </span>
    </label>
  );
}

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string | null; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`bb-${id}`} className="text-[16px] font-bold text-ink">
        {label}
      </label>
      {children}
      {error ? <p className="text-[15px] font-bold text-danger">{error}</p> : hint ? <p className="text-[14px] text-muted">{hint}</p> : null}
    </div>
  );
}

function inputCls(invalid: boolean) {
  return `h-14 w-full rounded-xl border-2 bg-white px-3 text-[18px] text-ink outline-none placeholder:text-[#8a95a3] focus:border-sea ${invalid ? "border-danger" : "border-line"}`;
}
