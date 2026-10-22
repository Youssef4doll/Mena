"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { dict, href, pick, type Lang } from "@/i18n";
import { loadQuick, type QuickData } from "@/lib/client/quick";
import { track } from "@/lib/client/track";
import { pixelViewContent } from "@/lib/client/pixels";
import { leadOffer } from "@/lib/offer-display";
import { SITE_URL } from "@/lib/site";
import { BuyBox, useBuyChoice } from "./BuyBox";
import { Sheet } from "./Sheet";

/**
 * The quick order form, over a list: a sheet from the bottom on a phone, a
 * window on a computer (see Sheet). The product is loaded as it opens.
 */
export function QuickSheet({ slug, lang, onClose }: { slug: string; lang: Lang; onClose: () => void }) {
  const t = dict(lang);
  // undefined: loading; null: could not load.
  const [data, setData] = useState<QuickData | null | undefined>(undefined);

  useEffect(() => {
    let live = true;
    loadQuick(slug).then((d) => {
      if (live) setData(d);
    });
    return () => {
      live = false;
    };
  }, [slug]);

  const p = data?.product;
  return (
    <Sheet lang={lang} titleId="qb-title" title={p ? pick(lang, p.name, p.nameAr) : t.product.quickLoading} image={p?.images[0]?.id ?? null} onClose={onClose}>
      {(dismiss) =>
        data === undefined ? (
          <div className="flex flex-col gap-3" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[92px] animate-pulse rounded-2xl bg-sand" />
            ))}
            <p className="text-center text-[16px] text-muted">{t.product.quickLoading}</p>
          </div>
        ) : data === null ? (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <p className="text-[17px] text-ink-2">{t.product.quickError}</p>
            <Link href={href(lang, `/produit/${slug}`)} replace className="flex min-h-12 items-center rounded-full border border-ink/60 bg-white px-6 text-[16px] font-bold text-ink hover:bg-sand">
              {t.product.quickSee}
            </Link>
          </div>
        ) : (
          <QuickForm data={data} slug={slug} lang={lang} onAdded={dismiss} />
        )
      }
    </Sheet>
  );
}

function QuickForm({ data, slug, lang, onAdded }: { data: QuickData; slug: string; lang: Lang; onAdded: () => void }) {
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
      {/* "Ajouter au panier" closes the sheet: the confirmation takes its place (and its history entry). */}
      <BuyBox p={p} lang={lang} settings={data.settings} url={`${SITE_URL}${path}`} choice={choice} idp="qb" origin="quick" onAdded={onAdded} />
      {/* Replaces the sheet's entry: Back from the product page returns to the list, not to a closed sheet. */}
      <Link href={path} replace className="flex min-h-11 items-center justify-center text-[16px] text-sea underline underline-offset-4">
        {t.product.quickSee}
      </Link>
    </div>
  );
}
