"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { dict, href, pick, type Lang } from "@/i18n";
import type { PublicSettings } from "@/lib/settings-schema";
import { useCart, type CartLine } from "@/lib/client/cart-store";
import { fetchQuote, getGov, setGov, type PublicQuote } from "@/lib/client/quote";
import { currentAttribution, track, trackNow } from "@/lib/client/track";
import { adIds, getConsent } from "@/lib/client/consent";
import { pixelInitiateCheckout } from "@/lib/client/pixels";
import { store } from "@/lib/client/storage";
import { useHydrated } from "@/lib/client/hydrated";
import { formatTND } from "@/lib/money";
import { normalizePhone } from "@/lib/phone";
import { GOVERNORATES, governorateLabel } from "@/lib/governorates";
import { deliveryRangeLabel } from "@/lib/delivery";
import { FreeBar } from "./CartDrawer";
import { IconCash, IconChevron, IconShield } from "./Icons";

type Form = { phone: string; name: string; governorate: string; city: string; address: string; note: string; phoneAlt: string; email: string };
const EMPTY: Form = { phone: "", name: "", governorate: "", city: "", address: "", note: "", phoneAlt: "", email: "" };
/** What a returning customer does not type twice. Kept in this browser only. */
const SAVED = "mena_checkout";

export function Checkout({ lang, settings }: { lang: Lang; settings: PublicSettings }) {
  const t = dict(lang);
  const router = useRouter();
  const { lines, replace, clear, token } = useCart();
  const mounted = useHydrated();
  // Read once on the client; the form itself only renders after hydration.
  const [f, setF] = useState<Form>(() => {
    let saved: Partial<Form> = {};
    try {
      saved = JSON.parse(store.get(SAVED) ?? "{}");
    } catch {}
    return { ...EMPTY, ...saved, governorate: saved.governorate || getGov() || "" };
  });
  const [touched, setTouched] = useState<Partial<Record<keyof Form, boolean>>>({});
  const [promoInput, setPromoInput] = useState("");
  const [promo, setPromo] = useState<string | null>(null);
  const [showPromo, setShowPromo] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const [payment, setPayment] = useState<"COD" | "CARD">("COD");
  const [quote, setQuote] = useState<PublicQuote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [serverBad, setServerBad] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const started = useRef(false);
  const phoneLogged = useRef(false);

  const phone = normalizePhone(f.phone);
  const key = useMemo(() => JSON.stringify(lines.map((l) => [l.productId, l.variantId, l.qty])), [lines]);

  useEffect(() => {
    if (!mounted || lines.length === 0) return;
    const ctrl = new AbortController();
    fetchQuote({ lines: lines.map(({ productId, variantId, qty }) => ({ productId, variantId, qty })), governorate: f.governorate || null, promoCode: promo, phone }, ctrl.signal).then((q) => {
      if (!ctrl.signal.aborted && q) setQuote(q);
    });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, key, f.governorate, promo, phone]);

  useEffect(() => {
    if (!quote || started.current) return;
    started.current = true;
    track("checkout_started", { value: quote.total, props: { lines: quote.lines.length } });
    pixelInitiateCheckout(quote.lines.map((l) => ({ id: l.productId, name: l.name, price: l.unitPrice, qty: l.qty })), quote.total);
  }, [quote]);

  // A typed, valid phone makes an unfinished basket reachable from the back office.
  useEffect(() => {
    if (!phone || !token || lines.length === 0) return;
    if (!phoneLogged.current) {
      phoneLogged.current = true;
      track("checkout_phone_entered");
    }
    const id = setTimeout(() => {
      const a = currentAttribution();
      void fetch("/api/cart", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, lines: lines.map(({ productId, variantId, qty }) => ({ productId, variantId, qty })), phone, name: f.name || undefined, governorate: f.governorate || undefined, visitorId: a.visitorId, source: a.attribution.source, campaign: a.attribution.campaign }),
        keepalive: true,
      }).catch(() => {});
    }, 800);
    return () => clearTimeout(id);
  }, [phone, f.name, f.governorate, token, key, lines]);

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const v = e.target.value;
    setF((x) => ({ ...x, [k]: v }));
    if (k === "governorate" && v) setGov(v);
    setServerBad((b) => b.filter((x) => x !== k));
  };
  const blur = (k: keyof Form) => () => setTouched((x) => ({ ...x, [k]: true }));

  const problems = {
    phone: !phone,
    name: f.name.trim().length < 2,
    governorate: !f.governorate,
    city: f.city.trim().length < 2,
    address: f.address.trim().length < 4,
    phoneAlt: Boolean(f.phoneAlt) && !normalizePhone(f.phoneAlt),
  };
  const show = (k: keyof typeof problems) => (touched[k] && problems[k]) || serverBad.includes(k);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || !quote) return;
    const bad = (Object.keys(problems) as (keyof typeof problems)[]).filter((k) => problems[k]);
    if (bad.length) {
      setTouched(Object.fromEntries(bad.map((k) => [k, true])));
      setError(t.checkout.errors.invalid);
      document.getElementById(`f-${bad[0]}`)?.focus();
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
          lines: lines.map(({ productId, variantId, qty }) => ({ productId, variantId, qty })),
          phone: f.phone,
          phoneAlt: f.phoneAlt || undefined,
          name: f.name,
          email: settings.checkout.askEmail ? f.email : undefined,
          governorate: f.governorate,
          city: f.city,
          address: f.address,
          note: f.note || undefined,
          promoCode: promo ?? undefined,
          payment,
          expectedTotal: quote.total,
          cartToken: token || undefined,
          restoredCartId: useCart.getState().restoredFrom ?? undefined,
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
        store.set(SAVED, JSON.stringify({ phone: f.phone, name: f.name, governorate: f.governorate, city: f.city, address: f.address }));
        clear();
        if (data.payUrl) {
          window.location.assign(data.payUrl);
          return;
        }
        router.push(href(lang, `/commande/merci/${data.ref}`));
        return;
      }
      trackNow("checkout_failed", { props: { error: data.error } });
      if (data.quote) {
        setQuote(data.quote);
        syncLines(data.quote, lines, replace);
      }
      if (data.error === "invalid") setServerBad(data.fields ?? []);
      setError(t.checkout.errors[data.error] ?? t.checkout.errors.server);
    } catch {
      setError(t.checkout.errors.server);
    } finally {
      setBusy(false);
    }
  }

  if (!mounted) return <div className="mx-auto min-h-[60vh] max-w-5xl px-4 pt-8" />;
  if (lines.length === 0)
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-muted">{t.cart.empty}</p>
        <Link href={href(lang, "/boutique")} className="rounded-full bg-ink px-5 py-3 text-sm font-medium text-white">
          {t.cart.continue}
        </Link>
      </div>
    );

  const promoError = quote?.promo && !quote.promo.result.ok ? t.checkout.promoErrors[quote.promo.result.reason] : null;
  const delivery = quote?.delivery;

  return (
    <form onSubmit={submit} noValidate className="mx-auto grid max-w-5xl gap-6 px-4 pb-16 pt-6 md:grid-cols-[1fr_380px] md:gap-10">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="font-display text-[30px] leading-tight">{t.checkout.title}</h1>
          <p className="mt-1 text-sm text-muted">{t.checkout.sub}</p>
        </div>

        <MobileSummary lang={lang} quote={quote} lines={lines} />

        <Section title={t.checkout.contact}>
          <Field id="phone" label={t.checkout.phone} error={show("phone") ? t.checkout.phoneInvalid : null} hint={t.checkout.phoneHint}>
            <div className={`flex h-12 items-stretch overflow-hidden rounded-xl border bg-white focus-within:border-sea ${show("phone") ? "border-danger" : "border-line"}`} dir="ltr">
              <span className="flex items-center border-e border-line bg-sand/60 px-3 text-[15px] text-muted">+216</span>
              <input
                id="f-phone"
                value={f.phone}
                onChange={set("phone")}
                onBlur={blur("phone")}
                inputMode="tel"
                autoComplete="tel-national"
                placeholder="22 123 456"
                className="flex-1 bg-transparent px-3 text-[16px] tracking-wide outline-none"
                maxLength={16}
                aria-invalid={show("phone")}
                data-testid="phone"
              />
            </div>
          </Field>
          <Field id="name" label={t.checkout.name} error={show("name") ? t.checkout.required : null}>
            <Input id="f-name" value={f.name} onChange={set("name")} onBlur={blur("name")} autoComplete="name" invalid={show("name")} testid="name" />
          </Field>
          {settings.checkout.askEmail && (
            <Field id="email" label={t.checkout.email}>
              <Input id="f-email" value={f.email} onChange={set("email")} type="email" autoComplete="email" inputMode="email" dir="ltr" />
            </Field>
          )}
        </Section>

        <Section title={t.checkout.address}>
          <Field id="governorate" label={t.checkout.governorate} error={show("governorate") ? t.checkout.required : null}>
            <select
              id="f-governorate"
              value={f.governorate}
              onChange={set("governorate")}
              onBlur={blur("governorate")}
              className={`h-12 w-full rounded-xl border bg-white px-3 outline-none focus:border-sea ${show("governorate") ? "border-danger" : "border-line"}`}
              autoComplete="address-level1"
              data-testid="governorate"
            >
              <option value="">—</option>
              {GOVERNORATES.map((g) => (
                <option key={g.id} value={g.id} disabled={settings.delivery.zones[g.id]?.enabled === false}>
                  {governorateLabel(g.id, lang)}
                  {settings.delivery.zones[g.id]?.enabled === false ? " —" : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field id="city" label={t.checkout.city} error={show("city") ? t.checkout.required : null}>
            <Input id="f-city" value={f.city} onChange={set("city")} onBlur={blur("city")} autoComplete="address-level2" invalid={show("city")} testid="city" />
          </Field>
          <Field id="address" label={t.checkout.street} hint={t.checkout.streetHint} error={show("address") ? t.checkout.required : null}>
            <Input id="f-address" value={f.address} onChange={set("address")} onBlur={blur("address")} autoComplete="street-address" invalid={show("address")} testid="address" />
          </Field>
          {!showNote ? (
            <button type="button" onClick={() => setShowNote(true)} className="self-start text-sm text-sea underline underline-offset-2">
              {t.checkout.addNote}
            </button>
          ) : (
            <>
              <Field id="phoneAlt" label={t.checkout.phoneAlt} error={show("phoneAlt") ? t.checkout.phoneInvalid : null}>
                <Input id="f-phoneAlt" value={f.phoneAlt} onChange={set("phoneAlt")} onBlur={blur("phoneAlt")} inputMode="tel" dir="ltr" invalid={show("phoneAlt")} />
              </Field>
              <Field id="note" label={t.checkout.note}>
                <textarea id="f-note" value={f.note} onChange={set("note")} rows={2} maxLength={300} className="w-full rounded-xl border border-line bg-white px-3 py-2.5 outline-none focus:border-sea" />
              </Field>
            </>
          )}
        </Section>

        <Section title={t.checkout.payment}>
          <PayOption checked={payment === "COD"} onChange={() => setPayment("COD")} title={t.checkout.cod} sub={t.checkout.codSub} icon={<IconCash />} />
          {settings.payments.card && <PayOption checked={payment === "CARD"} onChange={() => setPayment("CARD")} title={t.checkout.card} sub={t.checkout.cardSub} icon={<IconShield />} />}
        </Section>

        {/* Honeypot: invisible to people, irresistible to bots. */}
        <input type="text" name="website" tabIndex={-1} autoComplete="off" className="absolute -start-[9999px] h-0 w-0 opacity-0" aria-hidden />
      </div>

      <aside className="flex flex-col gap-4 md:sticky md:top-20 md:self-start">
        <div className="rounded-2xl border border-line bg-white">
          <h2 className="border-b border-line px-5 py-3.5 text-sm font-semibold">{t.checkout.summary}</h2>
          {quote && quote.freeThreshold != null && <FreeBar lang={lang} remaining={quote.freeDeliveryRemaining} threshold={quote.freeThreshold} subtotal={quote.subtotal - quote.discount} />}
          <ul className="hidden divide-y divide-line px-5 md:block">
            {(quote?.lines ?? []).map((l) => (
              <li key={`${l.productId}-${l.variantId}`} className="flex items-center gap-3 py-3">
                <span className="relative h-14 w-12 shrink-0 overflow-hidden rounded-lg bg-sand">
                  {l.imageId && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/img/${l.imageId}/128`} alt="" className="h-full w-full object-cover" />
                  )}
                  <span className="absolute -end-0 -top-0 rounded-bl-lg bg-ink px-1.5 text-[11px] text-white ltr-nums">{l.qty}</span>
                </span>
                <span className="min-w-0 flex-1 text-sm">
                  <span className="line-clamp-2">{pick(lang, l.name, l.nameAr)}</span>
                  {l.variantName && <span className="block text-xs text-muted">{l.variantName}</span>}
                </span>
                <span className="text-sm ltr-nums">{formatTND(l.lineTotal, lang)}</span>
              </li>
            ))}
          </ul>
          <div className="border-t border-line px-5 py-3">
            {!showPromo && !promo ? (
              <button type="button" onClick={() => setShowPromo(true)} className="text-sm text-sea underline underline-offset-2">
                {t.checkout.promo}
              </button>
            ) : promo ? (
              <div className="flex items-center justify-between text-sm">
                <span className="rounded-full bg-sea-soft px-2.5 py-1 font-medium text-sea-2 ltr-nums">{promo}</span>
                <button type="button" className="text-muted underline" onClick={() => setPromo(null)}>
                  {t.checkout.removeCode}
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input value={promoInput} onChange={(e) => setPromoInput(e.target.value.toUpperCase())} placeholder={t.checkout.promo} className="h-11 min-w-0 flex-1 rounded-xl border border-line px-3 uppercase outline-none focus:border-sea" dir="ltr" autoCapitalize="characters" />
                <button type="button" onClick={() => promoInput.trim() && setPromo(promoInput.trim())} className="h-11 rounded-xl bg-ink px-4 text-sm font-medium text-white">
                  {t.checkout.apply}
                </button>
              </div>
            )}
            {promo && promoError && <p className="mt-2 text-xs text-danger">{promoError}</p>}
          </div>
          <dl className="flex flex-col gap-1.5 border-t border-line px-5 py-4 text-sm">
            <Line label={t.cart.subtotal} value={quote ? formatTND(quote.subtotal, lang) : "…"} />
            {quote && quote.discount > 0 && <Line label={t.checkout.discount} value={`−${formatTND(quote.discount, lang)}`} accent />}
            <Line label={t.cart.delivery} value={delivery ? (delivery.free ? t.product.free : formatTND(delivery.fee, lang)) : t.cart.deliveryAtCheckout} />
            <div className="mt-2 flex items-baseline justify-between border-t border-line pt-3">
              <dt className="font-semibold">{t.cart.total}</dt>
              <dd className="text-xl font-semibold ltr-nums" data-testid="total">
                {quote ? formatTND(quote.total, lang) : "…"}
              </dd>
            </div>
            {delivery && <p className="text-xs text-muted">{t.checkout.deliveryDelay(deliveryRangeLabel(delivery.minDays, delivery.maxDays, lang))}</p>}
            {quote?.deliveryUnavailable && <p className="text-xs text-danger">{t.checkout.errors.delivery_unavailable}</p>}
          </dl>
        </div>

        {error && (
          <p className="rounded-xl bg-clay-soft px-4 py-3 text-sm text-clay" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || !quote || quote.lines.length === 0}
          className="flex h-[58px] w-full flex-col items-center justify-center rounded-full bg-sea text-white shadow-soft transition active:scale-[.99] disabled:opacity-60"
          data-testid="place-order"
        >
          <span className="text-[16px] font-semibold leading-tight">{busy ? t.checkout.placing : t.checkout.place}</span>
          {quote && !busy && <span className="text-[12px] leading-tight opacity-85 ltr-nums">{payment === "COD" ? t.checkout.placeSub(formatTND(quote.total, lang)) : formatTND(quote.total, lang)}</span>}
        </button>
        <p className="text-center text-xs leading-relaxed text-muted">
          {t.checkout.consent}{" "}
          <Link href={href(lang, "/conditions")} className="underline underline-offset-2">
            {t.footer.terms}
          </Link>
        </p>
      </aside>
    </form>
  );
}

/** After the server refused a basket, the browser's copy is brought in line with what the server priced. */
function syncLines(q: PublicQuote, lines: CartLine[], replace: (l: CartLine[]) => void) {
  const keep = lines
    .filter((l) => q.lines.some((x) => x.productId === l.productId && x.variantId === l.variantId))
    .map((l) => ({ ...l, qty: q.lines.find((x) => x.productId === l.productId && x.variantId === l.variantId)?.qty ?? l.qty }));
  replace(keep);
}

function MobileSummary({ lang, quote, lines }: { lang: Lang; quote: PublicQuote | null; lines: CartLine[] }) {
  const t = dict(lang);
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-line bg-white md:hidden">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between px-4 py-3 text-sm" aria-expanded={open}>
        <span className="flex items-center gap-2">
          <span className="flex -space-x-2 rtl:space-x-reverse">
            {lines.slice(0, 3).map((l) => (
              <span key={`${l.productId}-${l.variantId}`} className="relative h-9 w-9 overflow-hidden rounded-full border-2 border-white bg-sand">
                {l.imageId && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/img/${l.imageId}/96`} alt="" className="h-full w-full object-cover" />
                )}
              </span>
            ))}
          </span>
          <span className="text-muted">{lines.reduce((n, l) => n + l.qty, 0)} ×</span>
        </span>
        <span className="flex items-center gap-2 font-semibold ltr-nums">
          {quote ? formatTND(quote.total, lang) : "…"}
          <IconChevron className={`h-4 w-4 transition ${open ? "rotate-90" : ""}`} />
        </span>
      </button>
      {open && quote && (
        <ul className="divide-y divide-line border-t border-line px-4">
          {quote.lines.map((l) => (
            <li key={`${l.productId}-${l.variantId}`} className="flex justify-between gap-3 py-2.5 text-sm">
              <span className="min-w-0">
                <span className="ltr-nums">{l.qty} × </span>
                {pick(lang, l.name, l.nameAr)}
                {l.variantName && <span className="text-muted"> · {l.variantName}</span>}
              </span>
              <span className="shrink-0 ltr-nums">{formatTND(l.lineTotal, lang)}</span>
            </li>
          ))}
          <li className="flex justify-between py-2.5 text-sm text-muted">
            <span>{t.cart.delivery}</span>
            <span className="ltr-nums">{quote.delivery ? (quote.delivery.free ? t.product.free : formatTND(quote.delivery.fee, lang)) : t.cart.deliveryAtCheckout}</span>
          </li>
        </ul>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{title}</legend>
      {children}
    </fieldset>
  );
}

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string | null; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`f-${id}`} className="text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {error ? <p className="text-xs text-danger">{error}</p> : hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

function Input({ invalid, testid, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean; testid?: string }) {
  return <input {...props} data-testid={testid} aria-invalid={invalid} className={`h-12 w-full rounded-xl border bg-white px-3 outline-none focus:border-sea ${invalid ? "border-danger" : "border-line"}`} />;
}

function PayOption({ checked, onChange, title, sub, icon }: { checked: boolean; onChange: () => void; title: string; sub: string; icon: React.ReactNode }) {
  return (
    <label className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-4 ${checked ? "border-sea bg-sea-soft/50" : "border-line bg-white"}`}>
      <input type="radio" name="payment" checked={checked} onChange={onChange} className="h-5 w-5 accent-[var(--color-sea)]" />
      <span className="text-sea">{icon}</span>
      <span className="flex flex-col">
        <span className="text-[15px] font-medium">{title}</span>
        <span className="text-xs text-muted">{sub}</span>
      </span>
    </label>
  );
}

function Line({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`flex justify-between ${accent ? "text-olive" : "text-ink-2"}`}>
      <dt>{label}</dt>
      <dd className="ltr-nums">{value}</dd>
    </div>
  );
}
