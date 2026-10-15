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
import { removeOrdered } from "@/lib/client/cart";
import { GOVERNORATES, governorateLabel } from "@/lib/governorates";
import { deliveryRangeLabel, deliverySpan } from "@/lib/delivery";
import { IconCartPlus, IconCash, IconChevronDown, IconPhone, IconShield, IconTruck, IconWhatsApp } from "./Icons";

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
/** When a price check got no answer: try again after these delays. */
const RETRY_MS = [1500, 4000, 10_000];

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
  /** The first row of the summary: "Prix", or "Articles (3)". */
  priceLabel: string;
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
  // The order is made and the thank-you page is loading: the button stays off, a second tap is not a second order.
  const placed = useRef(false);
  // One key per attempt: the same details sent again (no answer came back) reuse it, and the server returns the order it made.
  const attempt = useRef<{ sig: string; key: string } | null>(null);
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
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    // A dropped request on mobile data, or a busy shared address (429): ask again a little later,
    // and as soon as the phone is back online, rather than leaving the summary without prices.
    const run = () => {
      clearTimeout(timer);
      fetchQuote({ lines, governorate: f.governorate || null, promoCode: promo, phone }, ctrl.signal).then((q) => {
        if (ctrl.signal.aborted) return;
        if (q) absorb(q, key);
        else if (tries < RETRY_MS.length) timer = setTimeout(run, RETRY_MS[tries++]);
      });
    };
    // Several taps in a row (offers, options) cost one request.
    timer = setTimeout(run, 200);
    addEventListener("online", run);
    return () => {
      ctrl.abort();
      clearTimeout(timer);
      removeEventListener("online", run);
    };
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
      const a = currentAttribution();
      const save = (token: string) =>
        fetch("/api/cart", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token, lines, phone, name: f.name || undefined, governorate: f.governorate || undefined, visitorId: a.visitorId, source: a.attribution.source, campaign: a.attribution.campaign }),
          keepalive: true,
        }).then((r) => r.json() as Promise<{ renew?: boolean }>);
      let token = store.get(FORM_TOKEN);
      if (!token) {
        token = randomId();
        store.set(FORM_TOKEN, token);
      }
      void save(token)
        .then((d) => {
          // This token's form became an order long ago (placed in another browser): start a new one, once.
          if (!d?.renew) return;
          const fresh = randomId();
          store.set(FORM_TOKEN, fresh);
          return save(fresh);
        })
        .catch(() => {});
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
    if (busy || placed.current || lines.length === 0) return;
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
    // Without a price answer (no network a moment ago, a busy shared address), the order goes with the
    // total on screen: the server prices it again and, if it differs, answers with its own total to confirm.
    // The basket has no total of its own: the server's answer is then shown first.
    let blind = false;
    try {
      // The price check may still be on its way (slow network) or may have failed: ask again now.
      let q = quote;
      if (!q) {
        q = await fetchQuote({ lines, governorate: f.governorate, promoCode: promo, phone });
        if (q) {
          absorb(q, quoteKey);
          // Something changed (stock, an offer): the customer sees it before confirming again.
          if (q.lines.length === 0 || q.problems.length > 0) return;
        } else blind = pagePrice == null;
      }
      const expectedTotal = q ? q.total : blind ? 0 : total;
      const details = { lines, phone: f.phone, name: f.name, governorate: f.governorate, address: f.address, promoCode: promo ?? undefined, expectedTotal };
      const sig = JSON.stringify(details);
      if (attempt.current?.sig !== sig) attempt.current = { sig, key: randomId() };
      const a = currentAttribution();
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // A request that hangs on a weak signal ends with a sentence, not an endless "sending".
        signal: AbortSignal.timeout(25_000),
        body: JSON.stringify({
          ...details,
          payment: "COD",
          submitKey: attempt.current.key,
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
        placed.current = true;
        // The ref ties the saved number to this order's thank-you page only.
        store.set(SAVED, JSON.stringify({ name: f.name, phone: f.phone, governorate: f.governorate, address: f.address, ref: data.ref }));
        store.remove(FORM_TOKEN);
        store.remove(DRAFT);
        // What was just ordered leaves the basket, so the cart icon does not invite the same order twice.
        if (origin !== "cart") removeOrdered(lines);
        props.onPlaced?.();
        router.push(href(lang, `/commande/merci/${data.ref}`));
        return;
      }
      trackNow("checkout_failed", { productId, props: { error: data.error, where: origin } });
      if (data.quote) absorb(data.quote, quoteKey);
      if (data.error === "invalid") setServerBad(data.fields ?? []);
      const offerGone = data.quote?.problems?.some((x: { kind: string }) => x.kind === "offer_unavailable");
      setError(offerGone ? t.buy.offerGone : blind && data.error === "price_changed" ? t.checkout.errors.checkTotal : (t.checkout.errors[data.error] ?? t.checkout.errors.server));
    } catch {
      // No answer (timeout, no network). The same tap again sends the same key: still one order.
      setError(t.checkout.errors.network);
    } finally {
      if (!placed.current) setBusy(false);
    }
  }

  // Before the server answers, the page's own figures; never a 0 for a refused line.
  const priced = quote != null && quote.lines.length > 0;
  const price = priced ? quote.subtotal : (pagePrice ?? 0);
  // The basket has no price of its own: "Un instant…" until the server answers.
  const waiting = !priced && pagePrice == null;
  // The governorate's own delay once it is chosen; before that, the shortest to the longest the shop set.
  const delivery = (priced ? quote.delivery : null) ?? deliverySpan(settings.delivery.zones);
  const discount = priced ? quote.discount : 0;
  // Free delivery is often known before the governorate: an offer, a promo code, or the shop's threshold.
  const promoFree = Boolean(priced && quote.promo?.result.ok && quote.promo.result.freeDelivery);
  const offerFree = props.freeOffer || (priced && quote.lines.some((l) => l.freeDelivery));
  const threshold = settings.delivery.freeThreshold;
  const fee = settings.delivery.fee;
  // The server's answer when there is one; before it, the same rules from the page's own figures.
  const freeKnown = priced ? quote.deliveryFee === 0 && !quote.deliveryUnavailable : Boolean(offerFree) || promoFree || (threshold != null && price - discount >= threshold) || fee === 0;
  const deliveryShown = freeKnown ? 0 : priced ? quote.deliveryFee : fee;
  const total = priced ? quote.total : price - discount + deliveryShown;
  const promoError = quote?.promo && !quote.promo.result.ok ? t.checkout.promoErrors[quote.promo.result.reason] : null;
  const shopPhone = normalizePhone(settings.shop.phone);

  return (
    // A container: the fields go two by two when the form itself is wide enough, wherever it sits.
    <form id={props.formId} onSubmit={submit} noValidate className="@container flex flex-col gap-4">
      {/* Four fields, each with its name above it, and nothing else to read. */}
      <fieldset className="grid min-w-0 items-start gap-x-3 gap-y-3 @lg:grid-cols-2" onPointerDown={start} onKeyDown={start}>
        <legend className="sr-only">{t.buy.step2}</legend>
        <Field id={id("name")} label={t.buy.name} error={show("name") ? t.buy.nameError : null}>
          <input id={id("name")} value={f.name} onChange={(e) => update("name", e.target.value)} onBlur={blur("name")} onKeyDown={next(id("phone"))} enterKeyHint="next" autoComplete="name" className={inputCls(show("name"))} aria-invalid={show("name")} aria-describedby={show("name") ? id("name-msg") : undefined} data-testid="name" />
        </Field>
        <Field id={id("phone")} label={t.buy.phone} error={show("phone") ? (f.phone.trim() ? t.checkout.phoneInvalid : t.buy.phoneRequired) : null}>
          <div className={`flex h-[54px] items-stretch overflow-hidden rounded-full border bg-white focus-within:border-sea focus-within:ring-2 focus-within:ring-sea/20 ${show("phone") ? "border-danger" : "border-field"}`} dir="ltr">
            <span className="flex items-center border-e border-line ps-5 pe-3 text-[17px] text-muted">+216</span>
            <input id={id("phone")} value={f.phone} onChange={(e) => update("phone", e.target.value)} onBlur={blur("phone")} onKeyDown={next(id("governorate"))} enterKeyHint="next" inputMode="tel" autoComplete="tel-national" placeholder="22 123 456" maxLength={16} className="min-w-0 flex-1 bg-transparent px-3 text-[18px] tracking-wide outline-none placeholder:text-placeholder" aria-invalid={show("phone")} aria-describedby={show("phone") ? id("phone-msg") : undefined} data-testid="phone" />
          </div>
        </Field>
        <Field id={id("governorate")} label={t.buy.governorate} error={show("governorate") ? t.buy.govError : null}>
          <div className="relative">
            <select id={id("governorate")} value={f.governorate} onChange={(e) => update("governorate", e.target.value)} onBlur={blur("governorate")} autoComplete="address-level1" className={`${inputCls(show("governorate"))} appearance-none pe-12`} aria-invalid={show("governorate")} aria-describedby={show("governorate") ? id("governorate-msg") : undefined} data-testid="governorate">
              <option value="">{t.buy.chooseGov}</option>
              {GOVERNORATES.map((g) => (
                <option key={g.id} value={g.id} disabled={settings.delivery.zones[g.id]?.enabled === false}>
                  {governorateLabel(g.id, lang)}
                </option>
              ))}
            </select>
            <IconChevronDown className="pointer-events-none absolute end-5 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-2" />
          </div>
        </Field>
        <Field id={id("address")} label={t.buy.address} error={show("address") ? t.buy.addressError : null}>
          {/* One line like the others, growing with what is typed so the whole address can be read again. */}
          <textarea id={id("address")} value={f.address} onChange={(e) => update("address", e.target.value)} onBlur={blur("address")} enterKeyHint="done" autoComplete="street-address" rows={1} maxLength={ADDRESS_MAX} placeholder={t.buy.addressPh} className={`${inputCls(show("address"))} h-auto max-h-40 min-h-[54px] resize-none rounded-[27px] py-3.5 leading-snug [field-sizing:content]`} aria-invalid={show("address")} aria-describedby={show("address") ? id("address-msg") : undefined} data-testid="address" />
        </Field>
      </fieldset>

      {/* ------------------------------------------------ promo code: a quiet link until it is wanted */}
      {!showPromo && !promo ? (
        <button type="button" onClick={() => setShowPromo(true)} className="-my-1 inline-flex min-h-11 items-center self-start text-[15px] text-ink-2 underline decoration-field underline-offset-4">
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
            className="h-12 min-w-0 flex-1 rounded-full border border-field px-5 text-[17px] uppercase outline-none placeholder:text-placeholder focus:border-sea focus:ring-2 focus:ring-sea/20"
            dir="ltr"
            autoCapitalize="characters"
          />
          <button type="button" onClick={() => promoInput.trim() && setPromo(promoInput.trim())} className="h-12 rounded-full bg-ink px-5 text-[16px] font-bold text-white">
            {t.checkout.apply}
          </button>
        </div>
      )}
      {promo && promoError && <p className="-mt-2 text-[15px] text-danger">{promoError}</p>}

      {/* ------------------------------------------------ summary: three plain lines */}
      <dl className="flex flex-col gap-2 text-[16px]">
        <div className="flex justify-between gap-3 text-ink-2">
          <dt>{props.priceLabel}</dt>
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
            {delivery && <span className="text-muted"> · {deliveryRangeLabel(delivery.minDays, delivery.maxDays, lang)}</span>}
          </dt>
          <dd className="shrink-0 whitespace-nowrap price-nums ltr-nums">{freeKnown ? <span className="font-bold text-olive">{t.product.free}</span> : formatTND(deliveryShown, lang)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 border-t border-line pt-3">
          <dt className="text-[18px] font-bold text-ink">{t.buy.total}</dt>
          <dd className="shrink-0 whitespace-nowrap text-end text-[22px] font-bold text-ink" data-testid="total">
            {waiting ? (
              <span className="text-[17px] font-normal text-muted">{t.cart.loading}</span>
            ) : (
              <>
                {props.priceVaries && !priced && <span className="text-[15px] font-normal text-muted">{t.product.from} </span>}
                <span className="price-nums ltr-nums">{formatTND(total, lang)}</span>
              </>
            )}
          </dd>
        </div>
        {quote?.deliveryUnavailable && <p className="text-[15px] text-danger">{t.checkout.errors.delivery_unavailable}</p>}
        {!freeKnown && threshold != null && <p className="text-[15px] text-muted">{t.product.freeFrom(formatTND(threshold, lang))}</p>}
      </dl>

      {error && (
        <p className="rounded-xl bg-clay-soft px-4 py-3 text-[16px] text-clay" role="alert">
          {error}
        </p>
      )}

      {/* The cash-on-delivery promises, read just before the button: in a few words, on one row. */}
      <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-[15px] text-ink-2">
        <li className="inline-flex items-center gap-1.5">
          <IconCash className="h-5 w-5 shrink-0 text-olive" />
          {t.trust.cod}
        </li>
        {settings.delivery.openBeforePaying && (
          <li className="inline-flex items-center gap-1.5">
            <IconShield className="h-5 w-5 shrink-0 text-sea" />
            {t.trust.openBeforePaying}
          </li>
        )}
      </ul>

      {/* The strongest button on the page; the basket is the quieter choice under it. */}
      <button type="submit" disabled={busy} className="flex min-h-[58px] w-full items-center justify-center gap-2.5 rounded-full bg-buy px-6 text-[19px] font-bold text-night shadow-[inset_0_-3px_0_var(--color-buy-2)] transition [--focus-ring:var(--color-night)] hover:bg-buy-2 active:scale-[.99] disabled:opacity-80" data-testid="place-order">
        <IconTruck className="h-6 w-6 shrink-0" />
        {busy ? t.buy.sending : props.submitTitle}
      </button>
      {props.onAddToCart && (
        <button type="button" onClick={addToCart} className="-mt-1 flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-full border border-ink/60 bg-white px-5 text-[17px] font-bold text-ink transition hover:bg-sand active:scale-[.99]" data-testid="add-to-cart">
          <IconCartPlus className="h-6 w-6 shrink-0" />
          {t.product.addToCart}
        </button>
      )}

      {(shopPhone || settings.contact.whatsapp) && (
        <div className="flex flex-wrap justify-center gap-2">
          {settings.contact.whatsapp && (
            <a
              href={`https://wa.me/216${settings.contact.whatsapp}?text=${encodeURIComponent(props.waText)}`}
              target="_blank"
              rel="noopener"
              onClick={() => {
                track("whatsapp_clicked", { productId, props: { where: origin } });
                pixelContact();
              }}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-white px-4 text-[15px] font-bold text-ink hover:bg-sand"
            >
              <IconWhatsApp className="h-5 w-5 text-wa" />
              {t.buy.whatsapp}
            </a>
          )}
          {shopPhone && (
            <a
              href={`tel:+216${shopPhone}`}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-white px-4 text-[15px] text-ink hover:bg-sand"
              aria-label={`${t.buy.callUs} : ${formatPhone(shopPhone)}`}
              onClick={() => {
                track("phone_clicked", { productId, props: { where: origin } });
                pixelContact();
              }}
            >
              <IconPhone className="h-[18px] w-[18px] text-ink-2" />
              <strong className="ltr-nums">{formatPhone(shopPhone)}</strong>
            </a>
          )}
        </div>
      )}

      <p className="mx-auto max-w-md text-center text-[15px] leading-relaxed text-muted">
        {t.buy.consentPhone} {t.buy.consentTerms}{" "}
        <Link href={href(lang, "/conditions")} className="py-2 underline underline-offset-2" prefetch={false}>
          {t.buy.termsLink}
        </Link>
        .
      </p>
      {/* Honeypot: invisible to people, irresistible to bots. */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="absolute -start-[9999px] h-0 w-0 opacity-0" aria-hidden />
    </form>
  );
}

export function Field({ id, label, error, children }: { id: string; label: string; error?: string | null; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="ps-1 text-[16px] text-ink-2">
        {label}
      </label>
      {children}
      {error && (
        <p id={`${id}-msg`} className="ps-1 text-[15px] font-bold text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function inputCls(invalid: boolean) {
  return `h-[54px] w-full min-w-0 rounded-full border bg-white px-5 text-[17px] text-ink outline-none placeholder:text-placeholder focus:border-sea focus:ring-2 focus:ring-sea/20 ${invalid ? "border-danger" : "border-field"}`;
}
