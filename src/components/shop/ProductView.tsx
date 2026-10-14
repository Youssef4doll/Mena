"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { dict, pick, type Lang } from "@/i18n";
import type { ProductPage } from "@/lib/catalog";
import type { PublicSettings } from "@/lib/settings-schema";
import { track } from "@/lib/client/track";
import { pixelViewContent } from "@/lib/client/pixels";
import { formatTND } from "@/lib/money";
import { deliversEverywhere, governorateLabel } from "@/lib/governorates";
import { discountPct, leadOffer } from "@/lib/offer-display";
import { Stars } from "./Stars";
import { Gallery, slidesOf } from "./Gallery";
import { BuyBox, addChoiceToCart, useBuyChoice, type BuyChoice } from "./BuyBox";
import { IconCartPlus, IconCash, IconCheck, IconFire, IconReturn, IconTruck } from "./Icons";

type P = Omit<ProductPage, "related">;

/**
 * Amazon's product page, kept to what a cash-on-delivery customer needs: the
 * name and a line about the product, the pictures (and the video), the price,
 * and right under it the form that places the order. Under the form, all
 * there is to know: the description, the specifications, the long pictures,
 * the reviews of customers who received it.
 */
export function ProductView({ p, lang, settings, url }: { p: P; lang: Lang; settings: PublicSettings; url: string }) {
  const t = dict(lang);
  const name = pick(lang, p.name, p.nameAr);
  const summary = pick(lang, p.summary, p.summaryAr);
  const out = p.stock.kind === "out";
  const buyRef = useRef<HTMLDivElement>(null);
  const galleryRef = useRef<HTMLDivElement>(null);
  const [sticky, setSticky] = useState(false);
  const choice = useBuyChoice(p);
  const shown = shownPrice(p, choice, lang);
  const pct = out ? 0 : discountPct(shown.price, shown.compareAt);
  const slides = useMemo(() => slidesOf(p.images, p.video), [p.images, p.video]);
  // The struck price's line is kept whenever some choice has one, so picking an offer never moves the form.
  const mayStrike = p.compareAt != null || p.offers.some((o) => o.compareAt != null || o.quantity > 1) || p.variants.some((v) => v.price !== p.price);

  const viewPrice = leadOffer(p.offers)?.price ?? p.price;
  useEffect(() => {
    track("product_viewed", { productId: p.id, value: viewPrice });
    pixelViewContent({ id: p.id, name: p.name, price: viewPrice, qty: 1 });
  }, [p.id, p.name, viewPrice]);

  // The bottom bar shows whenever the order form is out of sight (and the pictures are not under it):
  // the price and the button are always one look away.
  useEffect(() => {
    let raf = 0;
    const check = () => {
      raf = 0;
      const el = buyRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      // Before the form: once the pictures and their thumbnails are above the bar, so it never covers them.
      const g = galleryRef.current?.getBoundingClientRect();
      setSticky((r.top > innerHeight - 40 && g != null && g.bottom < innerHeight - 84) || r.bottom < 140);
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
    // An option to choose comes first; otherwise straight to the name.
    const target = p.variants.length > 0 && !choice.variant ? document.querySelector<HTMLButtonElement>("#bb-variants button:not(:disabled)") : (document.getElementById("bb-name") as HTMLInputElement | null);
    setTimeout(() => target?.focus({ preventScroll: true }), 450);
  }

  function stickyCart() {
    if (p.variants.length > 0 && !choice.variant) return goToForm();
    addChoiceToCart(p, choice, "sticky");
  }

  const description = pick(lang, p.description, p.descriptionAr);
  const specs = lang === "ar" && p.specsAr ? p.specsAr : p.specs;
  const hasDetails = Boolean(description) || specs.length > 0 || p.detailImages.length > 0;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-28 md:pb-16">
      {/* One copy of everything. Phone: name → pictures → price and form → details.
          Computer: the pictures on the left (they stay in view), the rest on the right. */}
      <div className="grid gap-4 pt-3 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:grid-rows-[auto_1fr] md:gap-x-10 md:gap-y-4 md:pt-6">
        <div className="flex min-w-0 flex-col gap-1.5 md:col-start-2 md:row-start-1">
          <h1 className="text-[22px] font-bold leading-snug text-ink md:text-[32px] md:leading-tight">{name}</h1>
          {summary && (
            <p className="text-[17px] leading-relaxed text-ink-2" dir="auto" data-testid="summary">
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
                <span className="flex items-center gap-1 font-bold text-ink-2">
                  <IconFire className="h-4 w-4 text-clay" />
                  <span className="ltr-nums">+{p.sold}</span> <span className="font-normal">{t.product.soldSuffix}</span>
                </span>
              )}
            </div>
          )}
        </div>

        <div ref={galleryRef} className="min-w-0 md:sticky md:top-36 md:col-start-1 md:row-span-2 md:row-start-1 md:self-start">
          <Gallery slides={slides} name={name} productId={p.id} lang={lang} badge={pct} />
        </div>

        <div className="flex min-w-0 flex-col gap-4 md:col-start-2 md:row-start-2">
          <div className="flex flex-col gap-1">
            {/* Amazon's price: the saving in red, the price large, the real former price under it. */}
            <p className="flex flex-wrap items-baseline gap-x-3" data-testid="price">
              {pct > 0 && <span className="text-[26px] font-normal text-deal ltr-nums">−{pct}%</span>}
              {shown.note === t.product.from && <span className="text-[16px] text-muted">{shown.note}</span>}
              <span className="whitespace-nowrap text-[32px] font-bold leading-none text-ink price-nums ltr-nums">{formatTND(shown.price, lang)}</span>
            </p>
            {mayStrike && (
              <p className="min-h-[1.6em] text-[15px] text-muted">
                {shown.note && shown.note !== t.product.from && <span className="me-2 font-bold text-ink-2">{shown.note}</span>}
                {!out && shown.compareAt != null && shown.compareAt > shown.price && (
                  <>
                    {t.product.oldPrice} <s className="price-nums ltr-nums">{formatTND(shown.compareAt, lang)}</s>
                  </>
                )}
              </p>
            )}
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
              <StockLine lang={lang} p={p} variant={choice.variant} />
              <span className="flex items-center gap-1.5 text-[16px] font-bold text-olive">
                <IconCash className="h-5 w-5 shrink-0" />
                {t.trust.cod}
              </span>
            </div>
          </div>

          {/* The order form as one white panel: edge to edge on a phone, a card on a computer. */}
          <div ref={buyRef} className="-mx-4 border-y border-line bg-white px-4 py-5 md:mx-0 md:rounded-2xl md:border md:p-6 md:shadow-soft">
            <BuyBox p={p} lang={lang} settings={settings} url={url} choice={choice} />
          </div>

          {/* Delivery and returns; cash on delivery and checking the parcel are said next to the button. */}
          <ul className="grid grid-cols-2 divide-x divide-line overflow-hidden rounded-2xl border border-line bg-white text-[16px] leading-snug text-ink-2 rtl:divide-x-reverse">
            <Reassure icon={<IconTruck className="h-6 w-6" />} text={deliversEverywhere(settings.delivery.zones) ? t.trust.delivery : t.trust.deliveryHome} />
            <Reassure icon={<IconReturn className="h-6 w-6" />} text={t.trust.returns(settings.returns.days)} />
          </ul>
        </div>
      </div>

      {hasDetails && (
        <section className="mx-auto mt-8 flex max-w-4xl flex-col gap-4 md:mt-12" aria-labelledby="details-title">
          <h2 id="details-title" className="text-[23px] font-bold leading-tight text-ink md:text-[28px]">
            {t.product.moreAbout}
          </h2>
          {description && (
            <div className="rounded-3xl border border-line bg-white p-5">
              <h3 className="mb-3 text-[19px] font-bold text-ink">{t.product.description}</h3>
              <div className="flex flex-col gap-3 text-[17px] leading-relaxed text-ink-2">
                {description.split(/\n{2,}/).map((para, i) => (
                  <p key={i} className="whitespace-pre-line" dir="auto">
                    {para}
                  </p>
                ))}
              </div>
            </div>
          )}
          {specs.length > 0 && (
            <div className="rounded-3xl border border-line bg-white p-5">
              <h3 className="mb-2 text-[19px] font-bold text-ink">{t.product.specs}</h3>
              <dl className="divide-y divide-line text-[17px]">
                {specs.map((s, i) =>
                  s.label ? (
                    <div key={i} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 py-2.5">
                      <dt className="font-bold text-ink" dir="auto">{s.label}</dt>
                      <dd className="text-ink-2" dir="auto">{s.value}</dd>
                    </div>
                  ) : (
                    <div key={i} className="flex items-start gap-2 py-2.5">
                      <dt className="sr-only">·</dt>
                      <dd className="flex items-start gap-2 text-ink-2" dir="auto">
                        <IconCheck className="mt-1 h-4 w-4 shrink-0 text-olive" />
                        {s.value}
                      </dd>
                    </div>
                  ),
                )}
              </dl>
            </div>
          )}
          {/* The long pictures, one under the other, edge to edge on a phone, like Amazon's. */}
          {p.detailImages.length > 0 && (
            <div className="-mx-4 flex flex-col overflow-hidden bg-white md:mx-0 md:rounded-3xl md:border md:border-line">
              {p.detailImages.map((img) => (
                <Image
                  key={img.id}
                  src={`/api/img/${img.id}`}
                  alt={img.alt ?? ""}
                  width={img.width}
                  height={img.height}
                  sizes="(min-width: 896px) 896px, 100vw"
                  className="block h-auto w-full"
                  {...(img.blur ? { placeholder: "blur" as const, blurDataURL: img.blur } : {})}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Only real reviews: a new product shows no empty box. */}
      {p.reviews.length > 0 && (
        <section id="avis" className="mx-auto mt-6 max-w-4xl scroll-mt-4 rounded-3xl border border-line bg-white p-5">
          <h2 className="mb-3 flex items-center gap-2 text-[21px] font-bold text-ink">
            {t.product.reviews}
            {p.rating && <span className="text-[16px] font-normal text-muted ltr-nums">({p.rating.count})</span>}
          </h2>
          {p.rating && (
            <p className="mb-2 flex items-center gap-2 text-[17px]">
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

      {/* Phone: the price and "Acheter maintenant" stay one look away, and the basket beside it. */}
      <div
        className={`fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 px-3 pb-[max(.625rem,env(safe-area-inset-bottom))] pt-2.5 shadow-[0_-6px_20px_-12px_rgb(0_0_0/.25)] backdrop-blur transition-transform duration-300 md:hidden ${
          sticky && !out ? "translate-y-0" : "translate-y-full"
        }`}
        aria-hidden={!sticky || out}
        data-testid="sticky-bar"
      >
        <div className="flex items-stretch gap-2">
          <button type="button" tabIndex={sticky && !out ? 0 : -1} onClick={stickyCart} className="flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-2xl border-2 border-night/80 bg-white text-night" aria-label={t.product.addToCart}>
            <IconCartPlus className="h-7 w-7" />
          </button>
          <button type="button" tabIndex={sticky && !out ? 0 : -1} onClick={goToForm} className="flex h-[58px] min-w-0 flex-1 flex-col items-center justify-center rounded-2xl bg-buy px-3 leading-tight text-night shadow-[inset_0_-3px_0_var(--color-buy-2)]">
            <span className="text-[18px] font-bold">{t.buy.sticky}</span>
            <span className="text-[15px]">
              {shown.note && <span className="me-1">{shown.note}</span>}
              <span className="font-bold price-nums ltr-nums">{formatTND(shown.price, lang)}</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

function Reassure({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <li className="flex min-h-14 items-center gap-2.5 px-3 py-2.5">
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
