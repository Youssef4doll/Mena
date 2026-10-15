"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { dict, href, pick, type Lang } from "@/i18n";
import type { ProductPage } from "@/lib/catalog";
import type { PublicSettings } from "@/lib/settings-schema";
import { track } from "@/lib/client/track";
import { pixelViewContent } from "@/lib/client/pixels";
import { formatTND } from "@/lib/money";
import { governorateLabel } from "@/lib/governorates";
import { discountPct, leadOffer } from "@/lib/offer-display";
import { deliveryRangeLabel, deliverySpan } from "@/lib/delivery";
import { Stars } from "./Stars";
import { Gallery, slidesOf } from "./Gallery";
import { BuyBox, useBuyChoice, type BuyChoice } from "./BuyBox";
import { IconCheck, IconChevronDown, IconTruck } from "./Icons";

type P = Omit<ProductPage, "related">;

/**
 * The product page, kept to what a cash-on-delivery customer needs, in the
 * order they need it: the pictures (and the video), the name and a line about
 * the product, the price, the offers and the four-field form. Under it, the
 * description with its long pictures, the specifications, and the reviews of
 * customers who received it. Few words, plain sizes, one strong button.
 */
export function ProductView({ p, lang, settings, url }: { p: P; lang: Lang; settings: PublicSettings; url: string }) {
  const t = dict(lang);
  const name = pick(lang, p.name, p.nameAr);
  const summary = pick(lang, p.summary, p.summaryAr);
  const out = p.stock.kind === "out";
  const buyRef = useRef<HTMLDivElement>(null);
  const priceRef = useRef<HTMLParagraphElement>(null);
  const [sticky, setSticky] = useState(false);
  const choice = useBuyChoice(p);
  const shown = shownPrice(p, choice, lang);
  const pct = out ? 0 : discountPct(shown.price, shown.compareAt);
  const struck = !out && shown.compareAt != null && shown.compareAt > shown.price ? shown.compareAt : null;
  const pay = payNow(p, choice);
  const slides = useMemo(() => slidesOf(p.images, p.video), [p.images, p.video]);

  const viewPrice = leadOffer(p.offers)?.price ?? p.price;
  useEffect(() => {
    track("product_viewed", { productId: p.id, value: viewPrice });
    pixelViewContent({ id: p.id, name: p.name, price: viewPrice, qty: 1 });
  }, [p.id, p.name, viewPrice]);

  // The bottom bar shows whenever the order form is out of sight, from the first screen on: on a short
  // phone (an ad opened in the Facebook app) the price and the button are there before any scrolling.
  // It hides once a good part of the form is on screen, and waits while the page's own price line,
  // fully visible, sits where the bar would cover it (a price cut by the screen's edge is in the bar).
  useEffect(() => {
    let raf = 0;
    const check = () => {
      raf = 0;
      const el = buyRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const formInView = r.top < innerHeight - 160 && r.bottom > 140;
      const pr = priceRef.current?.getBoundingClientRect();
      const priceUnderBar = pr != null && pr.bottom <= innerHeight && pr.bottom > innerHeight - 84;
      setSticky(!formInView && !priceUnderBar);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(check);
    };
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll);
    check();
    return () => {
      removeEventListener("scroll", onScroll);
      removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // To the first thing still missing: the option, then the first empty field, else the button itself
  // (a customer who filled the form and went on reading is not sent back to the top of it).
  // Tells what else floats at the bottom (the cookie question) to stay above the bar.
  useEffect(() => {
    const root = document.documentElement;
    root.toggleAttribute("data-sticky", sticky && !out);
    return () => root.removeAttribute("data-sticky");
  }, [sticky, out]);

  function goToForm() {
    track("sticky_clicked", { productId: p.id });
    if (p.variants.length > 0 && !choice.variant) {
      document.getElementById("commander")?.scrollIntoView({ behavior: "smooth", block: "start" });
      const b = document.querySelector<HTMLButtonElement>("#bb-variants button:not(:disabled)");
      setTimeout(() => b?.focus({ preventScroll: true }), 450);
      return;
    }
    const empty = ["bb-name", "bb-phone", "bb-governorate", "bb-address"]
      .map((k) => document.getElementById(k) as HTMLInputElement | HTMLSelectElement | null)
      .find((el) => el && !el.value.trim());
    if (empty) {
      if (empty.id === "bb-name") document.getElementById("commander")?.scrollIntoView({ behavior: "smooth", block: "start" });
      else empty.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => empty.focus({ preventScroll: true }), 450);
      return;
    }
    const submit = document.querySelector<HTMLButtonElement>("#commander [data-testid=place-order]");
    submit?.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => submit?.focus({ preventScroll: true }), 450);
  }

  const description = pick(lang, p.description, p.descriptionAr);
  const specs = lang === "ar" && p.specsAr ? p.specsAr : p.specs;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-28 md:pb-16">
      {/* One copy of everything. Phone: pictures → name and price → offers and form → details.
          Computer: the pictures on the left (they stay in view), the rest on the right. */}
      <div className="grid gap-4 pt-1 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:grid-rows-[auto_1fr] md:gap-x-10 md:gap-y-5 md:pt-4">
        <div className="min-w-0 md:sticky md:top-36 md:col-start-1 md:row-span-2 md:row-start-1 md:self-start">
          <Gallery slides={slides} name={name} productId={p.id} lang={lang} badge={0} />
        </div>

        <div className="flex min-w-0 flex-col gap-2 md:col-start-2 md:row-start-1">
          <h1 className="text-[24px] font-bold leading-snug text-ink md:text-[30px] md:leading-tight">{name}</h1>
          {summary && (
            <p className="text-[16px] leading-relaxed text-ink-2" dir="auto" data-testid="summary">
              {summary}
            </p>
          )}
          {(p.rating || p.sold) && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[15px]">
              {p.rating && (
                <a href="#avis" className="-my-1.5 flex min-h-11 items-center gap-1.5 text-sea">
                  <span className="font-bold text-ink ltr-nums">{p.rating.avg.toFixed(1)}</span>
                  <Stars value={p.rating.avg} size={17} />
                  <span className="underline-offset-2 hover:underline ltr-nums">({p.rating.count})</span>
                </a>
              )}
              {p.sold && (
                <span className="text-muted">
                  <span className="font-bold text-ink-2 ltr-nums">+{p.sold}</span> {t.product.soldSuffix}
                </span>
              )}
            </div>
          )}
          {/* The price on one line: the price, the real price it replaces, the saving. It stays put
              while an offer is picked below (each offer shows its own price), so nothing moves under the finger. */}
          <p ref={priceRef} className="flex flex-wrap items-center gap-x-2.5 gap-y-1 pt-1" data-testid="price">
            {shown.note && <span className="text-[15px] text-muted">{shown.note}</span>}
            <span className="whitespace-nowrap text-[28px] font-bold leading-none text-ink price-nums ltr-nums">{formatTND(shown.price, lang)}</span>
            {struck != null && (
              <>
                <span className="sr-only">{t.buy.instead(formatTND(struck, lang))}</span>
                <s aria-hidden className="whitespace-nowrap text-[17px] text-muted price-nums ltr-nums">{formatTND(struck, lang)}</s>
              </>
            )}
            {pct > 0 && (
              <span className="rounded-full bg-deal px-2.5 text-[14px] font-bold leading-7 text-white">
                <span className="ltr-nums">−{pct}%</span>
              </span>
            )}
          </p>
          <StockLine lang={lang} p={p} variant={choice.variant} />
          {!out && <DeliveryLine lang={lang} settings={settings} free={Boolean(choice.offer?.freeDelivery)} price={pay.price} />}
        </div>

        <div ref={buyRef} className="min-w-0 pt-1 md:col-start-2 md:row-start-2">
          <BuyBox p={p} lang={lang} settings={settings} url={url} choice={choice} />
        </div>
      </div>

      <Questions lang={lang} settings={settings} />

      {/* The description as the shop wrote it, then its long pictures one under the other, edge to edge on a phone. */}
      {(description || p.detailImages.length > 0) && (
        <section className="mx-auto mt-10 flex max-w-3xl flex-col gap-4 border-t border-line pt-8" aria-labelledby="desc-title">
          <TabTitle id="desc-title">{t.product.description}</TabTitle>
          {description && (
            <div className="flex flex-col gap-3 text-[17px] leading-relaxed text-ink-2">
              {description.split(/\n{2,}/).map((para, i) => (
                <p key={i} className="whitespace-pre-line" dir="auto">
                  {para}
                </p>
              ))}
            </div>
          )}
          {p.detailImages.length > 0 && (
            <div className="-mx-4 flex flex-col overflow-hidden md:mx-0 md:rounded-2xl">
              {p.detailImages.map((img) => (
                <Image
                  key={img.id}
                  src={`/api/img/${img.id}`}
                  alt={img.alt ?? ""}
                  width={img.width}
                  height={img.height}
                  sizes="(min-width: 768px) 768px, 100vw"
                  className="block h-auto w-full"
                  {...(img.blur ? { placeholder: "blur" as const, blurDataURL: img.blur } : {})}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {specs.length > 0 && (
        <section className="mx-auto mt-10 max-w-3xl border-t border-line pt-8" aria-labelledby="specs-title">
          <TabTitle id="specs-title">{t.product.specs}</TabTitle>
          <dl className="mt-1 divide-y divide-line text-[17px]">
            {specs.map((s, i) =>
              s.label ? (
                <div key={i} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 py-3">
                  <dt className="text-muted" dir="auto">{s.label}</dt>
                  <dd className="text-ink" dir="auto">{s.value}</dd>
                </div>
              ) : (
                <div key={i} className="flex items-start gap-2 py-3">
                  <dt className="sr-only">·</dt>
                  <dd className="flex items-start gap-2 text-ink" dir="auto">
                    <IconCheck className="mt-1 h-4 w-4 shrink-0 text-olive" />
                    {s.value}
                  </dd>
                </div>
              ),
            )}
          </dl>
        </section>
      )}

      {/* Only real reviews: a new product shows no empty box. */}
      {p.reviews.length > 0 && (
        <section id="avis" className="mx-auto mt-10 max-w-3xl scroll-mt-4 border-t border-line pt-8" aria-labelledby="reviews-title">
          <TabTitle id="reviews-title">
            {t.product.reviews}
          </TabTitle>
          {p.rating && (
            <p className="mt-3 flex items-center gap-2 text-[17px]">
              <Stars value={p.rating.avg} size={22} />
              <span className="font-bold ltr-nums">{t.rating(p.rating.avg.toFixed(1), p.rating.count)}</span>
            </p>
          )}
          <ul className="flex flex-col divide-y divide-line">
            {p.reviews.map((r) => (
              <li key={r.id} className="py-4">
                <div className="flex items-center justify-between gap-2">
                  <Stars value={r.rating} size={18} />
                  <span className="text-[14px] text-muted">{new Date(r.createdAt).toLocaleDateString(lang === "ar" ? "ar-TN" : "fr-FR", { month: "long", year: "numeric" })}</span>
                </div>
                {r.text && <p className="mt-2 text-[17px] leading-relaxed text-ink-2" dir="auto">{r.text}</p>}
                <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[14px] text-muted">
                  <span className="font-bold text-ink">{r.authorName}</span>
                  {r.governorate && <span>· {governorateLabel(r.governorate, lang)}</span>}
                  <span className="inline-flex items-center gap-1 text-olive">
                    · <IconCheck className="h-3.5 w-3.5" /> {t.product.verified}
                  </span>
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Phone: what the current choice costs and the button, one look away. */}
      <div
        className={`fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 px-4 pb-[max(.625rem,env(safe-area-inset-bottom))] pt-2.5 shadow-[0_-6px_20px_-12px_rgb(0_0_0/.25)] backdrop-blur transition-transform duration-300 md:hidden ${
          sticky && !out ? "translate-y-0" : "translate-y-full"
        }`}
        aria-hidden={!sticky || out}
        data-testid="sticky-bar"
      >
        <div className="flex items-center gap-3">
          <p className="flex shrink-0 flex-col leading-tight">
            <span className="text-[14px] text-muted">{pay.from ? t.product.from : t.buy.price}</span>
            <span className="whitespace-nowrap text-[19px] font-bold text-ink price-nums ltr-nums">{formatTND(pay.price, lang)}</span>
          </p>
          <button type="button" tabIndex={sticky && !out ? 0 : -1} onClick={goToForm} className="flex h-[54px] min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-buy px-4 text-[18px] font-bold text-night shadow-[inset_0_-3px_0_var(--color-buy-2)]">
            <IconTruck className="h-6 w-6 shrink-0" />
            {t.buy.sticky}
          </button>
        </div>
      </div>
    </div>
  );
}

/** A section's name; the hairline above the section already separates it. */
function TabTitle({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="text-[20px] font-bold text-ink">
      {children}
    </h2>
  );
}

/**
 * The price under the name is the product's own: one unit (or the smallest
 * pack, said as such) when there are offers, else the chosen option's price,
 * else the lowest option price as "from". Each offer shows its own price.
 */
function shownPrice(p: P, c: BuyChoice, lang: Lang): { price: number; compareAt: number | null; note: string | null } {
  const t = dict(lang);
  const lead = leadOffer(p.offers.filter(c.fits));
  if (lead) return { price: lead.price, compareAt: lead.compareAt, note: lead.quantity > 1 ? t.product.pack(lead.quantity) : null };
  if (c.variant) return { price: c.variant.price, compareAt: c.variant.price === p.price ? p.compareAt : null, note: null };
  const prices = p.variants.map((v) => v.price);
  const min = prices.length ? Math.min(...prices) : p.price;
  return { price: min, compareAt: min === p.price ? p.compareAt : null, note: prices.some((x) => x !== min) ? t.product.from : null };
}

/** What the current choice costs before delivery, for the bar at the bottom: the offer, or the option × quantity. */
function payNow(p: P, c: BuyChoice): { price: number; from: boolean } {
  if (c.offer) return { price: c.offer.price, from: false };
  if (c.variant) return { price: c.variant.price * c.qty, from: false };
  const prices = p.variants.map((v) => v.price);
  const min = prices.length ? Math.min(...prices) : p.price;
  return { price: min * c.qty, from: prices.some((x) => x !== min) };
}

/** How and when it comes, under the price: the shop's one fee (or free) and the delays it set. */
function DeliveryLine({ lang, settings, free, price }: { lang: Lang; settings: PublicSettings; free: boolean; price: number }) {
  const t = dict(lang);
  const span = deliverySpan(settings.delivery.zones);
  if (!span) return null;
  const { fee, freeThreshold } = settings.delivery;
  const isFree = free || fee === 0 || (freeThreshold != null && price >= freeThreshold);
  return (
    <p className="flex items-start gap-2 text-[16px] text-ink-2" data-testid="delivery-line">
      <IconTruck className="mt-0.5 h-5 w-5 shrink-0 text-sea" />
      <span>
        {isFree ? <strong className="text-olive">{t.buy.freeDelivery}</strong> : <>{t.buy.delivery} <span className="price-nums ltr-nums">{formatTND(fee, lang)}</span></>}
        {" · "}
        {deliveryRangeLabel(span.minDays, span.maxDays, lang)}
      </span>
    </p>
  );
}

/**
 * The questions a cash-on-delivery buyer asks before ordering, answered from
 * the shop's own settings only: no promise the settings do not make. Closed
 * until tapped, so the page stays short.
 */
function Questions({ lang, settings }: { lang: Lang; settings: PublicSettings }) {
  const t = dict(lang);
  const q = t.product.faq;
  const span = deliverySpan(settings.delivery.zones);
  const { fee, freeThreshold, openBeforePaying } = settings.delivery;
  const items: { q: string; a: React.ReactNode }[] = [
    ...(span
      ? [{ q: q.whenQ, a: q.whenA(deliveryRangeLabel(span.minDays, span.maxDays, lang), fee === 0 ? t.buy.freeDelivery : `${t.buy.delivery} ${formatTND(fee, lang)}`, freeThreshold != null && fee > 0 ? formatTND(freeThreshold, lang) : null) }]
      : []),
    { q: q.payQ, a: openBeforePaying ? `${q.payA} ${q.openA}` : q.payA },
    { q: q.callQ, a: q.callA },
    {
      q: q.returnQ,
      a: (
        <>
          {q.returnA(settings.returns.days)}{" "}
          <Link href={href(lang, "/livraison-retours")} className="text-sea underline underline-offset-2" prefetch={false}>
            {q.more}
          </Link>
        </>
      ),
    },
  ];
  return (
    <section className="mx-auto mt-10 max-w-3xl border-t border-line pt-8" aria-labelledby="faq-title">
      <TabTitle id="faq-title">{q.title}</TabTitle>
      <div className="mt-2 divide-y divide-line">
        {items.map((it) => (
          <details key={it.q} className="group">
            <summary className="flex min-h-[56px] cursor-pointer list-none items-center justify-between gap-3 py-3 text-[17px] font-bold text-ink [&::-webkit-details-marker]:hidden">
              {it.q}
              <IconChevronDown className="h-5 w-5 shrink-0 text-ink-2 transition group-open:rotate-180" />
            </summary>
            <p className="pb-4 text-[17px] leading-relaxed text-ink-2">{it.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

/** Said only when it matters: a few left, or none. */
function StockLine({ lang, p, variant }: { lang: Lang; p: P; variant: BuyChoice["variant"] }) {
  const t = dict(lang);
  const stock = variant ? (variant.soldOut ? { kind: "out" as const } : variant.lowQty ? { kind: "low" as const, qty: variant.lowQty } : { kind: "in_stock" as const }) : p.stock;
  if (stock.kind === "out")
    return <p className="flex items-center gap-2 text-[16px] text-muted"><span className="h-2.5 w-2.5 rounded-full bg-muted" />{t.product.out}</p>;
  if (stock.kind === "low") return <p className="flex items-center gap-2 text-[16px] font-bold text-clay"><span className="h-2.5 w-2.5 rounded-full bg-clay" />{t.product.low(stock.qty)}</p>;
  return null;
}
