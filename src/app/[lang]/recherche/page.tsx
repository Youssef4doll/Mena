import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { dict, href, isLang } from "@/i18n";
import { searchProducts } from "@/lib/catalog";
import { getSettings } from "@/lib/settings";
import { ProductGrid } from "@/components/shop/ProductCard";
import { TrackView } from "@/components/shop/TrackView";
import { SearchPixel } from "@/components/shop/SearchPixel";
import { IconSearch, IconWhatsApp } from "@/components/shop/Icons";

export const metadata: Metadata = { robots: { index: false, follow: true } };

export default async function SearchRoute({ params, searchParams }: PageProps<"/[lang]/recherche">) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const t = dict(lang);
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw ?? "").trim().slice(0, 80);
  const [results, settings] = await Promise.all([searchProducts(q), getSettings()]);

  return (
    <div className="mx-auto max-w-6xl px-4 pt-6">
      <form action={href(lang, "/recherche")} className="mb-6 flex items-center gap-2 rounded-full border border-line bg-white px-4" role="search">
        <IconSearch className="h-5 w-5 text-muted" />
        <input name="q" defaultValue={q} placeholder={t.nav.searchPlaceholder} className="h-12 flex-1 bg-transparent outline-none" enterKeyHint="search" />
      </form>
      {q && (
        <>
          <TrackView name="search" props={{ q: q.toLowerCase(), results: results.length }} />
          <SearchPixel q={q} />
        </>
      )}
      {q && results.length > 0 && (
        <>
          <h1 className="mb-5 text-sm text-muted">{t.search.results(results.length, q)}</h1>
          <ProductGrid products={results} lang={lang} priorityFirst={4} />
        </>
      )}
      {q && results.length === 0 && (
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <h1 className="font-display text-2xl">{t.search.none(q)}</h1>
          <p className="max-w-sm text-sm text-muted">{t.search.noneHelp}</p>
          {settings.contact.whatsapp && (
            <a
              href={`https://wa.me/216${settings.contact.whatsapp}?text=${encodeURIComponent(lang === "ar" ? `السلام، نلوّج على: ${q}` : `Bonjour, je cherche : ${q}`)}`}
              target="_blank"
              rel="noopener"
              className="inline-flex h-12 items-center gap-2 rounded-full bg-[#1f9d55] px-5 font-medium text-white"
            >
              <IconWhatsApp /> WhatsApp
            </a>
          )}
          <Link href={href(lang, "/boutique")} className="text-sm text-sea underline underline-offset-2">
            {t.home.shopNow}
          </Link>
        </div>
      )}
    </div>
  );
}
