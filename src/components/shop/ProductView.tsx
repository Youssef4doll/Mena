"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { dict, href, pick, type Lang } from "@/i18n";
import type { ProductPage } from "@/lib/catalog";
import type { PublicSettings } from "@/lib/settings-schema";
import { useCart } from "@/lib/client/cart-store";
import { track } from "@/lib/client/track";
import { pixelAddToCart, pixelContact, pixelViewContent } from "@/lib/client/pixels";
import { getGov, setGov } from "@/lib/client/quote";
import { useHydrated } from "@/lib/client/hydrated";
import { formatTND } from "@/lib/money";
import { GOVERNORATES, governorateLabel } from "@/lib/governorates";
import { deliveryRangeLabel } from "@/lib/delivery";
import { Price } from "./Price";
import { Stars } from "./Stars";
import { Qty } from "./CartDrawer";
import { Placeholder } from "./Img";
import { IconCash, IconCheck, IconPin, IconReturn, IconShield, IconTruck, IconWhatsApp } from "./Icons";

type P = Omit<ProductPage, "related">;

export function ProductView({ p, lang, settings, url }: { p: P; lang: Lang; settings: PublicSettings; url: string }) {
  const t = dict(lang);
  const router = useRouter();
  const add = useCart((s) => s.add);
  const setOpen = useCart((s) => s.setOpen);
  const name = pick(lang, p.name, p.nameAr);
  const hasVariants = p.variants.length > 0;
  const firstAvailable = p.variants.find((v) => !v.soldOut);
  const [variantId, setVariantId] = useState<string | null>(hasVariants && p.variants.length === 1 && firstAvailable ? firstAvailable.id : null);
  const [qty, setQty] = useState(1);
  const [needVariant, setNeedVariant] = useState(false);
  const [added, setAdded] = useState(false);
  const ctaRef = useRef<HTMLDivElement>(null);
  const [sticky, setSticky] = useState(false);

  const variant = p.variants.find((v) => v.id === variantId) ?? null;
  const price = variant?.price ?? p.price;
  const out = p.stock.kind === "out" || (variant?.soldOut ?? false);
  const maxQty = p.stock.kind === "low" ? p.stock.qty : variant?.lowQty ?? 10;

  useEffect(() => {
    track("product_viewed", { productId: p.id, value: p.price });
    pixelViewContent({ id: p.id, name: p.name, price: p.price, qty: 1 });
  }, [p.id, p.name, p.price]);

  // A scroll listener rather than an IntersectionObserver: a fast fling can
  // carry the buttons from below the fold to above it between two frames,
  // and an observer never reports a crossing it did not see.
  useEffect(() => {
    let raf = 0;
    const check = () => {
      raf = 0;
      const el = ctaRef.current;
      if (el) setSticky(el.getBoundingClientRect().bottom < 0);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(check);
    };
    addEventListener("scroll", onScroll, { passive: true });
    check();
    return () => {
      removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  function put(): boolean {
    if (out) return false;
    if (hasVariants && !variant) {
      setNeedVariant(true);
      document.getElementById("variants")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return false;
    }
    add({ productId: p.id, variantId: variant?.id ?? null, qty, name: p.name, variantName: variant?.name ?? null, imageId: p.images[0]?.id ?? null, slug: p.slug });
    track("add_to_cart", { productId: p.id, value: price * qty, props: { qty, variant: variant?.name ?? null } });
    pixelAddToCart({ id: p.id, name: p.name, price, qty });
    return true;
  }

  const waText = t.product.whatsappText(name, variant?.name ?? null, formatTND(price, lang), url);

  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 pb-28 pt-3 md:grid-cols-[1.1fr_1fr] md:gap-12 md:pb-16 md:pt-8">
      <Gallery images={p.images} name={name} productId={p.id} />

      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-[28px] leading-[1.12] text-ink md:text-[34px]">{name}</h1>
          {p.rating && (
            <a href="#avis" className="flex items-center gap-2 text-sm text-muted">
              <Stars value={p.rating.avg} />
              <span className="ltr-nums">{t.rating(p.rating.avg.toFixed(1), p.rating.count)}</span>
            </a>
          )}
          <div className="mt-1">
            <Price value={price} compareAt={variant ? null : p.compareAt} lang={lang} size="lg" />
          </div>
          <StockLine lang={lang} p={p} variantLow={variant?.lowQty ?? null} variantOut={variant?.soldOut ?? false} />
        </div>

        {hasVariants && (
          <div id="variants" className="flex flex-col gap-2.5">
            <p className={`text-sm font-medium ${needVariant && !variant ? "text-danger" : "text-ink"}`}>
              {needVariant && !variant ? t.product.chooseFirst : t.product.choose}
              {variant && <span className="font-normal text-muted"> · {variant.name}</span>}
            </p>
            <div className="flex flex-wrap gap-2">
              {p.variants.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  disabled={v.soldOut}
                  onClick={() => {
                    setVariantId(v.id);
                    setNeedVariant(false);
                    setQty(1);
                  }}
                  aria-pressed={variantId === v.id}
                  className={`min-h-11 rounded-full border px-4 text-sm transition ${
                    variantId === v.id ? "border-ink bg-ink text-white" : "border-line bg-white text-ink hover:border-ink/40"
                  } disabled:cursor-not-allowed disabled:border-dashed disabled:bg-transparent disabled:text-muted disabled:line-through`}
                >
                  {v.name}
                  {v.price !== p.price && <span className="ms-1.5 text-xs opacity-75 ltr-nums">{formatTND(v.price, lang)}</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        <div ref={ctaRef} className="flex flex-col gap-3">
          {!out && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted">{t.product.qty}</span>
              <Qty value={qty} onChange={(v) => setQty(Math.max(1, Math.min(maxQty, v)))} max={maxQty} />
            </div>
          )}
          <button
            type="button"
            disabled={out}
            onClick={() => {
              if (put()) router.push(href(lang, "/commande"));
            }}
            className="flex h-14 w-full flex-col items-center justify-center rounded-full bg-sea text-white shadow-soft transition active:scale-[.99] disabled:bg-sand-2 disabled:text-muted"
            data-testid="buy-now"
          >
            <span className="text-[16px] font-semibold leading-tight">{out ? t.product.out : t.product.buyNow}</span>
            {!out && <span className="text-[12px] leading-tight opacity-85">{t.product.buyNowSub}</span>}
          </button>
          {!out && (
            <button
              type="button"
              onClick={() => {
                if (put()) {
                  setAdded(true);
                  setTimeout(() => setAdded(false), 1800);
                  setOpen(true);
                }
              }}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-full border border-ink/80 text-[15px] font-medium text-ink transition active:scale-[.99]"
              data-testid="add-to-cart"
            >
              {added ? (
                <>
                  <IconCheck /> {t.product.added}
                </>
              ) : (
                t.product.addToCart
              )}
            </button>
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
              className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#1f9d55]/10 text-[15px] font-medium text-[#137a40]"
            >
              <IconWhatsApp className="h-5 w-5" />
              {t.product.orderWhatsApp}
            </a>
          )}
          {out && <p className="text-sm text-muted">{t.product.outSub}</p>}
        </div>

        <DeliveryEstimate lang={lang} settings={settings} price={price * qty} productId={p.id} />

        <ul className="flex flex-col gap-3 rounded-2xl border border-line bg-white/60 p-4 text-sm">
          <li className="flex gap-3">
            <IconCash className="h-5 w-5 shrink-0 text-sea" />
            <span>
              <span className="font-medium">{t.trust.cod}</span> — <span className="text-muted">{t.trust.codSub}</span>
            </span>
          </li>
          {settings.delivery.openBeforePaying && (
            <li className="flex gap-3">
              <IconShield className="h-5 w-5 shrink-0 text-sea" />
              <span className="text-muted">{t.trust.openBeforePaying}</span>
            </li>
          )}
          <li className="flex gap-3">
            <IconReturn className="h-5 w-5 shrink-0 text-sea" />
            <span className="text-muted">{t.product.returns(settings.returns.days)}</span>
          </li>
        </ul>

        {(p.description || p.descriptionAr) && (
          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-[0.12em] text-muted">{t.product.description}</h2>
            <div className="flex flex-col gap-3 text-[15px] leading-relaxed text-ink-2">
              {pick(lang, p.description, p.descriptionAr)
                .split(/\n{2,}/)
                .map((para, i) => (
                  <p key={i} className="whitespace-pre-line">
                    {para}
                  </p>
                ))}
            </div>
          </section>
        )}

        <section id="avis" className="scroll-mt-24">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.12em] text-muted">
            {t.product.reviews}
            {p.rating && <span className="font-normal normal-case tracking-normal ltr-nums">({p.rating.count})</span>}
          </h2>
          {p.reviews.length === 0 ? (
            <p className="text-sm text-muted">{t.product.noReviews}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {p.reviews.map((r) => (
                <li key={r.id} className="py-4">
                  <div className="flex items-center justify-between gap-2">
                    <Stars value={r.rating} />
                    <span className="text-xs text-muted">{new Date(r.createdAt).toLocaleDateString(lang === "ar" ? "ar-TN" : "fr-FR", { month: "long", year: "numeric" })}</span>
                  </div>
                  {r.text && <p className="mt-2 text-[14px] leading-relaxed text-ink-2">{r.text}</p>}
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
                    <span className="font-medium text-ink">{r.authorName}</span>
                    {r.governorate && <span>· {governorateLabel(r.governorate, lang)}</span>}
                    <span className="inline-flex items-center gap-1 text-olive">
                      · <IconCheck className="h-3 w-3" /> {t.product.verified}
                    </span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* The order bar that follows the thumb once the main button scrolls away. */}
      <div
        className={`fixed inset-x-0 bottom-0 z-30 border-t border-line bg-cream/95 px-4 pb-[max(.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur transition-transform duration-300 md:hidden ${
          sticky && !out ? "translate-y-0" : "translate-y-full"
        }`}
        aria-hidden={!sticky}
      >
        <div className="flex items-center gap-3">
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[13px] text-muted">{name}</span>
            <span className="font-semibold ltr-nums">{formatTND(price * qty, lang)}</span>
          </div>
          <button
            type="button"
            tabIndex={sticky ? 0 : -1}
            onClick={() => {
              if (put()) router.push(href(lang, "/commande"));
            }}
            className="h-12 shrink-0 rounded-full bg-sea px-6 text-[15px] font-semibold text-white"
          >
            {t.product.buyNow}
          </button>
        </div>
      </div>
    </div>
  );
}

function StockLine({ lang, p, variantLow, variantOut }: { lang: Lang; p: P; variantLow: number | null; variantOut: boolean }) {
  const t = dict(lang);
  if (p.stock.kind === "out" || variantOut)
    return <p className="flex items-center gap-1.5 text-sm text-muted"><span className="h-2 w-2 rounded-full bg-muted" />{t.product.out}</p>;
  const low = variantLow ?? (p.stock.kind === "low" ? p.stock.qty : null);
  if (low != null) return <p className="flex items-center gap-1.5 text-sm text-clay"><span className="h-2 w-2 rounded-full bg-clay" />{t.product.low(low)}</p>;
  return <p className="flex items-center gap-1.5 text-sm text-olive"><span className="h-2 w-2 rounded-full bg-olive" />{t.product.inStock}</p>;
}

function Gallery({ images, name, productId }: { images: P["images"]; name: string; productId: string }) {
  const [i, setI] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const swiped = useRef(false);
  if (images.length === 0)
    return (
      <div className="relative aspect-[4/5] overflow-hidden rounded-card">
        <Placeholder />
      </div>
    );
  const go = (n: number) => {
    const el = ref.current;
    if (!el) return;
    el.scrollTo({ left: (document.dir === "rtl" ? -1 : 1) * n * el.clientWidth, behavior: "smooth" });
  };
  return (
    <div className="flex flex-col gap-3 md:sticky md:top-20 md:self-start">
      <div className="relative -mx-4 md:mx-0">
        <div
          ref={ref}
          className="flex aspect-[4/5] snap-x snap-mandatory overflow-x-auto no-scrollbar md:rounded-card"
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
                sizes="(min-width: 768px) 55vw, 100vw"
                priority={n === 0}
                className="object-cover"
                {...(img.blur ? { placeholder: "blur" as const, blurDataURL: img.blur } : {})}
              />
            </div>
          ))}
        </div>
        {images.length > 1 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
            {images.map((img, n) => (
              <span key={img.id} className={`h-1.5 rounded-full bg-white shadow transition-all ${n === i ? "w-5" : "w-1.5 opacity-60"}`} />
            ))}
          </div>
        )}
      </div>
      {images.length > 1 && (
        <div className="hidden gap-2 md:flex">
          {images.map((img, n) => (
            <button key={img.id} type="button" onClick={() => go(n)} className={`relative h-20 w-16 overflow-hidden rounded-lg border-2 ${n === i ? "border-ink" : "border-transparent"}`} aria-label={`${n + 1}`}>
              <Image src={`/api/img/${img.id}`} alt="" fill sizes="64px" className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Fee and usual delay for the chosen governorate, straight from the shop's delivery settings. */
function DeliveryEstimate({ lang, settings, price, productId }: { lang: Lang; settings: PublicSettings; price: number; productId: string }) {
  const t = dict(lang);
  const hydrated = useHydrated();
  // The visitor's last pick (kept in this browser) until they choose here.
  const [picked, setG] = useState<string | null>(null);
  const gov = picked ?? (hydrated ? getGov() ?? "" : "");
  const zone = gov ? settings.delivery.zones[gov] : null;
  const threshold = settings.delivery.freeThreshold;
  const free = threshold != null && price >= threshold;
  const options = useMemo(() => GOVERNORATES.map((g) => ({ id: g.id, label: governorateLabel(g.id, lang) })), [lang]);

  return (
    <div className="rounded-2xl bg-sand/70 p-4">
      <label className="flex flex-col gap-2 text-sm font-medium text-ink">
        <span className="flex items-center gap-2">
          <IconPin className="h-5 w-5 text-sea" />
          {t.product.deliveryTo}
        </span>
        <select
          value={gov}
          onChange={(e) => {
            setG(e.target.value);
            setGov(e.target.value);
            track("delivery_estimate_checked", { productId, props: { governorate: e.target.value } });
          }}
          className="h-11 w-full rounded-xl border border-line bg-white px-3 text-[15px] font-normal"
          aria-label={t.product.chooseGov}
        >
          <option value="">{t.product.chooseGov}</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      {zone &&
        (zone.enabled ? (
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl bg-white/80 p-2.5">
              <dt className="flex items-center gap-1.5 text-xs text-muted">
                <IconTruck className="h-4 w-4" />
                {t.product.deliveryFee}
              </dt>
              <dd className="mt-0.5 font-semibold ltr-nums">{free ? t.product.free : formatTND(zone.fee, lang)}</dd>
            </div>
            <div className="rounded-xl bg-white/80 p-2.5">
              <dt className="text-xs text-muted">{t.product.deliveryDelay}</dt>
              <dd className="mt-0.5 font-semibold">{deliveryRangeLabel(zone.minDays, zone.maxDays, lang)}</dd>
            </div>
          </dl>
        ) : (
          <p className="mt-3 text-sm text-clay">{t.product.notDelivered}</p>
        ))}
      {threshold != null && !free && <p className="mt-2.5 text-xs text-muted">{t.product.freeFrom(formatTND(threshold, lang))}</p>}
    </div>
  );
}
