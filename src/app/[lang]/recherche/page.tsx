import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { dict, href, isLang, pick } from "@/i18n";
import { getCategories, getHome, searchProducts } from "@/lib/catalog";
import { getSettings } from "@/lib/settings";
import { ProductGrid } from "@/components/shop/ProductCard";
import { TrackView } from "@/components/shop/TrackView";
import { SearchPixel } from "@/components/shop/SearchPixel";
import { ContactLink } from "@/components/shop/ContactLink";
import { IconWhatsApp } from "@/components/shop/Icons";

const query = (raw: string | string[] | undefined) => (Array.isArray(raw) ? raw[0] : (raw ?? "")).trim().slice(0, 80);

/** Its own tab title (history, analytics), never indexed. */
export async function generateMetadata({ params, searchParams }: PageProps<"/[lang]/recherche">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang)) return {};
  const q = query((await searchParams).q);
  const t = dict(lang);
  return { title: q ? `${q} · ${t.search.title}` : t.search.title, robots: { index: false, follow: true } };
}

export default async function SearchRoute({ params, searchParams }: PageProps<"/[lang]/recherche">) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const t = dict(lang);
  const q = query((await searchParams).q);
  const [{ products: results, corrected, relaxed }, settings] = await Promise.all([searchProducts(q), getSettings()]);
  // Nothing found, or nothing asked: the shop's own products and categories, so the visit does not end here.
  const empty = results.length === 0;
  const [home, cats] = empty ? await Promise.all([getHome(), getCategories()]) : [null, []];
  const discover = home ? (home.featured.length ? home.featured : home.newest).slice(0, 8) : [];

  return (
    <div className="mx-auto max-w-6xl xl:max-w-7xl 2xl:max-w-[90rem] px-4 pt-6">
      {q && (
        <>
          <TrackView name="search" props={{ q: q.toLowerCase(), results: results.length, corrected: Boolean(corrected), relaxed: Boolean(relaxed) }} />
          <SearchPixel q={q} />
        </>
      )}
      {q && !empty && (
        <>
          {/* A word was corrected, or only one word was found: the customer sees what was searched instead, like Google. */}
          {relaxed ? (
            <>
              <h1 className="text-[22px] font-bold leading-snug md:text-[26px]">{t.search.relaxed(relaxed)}</h1>
              <p className="mb-4 mt-1 text-[16px] text-muted">{t.search.notExact(q)}</p>
            </>
          ) : (
            <>
              <h1 className="text-[22px] font-bold leading-snug md:text-[26px]">{t.search.results(results.length, corrected ?? q)}</h1>
              {corrected ? <p className="mb-4 mt-1 text-[16px] text-muted">{t.search.typed(q)}</p> : <div className="mb-4" />}
            </>
          )}
          <ProductGrid products={results} lang={lang} priorityFirst={4} list="search" q={q} />
        </>
      )}
      {empty && (
        <>
          {q && (
            <div className="flex flex-col items-center gap-4 pb-8 pt-10 text-center">
              <h1 className="text-[22px] font-bold">{t.search.none(q)}</h1>
              <p className="max-w-sm text-[17px] text-ink-2">{t.search.noneHelp}</p>
              {settings.contact.whatsapp && (
                <ContactLink
                  kind="whatsapp"
                  where="search_none"
                  href={`https://wa.me/216${settings.contact.whatsapp}?text=${encodeURIComponent(lang === "ar" ? `السلام، نلوّج على: ${q}` : `Bonjour, je cherche : ${q}`)}`}
                  className="inline-flex min-h-12 items-center gap-2 rounded-full bg-wa px-6 text-[17px] font-bold text-white"
                >
                  <IconWhatsApp /> WhatsApp
                </ContactLink>
              )}
            </div>
          )}
          {!q && <h1 className="mb-4 text-[22px] font-bold md:text-[26px]">{t.search.title}</h1>}
          {cats.length > 0 && (
            <nav aria-label={t.search.categories} className="mb-8 flex flex-wrap gap-2">
              {cats.map((c) => (
                <Link key={c.slug} href={href(lang, `/categorie/${c.slug}`)} className="flex h-11 items-center rounded-full border border-line px-4 text-[16px] text-ink hover:border-field">
                  {pick(lang, c.name, c.nameAr)}
                </Link>
              ))}
            </nav>
          )}
          {discover.length > 0 && (
            <section aria-labelledby="discover-title" className="border-t border-line pt-8">
              <h2 id="discover-title" className="mb-4 text-[20px] font-bold">
                {t.search.discover}
              </h2>
              <ProductGrid products={discover} lang={lang} list="search_none" />
            </section>
          )}
        </>
      )}
    </div>
  );
}
