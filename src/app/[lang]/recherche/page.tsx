import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { dict, href, isLang } from "@/i18n";
import { searchProducts } from "@/lib/catalog";
import { getSettings } from "@/lib/settings";
import { ProductGrid } from "@/components/shop/ProductCard";
import { TrackView } from "@/components/shop/TrackView";
import { SearchPixel } from "@/components/shop/SearchPixel";
import { IconWhatsApp } from "@/components/shop/Icons";

export const metadata: Metadata = { robots: { index: false, follow: true } };

export default async function SearchRoute({ params, searchParams }: PageProps<"/[lang]/recherche">) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const t = dict(lang);
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw ?? "").trim().slice(0, 80);
  const [{ products: results, corrected }, settings] = await Promise.all([searchProducts(q), getSettings()]);

  return (
    <div className="mx-auto max-w-6xl px-4 pt-6">
      {q && (
        <>
          <TrackView name="search" props={{ q: q.toLowerCase(), results: results.length, corrected: Boolean(corrected) }} />
          <SearchPixel q={q} />
        </>
      )}
      {q && results.length > 0 && (
        <>
          {/* A word was corrected: the customer sees what was searched instead, like Google. */}
          <h1 className="text-[20px] font-bold">{t.search.results(results.length, corrected ?? q)}</h1>
          {corrected ? <p className="mb-4 mt-1 text-[16px] text-muted">{t.search.typed(q)}</p> : <div className="mb-4" />}
          <ProductGrid products={results} lang={lang} priorityFirst={4} />
        </>
      )}
      {q && results.length === 0 && (
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <h1 className="text-[24px] font-bold">{t.search.none(q)}</h1>
          <p className="max-w-sm text-[17px] text-ink-2">{t.search.noneHelp}</p>
          {settings.contact.whatsapp && (
            <a
              href={`https://wa.me/216${settings.contact.whatsapp}?text=${encodeURIComponent(lang === "ar" ? `السلام، نلوّج على: ${q}` : `Bonjour, je cherche : ${q}`)}`}
              target="_blank"
              rel="noopener"
              className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-wa px-5 text-[17px] font-bold text-white"
            >
              <IconWhatsApp /> WhatsApp
            </a>
          )}
          <Link href={href(lang, "/boutique")} className="inline-flex min-h-12 items-center rounded-xl border-2 border-field bg-white px-5 text-[17px] font-bold text-ink hover:bg-sand">
            {t.home.shopNow}
          </Link>
        </div>
      )}
    </div>
  );
}
