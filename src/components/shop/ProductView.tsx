"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { dict, pick, type Lang } from "@/i18n";
import type { ProductPage } from "@/lib/catalog";
import type { PublicSettings } from "@/lib/settings-schema";
import { track } from "@/lib/client/track";
import { pixelViewContent } from "@/lib/client/pixels";
import { formatTND } from "@/lib/money";
import { deliversEverywhere, governorateLabel } from "@/lib/governorates";
import { discountPct, leadOffer } from "@/lib/offer-display";
import { Price } from "./Price";
import { Stars } from "./Stars";
import { Placeholder } from "./Img";
import { BuyBox, useBuyChoice, type BuyChoice } from "./BuyBox";
import { IconCash, IconCheck, IconReturn, IconShield, IconTruck } from "./Icons";

type P = Omit<ProductPage, "related">;

/**
 * The product page is the shop: pictures, the price, and right under them
 * the form that places the order. Nothing to add to a basket, nothing to find
 * on another page.
 */
export function ProductView({ p, lang, settings, url }: { p: P; lang: Lang; settings: PublicSettings; url: string }) {
  const t = dict(lang);
  const name = pick(lang, p.name, p.nameAr);
  const out = p.stock.kind === "out";
  const buyRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const [sticky, setSticky] = useState(false);
  const choice = useBuyChoice(p);
  const shown = shownPrice(p, choice, lang);

  const viewPrice = leadOffer(p.offers)?.price ?? p.price;
  useEffect(() => {
    track("product_viewed", { productId: p.id, value: viewPrice });
    pixelViewContent({ id: p.id, name: p.name, price: viewPrice, qty: 1 });
  }, [p.id, p.name, viewPrice]);

  // The bottom bar shows while the order form is out of sight, above or below.
  useEffect(() => {
    let raf = 0;
    const check = () => {
      raf = 0;
      const el = buyRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      // Below the form: only once the name and price have gone off the top, so the bar never covers them.
      const head = headRef.current?.getBoundingClientRect();
      setSticky((r.top > innerHeight - 80 && head != null && head.bottom < 0) || r.bottom < 120);
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

  function goToForm() {
    document.getElementById("commander")?.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => (document.getElementById("bb-name") as HTMLInputElement | null)?.focus({ preventScroll: true }), 450);
  }

  const details = (
    <>
      {(p.description || p.descriptionAr) && (
        <section className="rounded-3xl border border-line bg-white p-5">
          <h2 className="mb-3 text-[19px] font-bold text-ink">{t.product.description}</h2>
          <div className="flex flex-col gap-3 text-[17px] leading-relaxed text-ink-2">
            {pick(lang, p.description, p.descriptionAr)
              .split(/\n{2,}/)
              .map((para, i) => (
                <p key={i} className="whitespace-pre-line" dir="auto">
                  {para}
                </p>
              ))}
          </div>
        </section>
      )}
      <section id="avis" className="rounded-3xl border border-line bg-white p-5">
        <h2 className="mb-3 flex items-center gap-2 text-[19px] font-bold text-ink">
          {t.product.reviews}
          {p.rating && <span className="text-[16px] font-normal text-muted ltr-nums">({p.rating.count})</span>}
        </h2>
        {p.reviews.length === 0 ? (
          <p className="text-[16px] text-muted">{t.product.noReviews}</p>
        ) : (
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
        )}
      </section>
    </>
  );

  return (
    // One copy of everything: on a phone the order is pictures → buy → details;
    // on a wide screen the grid puts the details under the pictures.
    <div className="mx-auto grid max-w-6xl gap-4 px-4 pb-28 pt-0 md:grid-cols-[1.1fr_1fr] md:grid-rows-[auto_1fr] md:gap-x-10 md:gap-y-6 md:pb-16 md:pt-8">
      <div className="min-w-0 md:col-start-1 md:row-start-1">
        <Gallery images={p.images} name={name} productId={p.id} lang={lang} badge={out ? 0 : discountPct(shown.price, shown.compareAt)} />
      </div>

      <div className="flex min-w-0 flex-col gap-4 md:col-start-2 md:row-span-2 md:row-start-1">
        <div ref={headRef} className="flex flex-col gap-1.5">
          <h1 className="text-[26px] font-bold leading-tight text-ink md:text-[40px]">{name}</h1>
          {p.rating && (
            <a href="#avis" className="flex items-center gap-2 text-[15px] text-muted">
              <Stars value={p.rating.avg} size={18} />
              <span className="ltr-nums">{t.rating(p.rating.avg.toFixed(1), p.rating.count)}</span>
            </a>
          )}
          <div className="mt-1">
            <Price value={shown.price} compareAt={out ? null : shown.compareAt} lang={lang} size="lg" from={shown.note ?? undefined} steady={p.offers.length > 0} />
          </div>
          <StockLine lang={lang} p={p} variant={choice.variant} />
        </div>

        <div ref={buyRef}>
          <BuyBox p={p} lang={lang} settings={settings} url={url} choice={choice} />
        </div>

        {/* The three promises, small, after the button: the form comes first on a phone. */}
        <ul className="grid grid-cols-1 gap-2 text-[16px] leading-snug text-ink-2 sm:grid-cols-3 sm:text-center md:grid-cols-1 md:text-start lg:grid-cols-3 lg:text-center">
          <Reassure icon={<IconCash className="h-6 w-6" />} text={t.trust.cod} />
          {settings.delivery.openBeforePaying ? (
            <Reassure icon={<IconShield className="h-6 w-6" />} text={t.trust.openBeforePaying} />
          ) : (
            <Reassure icon={<IconTruck className="h-6 w-6" />} text={deliversEverywhere(settings.delivery.zones) ? t.trust.delivery : t.trust.deliveryHome} />
          )}
          <Reassure icon={<IconReturn className="h-6 w-6" />} text={t.trust.returns(settings.returns.days)} />
        </ul>

      </div>

      <div className="flex min-w-0 flex-col gap-5 md:col-start-1 md:row-start-2 md:self-start">{details}</div>

      {/* Mobile: one button that brings the order form back, wherever the reader is. */}
      <div
        className={`fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 px-4 pb-[max(.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur transition-transform duration-300 md:hidden ${
          sticky && !out ? "translate-y-0" : "translate-y-full"
        }`}
        aria-hidden={!sticky || out}
      >
        <div className="flex items-center gap-3">
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[15px] text-muted">{name}</span>
            <span className="flex flex-wrap items-baseline gap-x-1.5 text-[18px] font-bold">
              {shown.note && <span className="text-[15px] font-normal text-muted">{shown.note}</span>}
              <span className="whitespace-nowrap ltr-nums">{formatTND(shown.price, lang)}</span>
            </span>
          </div>
          <button type="button" tabIndex={sticky && !out ? 0 : -1} onClick={goToForm} className="h-14 shrink-0 rounded-2xl bg-navy px-7 text-[18px] font-bold text-white">
            {t.buy.sticky}
          </button>
        </div>
      </div>
    </div>
  );
}

function Reassure({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <li className="flex items-center gap-3 rounded-2xl bg-white px-3 py-2.5 ring-1 ring-line sm:flex-col sm:gap-1.5 md:flex-row md:gap-3 lg:flex-col lg:gap-1.5">
      <span className="shrink-0 text-sea">{icon}</span>
      {text}
    </li>
  );
}

/**
 * The price at the top says what the form will charge: the chosen offer (with
 * its pack size when it is more than one), else the chosen option's price,
 * else the lowest option price as "from".
 */
function shownPrice(p: P, c: BuyChoice, lang: Lang): { price: number; compareAt: number | null; note: string | null } {
  const t = dict(lang);
  if (c.offer) return { price: c.offer.price, compareAt: c.offer.compareAt, note: c.offer.quantity > 1 ? t.product.pack(c.offer.quantity) : null };
  if (c.variant) return { price: c.variant.price, compareAt: c.variant.price === p.price ? p.compareAt : null, note: null };
  const prices = p.variants.map((v) => v.price);
  const min = prices.length ? Math.min(...prices) : p.price;
  return { price: min, compareAt: min === p.price ? p.compareAt : null, note: prices.some((x) => x !== min) ? t.product.from : null };
}

function StockLine({ lang, p, variant }: { lang: Lang; p: P; variant: BuyChoice["variant"] }) {
  const t = dict(lang);
  const stock = variant ? (variant.soldOut ? { kind: "out" as const } : variant.lowQty ? { kind: "low" as const, qty: variant.lowQty } : { kind: "in_stock" as const }) : p.stock;
  if (stock.kind === "out")
    return <p className="flex items-center gap-2 text-[16px] text-muted"><span className="h-2.5 w-2.5 rounded-full bg-muted" />{t.product.out}</p>;
  if (stock.kind === "low") return <p className="flex items-center gap-2 text-[16px] font-bold text-clay"><span className="h-2.5 w-2.5 rounded-full bg-clay" />{t.product.low(stock.qty)}</p>;
  return <p className="flex items-center gap-2 text-[16px] font-bold text-olive"><span className="h-2.5 w-2.5 rounded-full bg-olive" />{t.product.inStock}</p>;
}

/**
 * The pictures: swiped on a phone (dots, and thumbnails under them); on a
 * computer, a framed picture with its thumbnails down the side.
 */
function Gallery({ images, name, productId, badge, lang }: { images: P["images"]; name: string; productId: string; badge: number; lang: Lang }) {
  const t = dict(lang);
  const [i, setI] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const swiped = useRef(false);
  const tag = badge > 0 ? <span className="absolute start-3 top-3 z-10 rounded-full bg-olive px-3 py-1 text-[15px] font-bold text-white ltr-nums">−{badge}%</span> : null;
  if (images.length === 0)
    return (
      <div className="relative -mx-4 aspect-square overflow-hidden md:mx-0 md:rounded-3xl">
        {tag}
        <Placeholder />
      </div>
    );
  const go = (n: number) => {
    const el = ref.current;
    if (!el) return;
    el.scrollTo({ left: (document.dir === "rtl" ? -1 : 1) * n * el.clientWidth, behavior: "smooth" });
  };
  // The picture comes first for screen readers and on a phone; on a computer the thumbnails move to its side.
  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-start md:gap-3">
      <div className="relative -mx-4 min-w-0 md:mx-0 md:flex-1">
        {tag}
        <div
          ref={ref}
          className="flex aspect-square snap-x snap-mandatory overflow-x-auto bg-white no-scrollbar md:rounded-3xl md:border-2 md:border-sea/25"
          onScroll={(e) => {
            const el = e.currentTarget;
            const n = Math.round(Math.abs(el.scrollLeft) / el.clientWidth);
            if (n !== i) {
              setI(n);
              if (!swiped.current) {
                swiped.current = true;
                track("gallery_swiped", { productId });
              }
            }
          }}
        >
          {images.map((img, n) => (
            <div key={img.id} className="relative h-full w-full shrink-0 snap-center bg-sand">
              <Image
                src={`/api/img/${img.id}`}
                alt={img.alt ?? `${name} — ${n + 1}`}
                fill
                sizes="(min-width: 768px) 50vw, 100vw"
                priority={n === 0}
                className="object-cover"
                {...(img.blur ? { placeholder: "blur" as const, blurDataURL: img.blur } : {})}
              />
            </div>
          ))}
        </div>
        {images.length > 1 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-1.5 md:hidden">
            {images.map((img, n) => (
              <span key={img.id} className={`h-1.5 rounded-full bg-white shadow transition-all ${n === i ? "w-5" : "w-1.5 opacity-60"}`} />
            ))}
          </div>
        )}
      </div>
      {images.length > 1 && (
        <div className="hidden gap-2 overflow-x-auto p-1 no-scrollbar md:order-first md:flex md:max-h-[560px] md:w-[92px] md:shrink-0 md:flex-col md:overflow-y-auto">
          {images.map((img, n) => (
            <button key={img.id} type="button" onClick={() => go(n)} className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2 bg-white md:h-20 md:w-20 ${n === i ? "border-sea" : "border-line"}`} aria-label={t.product.photo(n + 1, images.length)} aria-current={n === i}>
              <Image src={`/api/img/${img.id}`} alt="" fill sizes="80px" className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
