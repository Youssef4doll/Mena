"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { dict, href, type Lang } from "@/i18n";
import type { PublicSettings } from "@/lib/settings-schema";
import { fetchQuote, getGov, setGov, type PublicQuote } from "@/lib/client/quote";
import { currentAttribution, track, trackNow } from "@/lib/client/track";
import { adIds, getConsent } from "@/lib/client/consent";
import { pixelContact, pixelInitiateCheckout, type PixelItem } from "@/lib/client/pixels";
import { randomId, store } from "@/lib/client/storage";
import { useHydrated } from "@/lib/client/hydrated";
import { formatTND } from "@/lib/money";
import { formatPhone, normalizePhone } from "@/lib/phone";
import { GOVERNORATES, governorateLabel } from "@/lib/governorates";
import { deliveryRangeLabel } from "@/lib/delivery";
import { IconCartPlus, IconCheck, IconShield, IconTruck, IconWhatsApp } from "./Icons";

export type OrderLine = { productId: string; variantId: string | null; offerId: string | null; qty: number };
type Form = { name: string; phone: string; governorate: string; address: string };

const noopSubscribe = () => () => {};

/** What a returning customer does not type twice. Kept in this browser only. */
export const SAVED = "mena_details";
/** What was typed on a product page before "Ajouter au panier", so the basket's form is already filled. */
const DRAFT = "mena_draft";
/** Ties an unfinished form to the back office's "commandes non terminées". Renewed after each order. */
const FORM_TOKEN = "mena_form_token";
const ADDRESS_MAX = 300;

