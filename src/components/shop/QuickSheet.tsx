"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { dict, href, pick, type Lang } from "@/i18n";
import { loadQuick, type QuickData } from "@/lib/client/quick";
import { track } from "@/lib/client/track";
import { pixelViewContent } from "@/lib/client/pixels";
import { leadOffer } from "@/lib/offer-display";
import { SITE_URL } from "@/lib/site";
import { BuyBox, useBuyChoice } from "./BuyBox";
import { IconClose } from "./Icons";

/**
 * The quick order form: a sheet from the bottom on a phone, a window on a
 * computer. Escape or the backdrop closes it; the page behind does not scroll.
 */
export function QuickSheet({ slug, lang, onClose }: { slug: string; lang: Lang; onClose: () => void }) {
  const t = dict(lang);
  // undefined: loading; null: could not load.
  const [data, setData] = useState<QuickData | null | undefined>(undefined);
  const closeBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let live = true;
    loadQuick(slug).then((d) => {
      if (live) setData(d);
    });
    return () => {
      live = false;
    };
  }, [slug]);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, [onClose]);

  const p = data?.product;
  const image = p?.images[0]?.id ?? null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6" role="dialog" aria-modal="true" aria-labelledby="qb-title">
      <button type="button" className="absolute inset-0 animate-fade bg-ink/50" onClick={onClose} aria-label={t.nav.close} tabIndex={-1} />
      <div className="relative flex max-h-[94dvh] w-full animate-sheet-up flex-col overflow-hidden rounded-t-3xl bg-cream shadow-lift md:max-w-xl md:rounded-3xl">
        <div className="flex items-center gap-3 border-b border-line bg-white px-4 py-3">
          <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-sand">
            {image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/img/${image}/200`} alt="" className="h-full w-full object-cover" />
            )}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[14px] font-bold text-sea">{t.product.quickTitle}</span>
            <span id="qb-title" className="line-clamp-2 text-[17px] font-bold leading-snug text-ink">
              {p ? pick(lang, p.name, p.nameAr) : t.product.quickLoading}
            </span>
          </span>
          <button ref={closeBtn} type="button" onClick={onClose} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink hover:bg-sand" aria-label={t.nav.close}>
            <IconClose className="h-6 w-6" />
          </button>
        </div>
        <div className="overflow-y-auto overscroll-contain px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
          {data === undefined ? (
            <div className="flex flex-col gap-3" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-[92px] animate-pulse rounded-2xl bg-sand" />
              ))}
              <p className="text-center text-[16px] text-muted">{t.product.quickLoading}</p>
            </div>
          ) : data === null ? (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <p className="text-[17px] text-ink-2">{t.product.quickError}</p>
              <Link href={href(lang, `/produit/${slug}`)} className="flex min-h-12 items-center rounded-xl bg-navy px-5 text-[16px] font-bold text-white">
                {t.product.quickSee}
              </Link>
            </div>
          ) : (
            <QuickForm data={data} slug={slug} lang={lang} />
          )}
        </div>
      </div>
    </div>
  );
}

function QuickForm({ data, slug, lang }: { data: QuickData; slug: string; lang: Lang }) {
  const t = dict(lang);
  const p = data.product;
  const choice = useBuyChoice(p);
  const path = href(lang, `/produit/${slug}`);
  const price = leadOffer(p.offers)?.price ?? p.price;

  // Opening the form counts as seeing the product, as on its page.
  useEffect(() => {
    track("product_viewed", { productId: p.id, value: price, props: { where: "quick" } });
    pixelViewContent({ id: p.id, name: p.name, price, qty: 1 });
  }, [p.id, p.name, price]);

  return (
    <div className="flex flex-col gap-4">
      <BuyBox p={p} lang={lang} settings={data.settings} url={`${SITE_URL}${path}`} choice={choice} idp="qb" />
      <Link href={path} className="flex min-h-11 items-center justify-center text-[16px] text-sea underline underline-offset-4">
        {t.product.quickSee}
      </Link>
    </div>
  );
}
