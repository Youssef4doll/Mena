"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { dict, href, pick, type Lang } from "@/i18n";
import type { ProductPage } from "@/lib/catalog";
import type { PublicSettings } from "@/lib/settings-schema";
import { track } from "@/lib/client/track";
import { pixelContact, pixelViewContent } from "@/lib/client/pixels";
import { formatTND } from "@/lib/money";
import { descriptionBlocks } from "@/lib/description";
import { governorateLabel } from "@/lib/governorates";
import { discountPct, leadOffer } from "@/lib/offer-display";
import { offerTitle } from "@/lib/offer-label";
import { deliveryRangeLabel, deliverySpan, freeOffersOf } from "@/lib/delivery";
import { Stars } from "./Stars";
import { Bidi } from "./Bidi";
import { Gallery, slidesOf } from "./Gallery";
import { BuyBox, addChoiceToCart, useBuyChoice, type BuyChoice } from "./BuyBox";
import { VariantSelect } from "./VariantSelect";
import { useOrderDraft } from "./OrderForm";
import { OrderSheet } from "./OrderSheet";
import { IconCartPlus, IconCash, IconCheck, IconChevronDown, IconMinus, IconPlus, IconReturn, IconShield, IconTruck, IconWhatsApp } from "./Icons";

type P = Omit<ProductPage, "related">;

/**
 * The product page, kept to what a cash-on-delivery customer needs, in the
 * order they need it: the pictures (and the video), the name and a line about
 * the product, the price, the offers and the four-field form. Under it, the
 * long pictures and the description, the reviews of customers who received
 * it, the questions asked before ordering, the price again with one button,
 * then the specifications. Few words, plain sizes, one strong button.
 *
 * Past the form, the order comes to the reader (in a sheet over the page)
 * rather than the reader going back up to it.
 */