function readJson(raw: string): Partial<Form> {
  try {
    const v = JSON.parse(raw || "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

type Props = {
  lang: Lang;
  settings: PublicSettings;
  /** Prefix of every id, so two forms on one page (the page and the quick sheet) never share one. */
  idp: string;
  formId: string;
  lines: OrderLine[];
  /** False while the product's option is not chosen: no price check, and the order asks for it first. */
  ready: boolean;
  onNotReady?: () => void;
  /** The page's own total, shown while the server's answer is on its way; null when the page has none (the basket). */
  pagePrice: number | null;
  /** The first row of the summary: "Prix · Achetez 2, la 3e offerte", or "Articles (3)". */
  priceLabel: string;
  priceNote?: string | null;
  /** Options at different prices and none chosen: the amount is a "from". */
  priceVaries?: boolean;
  /** The chosen offer includes delivery. */
  freeOffer?: boolean;
  /** The product or the basket reacts to what the server refused (stock, offers). */
  onQuote?: (q: PublicQuote) => void;
  origin: "product" | "quick" | "cart";
  productId?: string;
  pixelItems: () => PixelItem[];
  restoredCartId?: string | null;
  onPlaced?: () => void;
  waText: string;
  /** Shows "Ajouter au panier" under the main button. Returns false when the choice is not complete. */
  onAddToCart?: () => boolean;
  submitTitle: string;
  submitSub: string;
  /** The number in front of "Vos coordonnées" (2 after the offers), or none. */
  step?: number | null;
};

/**
 * The cash-on-delivery order, for any set of lines: name, phone, governorate,
 * address, the summary, and the button. Every amount shown is the server's
 * answer for exactly these lines and this governorate, or the page's own
 * price while that answer is on its way; the order is priced again on the
 * server and refused if the total the customer saw is not the one charged.
 */
export function OrderForm(props: Props) {
  const { lang, settings, idp, lines, ready, pagePrice, origin, productId } = props;
  const id = (k: string) => `${idp}-${k}`;
  const t = dict(lang);
  const router = useRouter();
  const hydrated = useHydrated();
  // A returning customer's details, read from this browser once the page is live
  // (the server renders the form empty, so hydration never disagrees).
  const savedRaw = useSyncExternalStore(noopSubscribe, () => store.get(SAVED) ?? "", () => "");
  const draftRaw = useSyncExternalStore(noopSubscribe, () => store.get(DRAFT) ?? "", () => "");
  const savedGov = useSyncExternalStore(noopSubscribe, () => getGov() ?? "", () => "");
  const known = useMemo<Partial<Form>>(() => ({ ...readJson(savedRaw), ...readJson(draftRaw) }), [savedRaw, draftRaw]);
  const [edits, setEdits] = useState<Partial<Form>>({});
  const f: Form = {
    name: edits.name ?? known.name ?? "",
    phone: edits.phone ?? known.phone ?? "",
    address: edits.address ?? known.address ?? "",
    governorate: edits.governorate ?? (known.governorate || savedGov || ""),
  };
  const [touched, setTouched] = useState<Partial<Record<keyof Form, boolean>>>({});
  const [serverBad, setServerBad] = useState<string[]>([]);
  const [showPromo, setShowPromo] = useState(false);
  const [promoInput, setPromoInput] = useState("");
  const [promo, setPromo] = useState<string | null>(null);
  const [answer, setAnswer] = useState<{ key: string; q: PublicQuote } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The visitor has used the form itself (not just looked at the page with saved details).
  const [engaged, setEngaged] = useState(false);
  const phoneLogged = useRef(false);

  const phone = normalizePhone(f.phone);
  // A price answer counts only for the exact lines it was asked for.
  const quoteKey = JSON.stringify([lines, f.governorate, promo, promo ? phone : null]);
  const quote = answer?.key === quoteKey ? answer.q : null;

  function absorb(q: PublicQuote, key: string) {
    setAnswer({ key, q });
    props.onQuote?.(q);
  }

  useEffect(() => {
    if (!hydrated || !ready || lines.length === 0) return;
    const ctrl = new AbortController();
    const key = quoteKey;
    fetchQuote({ lines, governorate: f.governorate || null, promoCode: promo, phone }, ctrl.signal).then((q) => {
      if (!ctrl.signal.aborted && q) absorb(q, key);
    });
    return () => ctrl.abort();
    // absorb only reads values that are part of quoteKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, quoteKey, ready]);

  // An unfinished form with a valid phone shows up in the back office, to be called once.
  // Only once the visitor has used the form: a phone saved from an earlier order is not a new start.
  useEffect(() => {
    if (!engaged || !phone || lines.length === 0) return;
    if (!phoneLogged.current) {
      phoneLogged.current = true;
      track("checkout_phone_entered", { productId, props: { where: origin } });
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
        body: JSON.stringify({ token, lines, phone, name: f.name || undefined, governorate: f.governorate || undefined, visitorId: a.visitorId, source: a.attribution.source, campaign: a.attribution.campaign }),
        keepalive: true,
      }).catch(() => {});
    }, 900);
    return () => clearTimeout(timer);
  }, [engaged, phone, f.name, f.governorate, lines, productId, origin]);

  function start() {
    if (engaged) return;
    setEngaged(true);
    const value = pagePrice ?? quote?.subtotal ?? 0;
    track("checkout_started", { productId, value, props: { where: origin } });
    pixelInitiateCheckout(props.pixelItems(), value);
  }

  function update(k: keyof Form, v: string) {
    start();
    setEdits((x) => ({ ...x, [k]: v }));
    if (k === "governorate" && v) setGov(v);
    setServerBad((b) => b.filter((x) => x !== k));
  }
  const blur = (k: keyof Form) => () => setTouched((x) => ({ ...x, [k]: true }));
  /** Enter moves to the next field instead of sending a half-filled order. */
  const next = (to: string) => (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    e.preventDefault();
    document.getElementById(to)?.focus();
  };

  const problems = {
    name: f.name.trim().length < 2,
    phone: !phone,
    // In the order the fields are on screen: the first empty one gets the focus.
    governorate: !f.governorate,
    address: f.address.trim().length < 4,
  };
  const show = (k: keyof typeof problems) => Boolean((touched[k] && problems[k]) || serverBad.includes(k));

  function addToCart() {
    if (!props.onAddToCart) return;
    if (!props.onAddToCart()) return;
    // What was typed comes along to the basket's form.
    const typed = Object.fromEntries(Object.entries(edits).filter(([, v]) => v && v.trim()));
    if (Object.keys(typed).length) store.set(DRAFT, JSON.stringify({ ...readJson(store.get(DRAFT) ?? ""), ...typed }));
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || lines.length === 0) return;
    start();
    if (!ready) {
      props.onNotReady?.();
      return;
    }
    const bad = (Object.keys(problems) as (keyof typeof problems)[]).filter((k) => problems[k]);
    if (bad.length) {
      setTouched(Object.fromEntries(bad.map((k) => [k, true])));
      document.getElementById(id(bad[0]))?.focus();
      return;
    }
    const honeypot = (e.currentTarget.elements.namedItem("website") as HTMLInputElement | null)?.value ?? "";
    setBusy(true);
    setError(null);
    try {
      // The price check may still be on its way (slow network) or may have failed: ask again now.
      let q = quote;
      if (!q) {
        q = await fetchQuote({ lines, governorate: f.governorate, promoCode: promo, phone });
        if (!q) {
          setError(t.checkout.errors.server);
          return;
        }
        absorb(q, quoteKey);
        // Something changed (stock, an offer): the customer sees it before confirming again.
        if (q.lines.length === 0 || q.problems.length > 0) return;
      }
      const a = currentAttribution();
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          lines,
          phone: f.phone,
          name: f.name,
          governorate: f.governorate,
          address: f.address,
          promoCode: promo ?? undefined,
          payment: "COD",
          expectedTotal: q.total,
          cartToken: store.get(FORM_TOKEN) ?? undefined,
          restoredCartId: props.restoredCartId ?? undefined,
          visitorId: a.visitorId,
          sessionId: a.sessionId,
          attribution: a.attribution,
          consentAds: getConsent() === "granted",
          ad: adIds(),
          locale: lang,
          origin,
          website: honeypot,
        }),
      });
      const data = await res.json().catch(() => ({ ok: false, error: "server" }));
      if (data.ok) {
        // The ref ties the saved number to this order's thank-you page only.
        store.set(SAVED, JSON.stringify({ name: f.name, phone: f.phone, governorate: f.governorate, address: f.address, ref: data.ref }));
        store.remove(FORM_TOKEN);
        store.remove(DRAFT);
        props.onPlaced?.();
        router.push(href(lang, `/commande/merci/${data.ref}`));
        return;
      }
      trackNow("checkout_failed", { productId, props: { error: data.error, where: origin } });
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

  // Before the server answers, the page's own figures; never a 0 for a refused line.
  const priced = quote != null && quote.lines.length > 0;
  const price = priced ? quote.subtotal : (pagePrice ?? 0);
  // The basket has no price of its own: "Un instant…" until the server answers.
  const waiting = !priced && pagePrice == null;
  const delivery = priced ? quote.delivery : null;
  const discount = priced ? quote.discount : 0;
  // Free delivery is often known before the governorate: an offer, a promo code, or the shop's threshold.
  const promoFree = Boolean(priced && quote.promo?.result.ok && quote.promo.result.freeDelivery);
  const offerFree = props.freeOffer || (priced && quote.lines.some((l) => l.freeDelivery));
  const threshold = settings.delivery.freeThreshold;
  const freeKnown = delivery ? delivery.free : Boolean(offerFree) || promoFree || (threshold != null && price - discount >= threshold);
  const promoError = quote?.promo && !quote.promo.result.ok ? t.checkout.promoErrors[quote.promo.result.reason] : null;
  const shopPhone = normalizePhone(settings.shop.phone);
  const zoneFees = Object.values(settings.delivery.zones)
    .filter((z) => z.enabled !== false)
    .map((z) => z.fee);
  const fees = zoneFees.length ? { min: Math.min(...zoneFees), max: Math.max(...zoneFees) } : null;

  return (
    // A container: the fields go two by two when the form itself is wide enough, wherever it sits.
    <form id={props.formId} onSubmit={submit} noValidate className="@container flex flex-col gap-4">
      <fieldset className="grid min-w-0 items-start gap-x-3 gap-y-3.5 @lg:grid-cols-2" onFocus={start}>
        <legend className="mb-3 flex items-center gap-2.5 text-[19px] font-bold text-ink">
          {props.step != null && <StepBadge n={props.step} />}
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
      <dl className="flex flex-col gap-2 rounded-2xl bg-cream p-3.5 text-[16px]">
        <div className="flex justify-between gap-3 text-ink-2">
          <dt>
            {props.priceLabel}
            {props.priceNote && <span className="text-muted"> · {props.priceNote}</span>}
          </dt>
          <dd className="shrink-0 whitespace-nowrap price-nums ltr-nums">{waiting ? <span className="text-muted">{t.cart.loading}</span> : formatTND(price, lang)}</dd>
        </div>
        {discount > 0 && (
          <div className="flex justify-between gap-3 text-olive">
            <dt>{t.checkout.discount}</dt>
            <dd className="shrink-0 whitespace-nowrap price-nums ltr-nums">−{formatTND(discount, lang)}</dd>
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
            {waiting ? (
              <span className="text-[17px] text-muted">{t.cart.loading}</span>
            ) : priced && (delivery || freeKnown) ? (
              <span className="whitespace-nowrap text-[23px] font-bold text-ink price-nums ltr-nums">{formatTND(delivery ? quote.total : price - discount, lang)}</span>
            ) : (
              // Never a dash: the price is known, only the delivery (or the option) is still to come.
              <>
                <span className="block whitespace-nowrap text-[23px] font-bold text-ink">
                  {props.priceVaries && <span className="text-[15px] font-normal text-muted">{t.product.from} </span>}
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
        {!delivery && !freeKnown && threshold != null && <p className="text-[15px] text-muted">{t.product.freeFrom(formatTND(threshold, lang))}</p>}
      </dl>

      {error && (
        <p className="rounded-xl bg-clay-soft px-4 py-3 text-[16px] text-clay" role="alert">
          {error}
        </p>
      )}

      {/* The strongest button on the page; the basket is the quieter choice under it. */}
      <button type="submit" disabled={busy} className="flex min-h-[64px] w-full items-center justify-center gap-3 rounded-2xl bg-buy px-4 py-2.5 text-night shadow-[inset_0_-4px_0_var(--color-buy-2)] transition [--focus-ring:var(--color-night)] hover:bg-buy-2 active:scale-[.99] disabled:opacity-80" data-testid="place-order">
        <IconTruck className="h-7 w-7 shrink-0" />
        <span className="flex flex-col items-start leading-tight">
          <span className="text-[20px] font-bold">{busy ? t.buy.sending : props.submitTitle}</span>
          {!busy && <span className="text-[15px] text-night/85">{props.submitSub}</span>}
        </span>
      </button>
      {props.onAddToCart && (
        <button type="button" onClick={addToCart} className="flex min-h-14 w-full items-center justify-center gap-2.5 rounded-2xl border-2 border-night/80 bg-white px-4 text-[18px] font-bold text-night transition hover:bg-sand active:scale-[.99]" data-testid="add-to-cart">
          <IconCartPlus className="h-6 w-6 shrink-0" />
          {t.product.addToCart}
        </button>
      )}

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
                track("phone_clicked", { productId, props: { where: origin } });
                pixelContact();
              }}
            >
              {t.buy.callUs} : <strong className="ltr-nums">{formatPhone(shopPhone)}</strong>
            </a>
          )}
          {settings.contact.whatsapp && (
            <a
              href={`https://wa.me/216${settings.contact.whatsapp}?text=${encodeURIComponent(props.waText)}`}
              target="_blank"
              rel="noopener"
              onClick={() => {
                track("whatsapp_clicked", { productId, props: { where: origin } });
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
          <button type="button" className="min-h-11 px-2 text-muted underline" onClick={() => setPromo(null)}>
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
    </form>
  );
}

export function StepBadge({ n }: { n: number }) {
  return (
    <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy text-[16px] text-white">
      {n}
    </span>
  );
}

export function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string | null; children: React.ReactNode }) {
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

export function inputCls(invalid: boolean) {
  return `h-14 w-full min-w-0 rounded-xl border-2 bg-white px-3 text-[18px] text-ink outline-none placeholder:text-placeholder focus:border-sea ${invalid ? "border-danger" : "border-field"}`;
}