export function ProductView({ p, lang, settings, url }: { p: P; lang: Lang; settings: PublicSettings; url: string }) {
  const t = dict(lang);
  const name = pick(lang, p.name, p.nameAr);
  const summary = pick(lang, p.summary, p.summaryAr);
  const out = p.stock.kind === "out";
  const buyRef = useRef<HTMLDivElement>(null);
  const priceRef = useRef<HTMLParagraphElement>(null);
  const endRef = useRef<HTMLButtonElement>(null);
  const [sticky, setSticky] = useState(false);
  const [sheet, setSheet] = useState(false);
  const choice = useBuyChoice(p);
  // What is typed, the same in the page's form and in the sheet's.
  const draft = useOrderDraft();
  const shown = shownPrice(p, choice, lang);
  const pct = out ? 0 : discountPct(shown.price, shown.compareAt);
  const struck = !out && shown.compareAt != null && shown.compareAt > shown.price ? shown.compareAt : null;
  const pay = payNow(p, choice);
  const slides = useMemo(() => slidesOf(p.images, p.video), [p.images, p.video]);
  const details = p.detailImages;
  const detailsTitle = useRef<HTMLHeadingElement>(null);
  const picturesRef = useRef<HTMLDivElement>(null);
  const picturesEnd = useRef<HTMLSpanElement>(null);

  const viewPrice = leadOffer(p.offers)?.price ?? p.price;
  useEffect(() => {
    track("product_viewed", { productId: p.id, value: viewPrice });
    pixelViewContent({ id: p.id, name: p.name, price: viewPrice, qty: 1 });
  }, [p.id, p.name, viewPrice]);

  // The bottom bar shows whenever the order form is out of sight, from the first screen on: on a short
  // phone (an ad opened in the Facebook app) the price and the button are there before any scrolling.
  // It hides once a good part of the form is on screen, or while any part of the order block's own button at
  // the end is (never two such buttons on screen at once), and waits while the page's own price line, fully
  // visible, sits where the bar would cover it (a price cut by the screen's edge is in the bar).
  useEffect(() => {
    let raf = 0;
    const check = () => {
      raf = 0;
      const el = buyRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const formInView = r.top < innerHeight - 160 && r.bottom > 140;
      const end = endRef.current?.getBoundingClientRect();
      const endInView = end != null && end.top < innerHeight && end.bottom > 0;
      const pr = priceRef.current?.getBoundingClientRect();
      const priceUnderBar = pr != null && pr.bottom <= innerHeight && pr.bottom > innerHeight - 84;
      setSticky(!formInView && !endInView && !priceUnderBar);
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

  // Tells what else floats at the bottom (the cookie question) to stay above the bar.
  useEffect(() => {
    const root = document.documentElement;
    root.toggleAttribute("data-sticky", sticky && !out);
    return () => root.removeAttribute("data-sticky");
  }, [sticky, out]);

  // How far the long pictures are read, once each per page view: the first one reaching the middle of the
  // screen (the bottom half of the screen is left out, so a picture taller than the screen counts too), then
  // the end of the last one.
  const hasDetails = details.length > 0;
  useEffect(() => {
    if (!hasDetails || typeof IntersectionObserver === "undefined") return;
    const watch = (el: Element | null, name: "details_seen" | "details_end", rootMargin = "0px") => {
      if (!el) return null;
      const io = new IntersectionObserver(
        (entries) => {
          if (!entries.some((e) => e.isIntersecting)) return;
          io.disconnect();
          track(name, { productId: p.id });
        },
        { rootMargin },
      );
      io.observe(el);
      return io;
    };
    const seen = watch(picturesRef.current, "details_seen", "0px 0px -50% 0px");
    const end = watch(picturesEnd.current, "details_end");
    return () => {
      seen?.disconnect();
      end?.disconnect();
    };
  }, [p.id, hasDetails]);

  /** The gallery's link: down to the long pictures' title, which takes the focus, so the reader knows where they arrived. */
  function toDetails() {
    track("details_link_clicked", { productId: p.id });
    const h = detailsTitle.current;
    h?.scrollIntoView({ behavior: "smooth", block: "start" });
    h?.focus({ preventScroll: true });
  }

  function openSheet(from: "bar" | "end" | "side" | "box") {
    track("order_sheet_opened", { productId: p.id, props: { from } });
    setSheet(true);
  }

  // Still under the form (the first screen): down to the first thing still missing, the option, then the first
  // empty field, else the button itself (a customer who filled the form and went on reading is not sent back to
  // the top of it). Past the form: the form opens in a sheet, and the reader stays where they were reading.
  function goToForm() {
    const past = (buyRef.current?.getBoundingClientRect().bottom ?? 0) < 0;
    track("sticky_clicked", { productId: p.id, props: { mode: past ? "sheet" : "scroll" } });
    if (past) {
      openSheet("bar");
      return;
    }
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
    <div className="mx-auto max-w-6xl xl:max-w-7xl 2xl:max-w-[90rem] px-4 pb-28 md:pb-16">
      {/* One copy of everything. Phone: pictures → name and price → offers and form → details.
          Tablet and small computer: the pictures on the left (they stay in view), the rest on the right.
          Wide computer, like Amazon: the pictures, then the name, the price and what the product is in brief,
          then the purchase in its own box, from the top of the page. */}
      <div className="grid gap-4 pt-1 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:grid-rows-[auto_1fr] md:gap-x-10 md:gap-y-5 md:pt-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_320px] xl:gap-x-8">
        <div className="min-w-0 md:sticky md:top-36 md:col-start-1 md:row-span-2 md:row-start-1 md:self-start">
          <Gallery slides={slides} name={name} productId={p.id} lang={lang} badge={0} details={hasDetails ? { count: details.length, label: t.product.detailsLink, onClick: toDetails } : undefined} />
        </div>

        <div className="flex min-w-0 flex-col gap-2 md:col-start-2 md:row-start-1">
          <h1 className="text-[24px] font-bold leading-snug text-ink md:text-[30px] md:leading-tight"><Bidi text={name} /></h1>
          {summary && (
            <p className="text-[16px] leading-relaxed text-ink-2" dir="auto" data-testid="summary">
              <Bidi text={summary} />
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

        <InBrief lang={lang} description={description} specs={specs} more={Boolean(description || hasDetails)} />

        <div ref={buyRef} className={`min-w-0 pt-1 md:col-start-2 md:row-start-2 ${out ? "xl:col-start-3 xl:row-span-2 xl:row-start-1 xl:self-start" : "xl:hidden"}`}>
          <BuyBox p={p} lang={lang} settings={settings} url={url} choice={choice} origin="product" draft={draft} paused={sheet} />
        </div>
        {/* Wide computer: the purchase in a box of its own, like Amazon's, its button opening the form over the page
            (after the page's own box in the page's order, which phones read). Sold out, the page's own box says so there instead. */}
        {!out && <DeskBox p={p} lang={lang} settings={settings} url={url} choice={choice} onOrder={() => openSheet("box")} />}
      </div>

      {/* The long pictures first, one under the other (they sell): edge to edge on a phone; on a computer in a column
          about a phone's width (they are made for one, and a screen-wide picture took two screens), with the description
          beside them and the price and the button staying in view while they are read. Without pictures, the description
          alone at a readable line length. With pictures, the title has the gallery link's words. Below 1024 px the
          wrappers are display: contents, so a phone lays out the same boxes as before the computer layout existed
          (Safari shrank the pictures when their column was aligned to its start). */}
      {(description || hasDetails) && (
        <section id="details" className="mx-auto mt-10 flex max-w-5xl flex-col gap-4 border-t border-line pt-8" aria-labelledby="desc-title">
          <TabTitle id="desc-title" ref={detailsTitle}>
            {hasDetails ? t.product.detailsTitle : t.product.description}
          </TabTitle>
          <div className={hasDetails ? "contents lg:grid lg:grid-cols-[500px_minmax(0,1fr)] lg:gap-12" : "contents"}>
            {hasDetails && (
              <div ref={picturesRef} className="relative -mx-4 flex flex-col overflow-hidden md:mx-auto md:w-full md:max-w-[540px] md:rounded-2xl lg:mx-0 lg:max-w-none lg:self-start">
                {details.map((img) => (
                  <Image
                    key={img.id}
                    src={`/api/img/${img.id}`}
                    alt={img.alt ?? ""}
                    width={img.width}
                    height={img.height}
                    sizes="(min-width: 1024px) 500px, (min-width: 768px) 540px, 100vw"
                    className="block h-auto w-full"
                    {...(img.blur ? { placeholder: "blur" as const, blurDataURL: img.blur } : {})}
                  />
                ))}
                {/* The last picture's last line: once on screen, the pictures were seen to the end. */}
                <span ref={picturesEnd} aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-px" />
              </div>
            )}
            {(description || (hasDetails && !out)) && (
              <div className="flex min-w-0 flex-col gap-6 max-lg:contents">
                {description && (
                  <div className={`flex max-w-3xl flex-col gap-3 text-[17px] leading-relaxed text-ink-2 ${hasDetails ? "md:mx-auto md:w-full md:max-w-[540px] lg:mx-0 lg:max-w-none" : ""}`}>
                    {/* Lines starting with "- " read as a list of ticks, like Amazon's "About this item". */}
                    {descriptionBlocks(description).map((b, i) =>
                      b.kind === "text" ? (
                        <p key={i} className="whitespace-pre-line" dir="auto">
                          <Bidi text={b.text} />
                        </p>
                      ) : (
                        <ul key={i} className="flex flex-col gap-2.5">
                          {b.items.map((item, j) => (
                            <li key={j} className="flex items-start gap-2.5" dir="auto">
                              <IconCheck className="mt-1 h-5 w-5 shrink-0 text-olive" />
                              <span className="min-w-0"><Bidi text={item} /></span>
                            </li>
                          ))}
                        </ul>
                      ),
                    )}
                  </div>
                )}
                {hasDetails && !out && (
                  <SideOrder lang={lang} settings={settings} name={name} price={pay.price} from={pay.from} free={Boolean(choice.offer?.freeDelivery)} onOrder={() => openSheet("side")} />
                )}
              </div>
            )}
          </div>
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

      {/* "قبل ما تطلب": the questions people ask, under the pictures and what customers said. */}
      <Questions lang={lang} settings={settings} freeOffers={freeOffersOf(p.offers)} />

      {/* The end of the reading: the price of the current choice and one button, which opens the form here. */}
      {!out && <EndOrder ref={endRef} lang={lang} settings={settings} price={pay.price} from={pay.from} free={Boolean(choice.offer?.freeDelivery)} onOrder={() => openSheet("end")} />}

      {specs.length > 0 && (
        <section className="mx-auto mt-10 max-w-3xl border-t border-line pt-8" aria-labelledby="specs-title">
          <TabTitle id="specs-title">{t.product.specs}</TabTitle>
          <dl className="mt-1 divide-y divide-line text-[17px]">
            {specs.map((s, i) =>
              s.label ? (
                <div key={i} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 py-3">
                  <dt className="text-muted" dir="auto"><Bidi text={s.label} /></dt>
                  <dd className="text-ink" dir="auto"><Bidi text={s.value} /></dd>
                </div>
              ) : (
                <div key={i} className="flex items-start gap-2 py-3">
                  <dt className="sr-only">·</dt>
                  <dd className="flex items-start gap-2 text-ink" dir="auto">
                    <IconCheck className="mt-1 h-4 w-4 shrink-0 text-olive" />
                    <Bidi text={s.value} />
                  </dd>
                </div>
              ),
            )}
          </dl>
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

      {sheet && <OrderSheet p={p} lang={lang} settings={settings} url={url} choice={choice} draft={draft} onClose={() => setSheet(false)} />}
    </div>
  );
}

/**
 * Wide computer only, under the price, like Amazon's "About this item": the
 * product's own main facts (the first labelled characteristics) and the
 * description's points, cut short with a link down to the whole of it.
 * Nothing that is not already on the page, said again closer to the top.
 */
function InBrief({ lang, description, specs, more }: { lang: Lang; description: string; specs: { label: string; value: string }[]; more: boolean }) {
  const t = dict(lang);
  const blocks = descriptionBlocks(description);
  const points = blocks.flatMap((b) => (b.kind === "list" ? b.items : [])).slice(0, 6);
  // A description written as sentences: its first paragraph, a few lines of it.
  const opening = points.length ? null : (blocks.find((b) => b.kind === "text")?.text ?? null);
  const facts = specs.filter((s) => s.label).slice(0, 5);
  if (!points.length && !opening && !facts.length) return null;
  return (
    <div className="hidden min-w-0 flex-col gap-4 border-t border-line pt-4 xl:col-start-2 xl:row-start-2 xl:flex" data-testid="in-brief">
      {facts.length > 0 && (
        <table className="w-full text-[15px]">
          <tbody>
            {facts.map((f, i) => (
              <tr key={i} className="align-top">
                <th scope="row" className="w-[42%] py-1 pe-3 text-start font-bold text-ink" dir="auto"><Bidi text={f.label} /></th>
                <td className="py-1 text-ink-2" dir="auto"><Bidi text={f.value} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {(points.length > 0 || opening) && (
        <div className="flex flex-col gap-2">
          <h2 className="text-[17px] font-bold text-ink">{t.product.inBrief}</h2>
          {points.length > 0 ? (
            <ul className="flex list-disc flex-col gap-1.5 ps-5 text-[15px] leading-relaxed text-ink-2 marker:text-muted">
              {points.map((x, i) => (
                <li key={i} dir="auto"><Bidi text={x} /></li>
              ))}
            </ul>
          ) : (
            <p className="line-clamp-6 whitespace-pre-line text-[15px] leading-relaxed text-ink-2" dir="auto"><Bidi text={opening!} /></p>
          )}
        </div>
      )}
      {more && (
        <a href="#details" className="self-start text-[15px] text-sea underline underline-offset-4 hover:text-sea-2">
          {t.product.seeAll}
        </a>
      )}
    </div>
  );
}

/**
 * Wide computer only, in the third column, like Amazon's buy box: what the
 * current choice costs and its delivery, the offers (or the option and the
 * quantity), "Acheter maintenant" (the form opens over the page, with what
 * was chosen here), the basket and WhatsApp, then what the shop's own
 * settings promise. Short enough to be seen whole on a laptop's first screen.
 */
function DeskBox({ p, lang, settings, url, choice, onOrder }: { p: P; lang: Lang; settings: PublicSettings; url: string; choice: BuyChoice; onOrder: () => void }) {
  const t = dict(lang);
  const pay = payNow(p, choice);
  const offer = choice.offer;
  const struck = offer && offer.compareAt != null && offer.compareAt > offer.price ? offer.compareAt : null;
  const span = deliverySpan(settings.delivery.zones);
  const name = pick(lang, p.name, p.nameAr);
  const option = [choice.variant ? pick(lang, choice.variant.name, choice.variant.nameAr) : null, offer ? pick(lang, offer.label, offer.labelAr) : null].filter(Boolean).join(" — ") || null;
  return (
    <div className="hidden min-w-0 flex-col gap-4 rounded-[24px] border border-line bg-white p-5 shadow-[0_10px_30px_-22px_rgb(0_0_0/.45)] xl:col-start-3 xl:row-span-2 xl:row-start-1 xl:flex xl:self-start" data-testid="desk-box">
      <div className="flex flex-col gap-2">
        <p className="flex flex-wrap items-baseline gap-x-2">
          {pay.from && <span className="text-[15px] text-muted">{t.product.from}</span>}
          <span className="whitespace-nowrap text-[28px] font-bold leading-none text-ink price-nums ltr-nums">{formatTND(pay.price, lang)}</span>
          {struck != null && (
            <>
              <span className="sr-only">{t.buy.instead(formatTND(struck, lang))}</span>
              <s aria-hidden className="whitespace-nowrap text-[16px] text-muted price-nums ltr-nums">{formatTND(struck, lang)}</s>
            </>
          )}
        </p>
        <DeliveryLine lang={lang} settings={settings} free={Boolean(offer?.freeDelivery)} price={pay.price} />
        {span && <p className="text-[15px] text-ink-2">{t.product.deliveryDelay} : {deliveryRangeLabel(span.minDays, span.maxDays, lang)}</p>}
        <StockLine lang={lang} p={p} variant={choice.variant} />
      </div>

      {p.offers.length > 0 && (
        <fieldset className="flex min-w-0 flex-col gap-2">
          <legend className="sr-only">{t.buy.step1}</legend>
          {p.offers.map((o) => {
            const off = !choice.fits(o);
            const on = offer?.id === o.id;
            const pct = o.quantity > 1 ? discountPct(o.price, o.compareAt) : 0;
            return (
              <label key={o.id} className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 transition ${off ? "cursor-not-allowed border-dashed border-line opacity-60" : on ? "cursor-pointer border-sea bg-sea-soft/60 ring-1 ring-sea" : "cursor-pointer border-sand-2 hover:border-sea/60"}`}>
                <input type="radio" name="dk-offer" checked={on} disabled={off} onChange={() => choice.setOffer(o.id)} className="h-5 w-5 shrink-0 accent-[var(--color-sea)]" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex flex-wrap items-center gap-x-1.5 text-[15px] leading-snug text-ink">
                    {offerTitle(o, lang)}
                    {pct > 0 && !off && <span className="rounded-full bg-deal px-1.5 text-[12px] font-bold leading-5 text-white"><span className="ltr-nums">−{pct}%</span></span>}
                  </span>
                  {o.freeDelivery && !off && <span className="text-[13px] font-bold text-olive">{t.buy.freeDelivery}</span>}
                </span>
                <span className="whitespace-nowrap text-[16px] font-bold text-ink price-nums ltr-nums">{formatTND(o.price, lang)}</span>
              </label>
            );
          })}
        </fieldset>
      )}

      {p.variants.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p id="dk-variants-label" className="ps-1 text-[15px] text-ink-2">{t.product.choose}</p>
          <VariantSelect
            id="dk-variant"
            labelledBy="dk-variants-label"
            lang={lang}
            options={p.variants.map((v) => ({ id: v.id, label: pick(lang, v.name, v.nameAr), colorHex: v.colorHex ?? null, price: !choice.hasOffers && v.price !== p.price ? v.price : null, soldOut: v.soldOut }))}
            value={choice.variant?.id ?? null}
            placeholder={t.product.chooseFirst}
            soldOutText={t.product.out}
            invalid={false}
            onChange={(v) => choice.setVariant(v)}
          />
        </div>
      )}

      {!choice.hasOffers && (
        <div className="flex items-center justify-between gap-3">
          <span className="ps-1 text-[15px] text-ink-2" id="dk-qty-label">{t.buy.quantity}</span>
          <div className="inline-flex h-11 items-center rounded-full border border-field bg-white px-1" role="group" aria-labelledby="dk-qty-label">
            <button type="button" className="flex h-11 w-11 items-center justify-center disabled:opacity-30" onClick={() => choice.setQty(Math.max(1, choice.qty - 1))} disabled={choice.qty <= 1} aria-label={t.buy.qtyLess}>
              <IconMinus className="h-5 w-5" />
            </button>
            <span className="w-7 text-center text-[17px] font-bold ltr-nums" aria-live="polite">{choice.qty}</span>
            <button type="button" className="flex h-11 w-11 items-center justify-center disabled:opacity-30" onClick={() => choice.setQty(Math.min(choice.maxQty, choice.qty + 1))} disabled={choice.qty >= choice.maxQty} aria-label={t.buy.qtyMore}>
              <IconPlus className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <button type="button" onClick={onOrder} aria-haspopup="dialog" className="flex min-h-[54px] w-full items-center justify-center gap-2.5 rounded-full bg-buy px-5 py-2 text-[18px] font-bold leading-tight text-night shadow-[inset_0_-3px_0_var(--color-buy-2)] transition [--focus-ring:var(--color-night)] hover:bg-buy-2 active:scale-[.99]" data-testid="desk-buy">
          <IconTruck className="h-6 w-6 shrink-0" />
          {t.product.buyNow}
        </button>
        <button
          type="button"
          // An option still to choose: the form over the page asks for it.
          onClick={() => {
            if (!addChoiceToCart(p, choice, "desk")) onOrder();
          }}
          className="flex min-h-12 w-full items-center justify-center gap-2.5 rounded-full border border-ink/60 bg-white px-5 text-[16px] font-bold text-ink transition hover:bg-sand active:scale-[.99]"
        >
          <IconCartPlus className="h-5 w-5 shrink-0" />
          {t.product.addToCart}
        </button>
        {settings.contact.whatsapp && (
          <a
            href={`https://wa.me/216${settings.contact.whatsapp}?text=${encodeURIComponent(t.product.whatsappText(name, option, formatTND(pay.price, lang), url))}`}
            target="_blank"
            rel="noopener"
            onClick={() => {
              track("whatsapp_clicked", { productId: p.id, props: { where: "desk" } });
              pixelContact();
            }}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 text-[15px] font-bold text-ink hover:bg-sand"
          >
            <IconWhatsApp className="h-5 w-5 text-wa" />
            {t.buy.whatsapp}
          </a>
        )}
      </div>

      <ul className="flex flex-col gap-2 border-t border-line pt-4 text-[15px] text-ink-2">
        <li className="flex items-start gap-2"><IconCash className="mt-0.5 h-5 w-5 shrink-0 text-sea" />{t.trust.cod}</li>
        {settings.delivery.openBeforePaying && <li className="flex items-start gap-2"><IconShield className="mt-0.5 h-5 w-5 shrink-0 text-sea" />{t.trust.openBeforePaying}</li>}
        {settings.returns.days > 0 && (
          <li className="flex items-start gap-2">
            <IconReturn className="mt-0.5 h-5 w-5 shrink-0 text-sea" />
            <Link href={href(lang, "/livraison-retours")} prefetch={false} className="underline-offset-4 hover:underline">{t.trust.returns(settings.returns.days)}</Link>
          </li>
        )}
      </ul>
    </div>
  );
}

/** A section's name; the hairline above the section already separates it. One a link leads to takes the focus (`ref`). */
function TabTitle({ id, ref, children }: { id: string; ref?: React.Ref<HTMLHeadingElement>; children: React.ReactNode }) {
  return (
    <h2 id={id} ref={ref} tabIndex={ref ? -1 : undefined} className="scroll-mt-4 text-[20px] font-bold text-ink">
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

/** What delivery costs, under the price: the shop's one fee, or free. The delay is answered in the questions below. */
function DeliveryLine({ lang, settings, free, price }: { lang: Lang; settings: PublicSettings; free: boolean; price: number }) {
  const t = dict(lang);
  // A shop that delivers nowhere says nothing here.
  if (!deliverySpan(settings.delivery.zones)) return null;
  const { fee, freeThreshold } = settings.delivery;
  const isFree = free || fee === 0 || (freeThreshold != null && price >= freeThreshold);
  return (
    <p className="flex items-start gap-2 text-[16px] text-ink-2" data-testid="delivery-line">
      <IconTruck className="mt-0.5 h-5 w-5 shrink-0 text-sea" />
      <span>
        {isFree ? <strong className="text-olive">{t.buy.freeDelivery}</strong> : <>{t.buy.delivery} <span className="price-nums ltr-nums">{formatTND(fee, lang)}</span></>}
      </span>
    </p>
  );
}

/**
 * Under the questions, for the reader who has read it all: what the current
 * choice costs, what delivery costs, and one button that opens the form in
 * place, where the reading ended. The bottom bar gives way to that button
 * (`ref`).
 */
function EndOrder({ ref, lang, settings, price, from, free, onOrder }: { ref: React.Ref<HTMLButtonElement>; lang: Lang; settings: PublicSettings; price: number; from: boolean; free: boolean; onOrder: () => void }) {
  const t = dict(lang);
  return (
    <div className="mx-auto mt-10 flex max-w-3xl flex-col gap-3 rounded-[24px] bg-sand/70 p-4 md:p-5" data-testid="end-order">
      <p className="flex items-baseline justify-between gap-3">
        <span className="text-[16px] text-ink-2">{from ? t.product.from : t.buy.price}</span>
        <span className="whitespace-nowrap text-[24px] font-bold leading-none text-ink price-nums ltr-nums">{formatTND(price, lang)}</span>
      </p>
      <DeliveryLine lang={lang} settings={settings} free={free} price={price} />
      <button ref={ref} type="button" onClick={onOrder} aria-haspopup="dialog" className="flex min-h-[58px] w-full items-center justify-center gap-2.5 rounded-full bg-buy px-5 py-2 text-[19px] font-bold leading-tight text-night shadow-[inset_0_-3px_0_var(--color-buy-2)] transition [--focus-ring:var(--color-night)] hover:bg-buy-2 active:scale-[.99]">
        <IconTruck className="h-6 w-6 shrink-0" />
        {t.product.orderNow}
      </button>
    </div>
  );
}

/**
 * Computer only, beside the long pictures: the name, what the current choice
 * costs, delivery, payment on delivery and the button, staying in view while
 * the pictures are read (a phone has its bar at the bottom instead).
 */
function SideOrder({ lang, settings, name, price, from, free, onOrder }: { lang: Lang; settings: PublicSettings; name: string; price: number; from: boolean; free: boolean; onOrder: () => void }) {
  const t = dict(lang);
  return (
    <div className="sticky top-40 flex flex-col gap-3 rounded-[24px] border border-line bg-white p-5 shadow-[0_10px_30px_-20px_rgb(0_0_0/.4)] max-lg:hidden" data-testid="side-order">
      <p className="line-clamp-2 text-[17px] font-bold leading-snug text-ink">{name}</p>
      <p className="flex items-baseline justify-between gap-3">
        <span className="text-[16px] text-ink-2">{from ? t.product.from : t.buy.price}</span>
        <span className="whitespace-nowrap text-[26px] font-bold leading-none text-ink price-nums ltr-nums">{formatTND(price, lang)}</span>
      </p>
      <DeliveryLine lang={lang} settings={settings} free={free} price={price} />
      <p className="flex items-start gap-2 text-[16px] text-ink-2">
        <IconCash className="mt-0.5 h-5 w-5 shrink-0 text-sea" />
        {t.trust.cod}
      </p>
      <button type="button" onClick={onOrder} aria-haspopup="dialog" className="mt-1 flex min-h-[54px] w-full items-center justify-center gap-2.5 rounded-full bg-buy px-5 py-2 text-[18px] font-bold leading-tight text-night shadow-[inset_0_-3px_0_var(--color-buy-2)] transition [--focus-ring:var(--color-night)] hover:bg-buy-2 active:scale-[.99]">
        <IconTruck className="h-6 w-6 shrink-0" />
        {t.product.orderNow}
      </button>
    </div>
  );
}

/**
 * The questions a cash-on-delivery buyer asks before ordering, answered from
 * the shop's own settings only: no promise the settings do not make. Closed
 * until tapped, so the page stays short.
 */
function Questions({ lang, settings, freeOffers }: { lang: Lang; settings: PublicSettings; freeOffers: "all" | "some" | "none" }) {
  const t = dict(lang);
  const q = t.product.faq;
  const span = deliverySpan(settings.delivery.zones);
  const { fee, freeThreshold, openBeforePaying } = settings.delivery;
  // The same rule as the summary above (deliveryFeeFor): free when every offer of this product is, else the fee and when it is waived.
  const allFree = fee === 0 || freeOffers === "all";
  const items: { q: string; a: React.ReactNode }[] = [
    ...(span
      ? [{ q: q.whenQ, a: q.whenA(deliveryRangeLabel(span.minDays, span.maxDays, lang), allFree ? t.buy.freeDelivery : `${t.buy.delivery} ${formatTND(fee, lang)}`, freeThreshold != null && !allFree ? formatTND(freeThreshold, lang) : null, !allFree && freeOffers === "some") }]
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
