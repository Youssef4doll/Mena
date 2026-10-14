import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { dict, href, isLang, languages, pick } from "@/i18n";
import { getHome, getHomeCategories } from "@/lib/catalog";
import { getSettings } from "@/lib/settings";
import { governorateLabel } from "@/lib/governorates";
import { ProductRow } from "@/components/shop/ProductCard";
import { Stars } from "@/components/shop/Stars";
import { Img, Placeholder } from "@/components/shop/Img";
import { IconChevron, IconReturn, IconShield } from "@/components/shop/Icons";
import { JsonLd, organizationLd, websiteLd } from "@/lib/seo";

export const revalidate = 60;

export async function generateMetadata({ params }: PageProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  return isLang(lang) ? { alternates: { canonical: href(lang, "/"), languages: languages("/") } } : {};
}

/**
 * A calm home page: one line of welcome, the categories as pictures, then
 * shelves of products, and at the end how ordering works. Each fact is said
 * once; the bar at the top already says how one pays and what delivery costs.
 */
export default async function Home({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const t = dict(lang);
  const [settings, home, cats] = await Promise.all([getSettings(), getHome(), getHomeCategories()]);
  const hero = settings.hero;
  const empty = home.newest.length === 0;
  const shown = cats.slice(0, 6);
  // "New" only when it is not the same products again.
  const best = home.bestsellers.length >= 4 ? home.bestsellers.slice(0, 8) : [];
  const seen = new Set([...home.featured, ...best].map((p) => p.id));
  const fresh = home.newest.filter((p) => !seen.has(p.id));

  return (
    <>
      <JsonLd data={organizationLd(settings)} />
      <JsonLd data={websiteLd(settings, lang)} />

      {/* ------------------------------------------- welcome, one line */}
      <section className="mx-auto max-w-6xl px-4 pb-5 pt-5 md:pb-6 md:pt-8">
        <h1 className="text-[22px] font-bold leading-snug text-ink sm:text-[28px]">{pick(lang, hero.title, hero.titleAr)}</h1>
        {hero.imageId && (
          <div className="relative mt-4 aspect-[16/7] w-full overflow-hidden rounded-2xl md:aspect-[21/6]">
            <Img image={{ id: hero.imageId, blur: null, width: 1600, height: 700 }} alt="" sizes="(min-width: 1152px) 1120px, 100vw" priority />
          </div>
        )}
      </section>

      {empty && <p className="mx-auto max-w-6xl px-4 py-16 text-center text-[18px] text-muted">{t.home.empty}</p>}

      {/* ---------------- the categories: a picture and the same short name as in the menu */}
      {shown.length > 0 && (
        <section className="mx-auto max-w-6xl px-4" aria-label={t.home.categories}>
          <ul className={`grid grid-cols-3 gap-x-3 gap-y-5 ${["md:grid-cols-4", "md:grid-cols-5", "md:grid-cols-6"][Math.max(0, Math.min(shown.length, 6) - 4)]}`}>
            {shown.map((c, i) => {
              const image = c.imageId ?? c.products[0]?.images[0]?.id ?? null;
              return (
                <li key={c.slug}>
                  <Link href={href(lang, `/categorie/${c.slug}`)} className="group flex flex-col items-center gap-2 rounded-2xl text-center">
                    <span className="relative aspect-square w-full overflow-hidden rounded-2xl border border-line bg-sand">
                      {image ? <Img image={{ id: image, blur: null, width: 600, height: 600 }} alt="" sizes="(min-width: 768px) 18vw, 31vw" className="transition duration-500 group-hover:scale-[1.03]" priority={i < 3} /> : <Placeholder />}
                    </span>
                    <span className="text-[16px] font-bold leading-snug text-ink">{pick(lang, c.name, c.nameAr)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* --------------------------------------------------- shelves */}
      {home.featured.length > 0 && (
        <Shelf title={t.home.featured} link={{ href: href(lang, "/boutique"), label: t.home.seeMore }}>
          <ProductRow products={home.featured} lang={lang} />
        </Shelf>
      )}
      {/* "Most ordered" only when at least four products really sold. */}
      {best.length > 0 && (
        <Shelf title={t.home.bestsellers} link={{ href: href(lang, "/boutique?tri=popular"), label: t.home.seeMore }}>
          <ProductRow products={best} lang={lang} />
        </Shelf>
      )}
      {fresh.length >= 4 && (
        <Shelf title={t.home.newest} link={{ href: href(lang, "/boutique"), label: t.home.seeMore }}>
          <ProductRow products={fresh} lang={lang} />
        </Shelf>
      )}

      {/* ------------------------------------- reviews (real buyers only) */}
      {home.reviews.length > 0 && (
        <Shelf title={t.home.reviews}>
          <div className="-mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 no-scrollbar md:mx-0 md:grid md:scroll-px-0 md:grid-cols-3 md:overflow-visible md:px-0">
            {home.reviews.map((r) => (
              <figure key={r.id} className="w-[82%] shrink-0 snap-start rounded-2xl border border-line bg-white p-5 sm:w-80 md:w-auto">
                <Stars value={r.rating} size={18} />
                <blockquote className="mt-3 line-clamp-5 text-[17px] leading-relaxed text-ink-2">{r.text}</blockquote>
                <figcaption className="mt-4 text-[15px] text-muted">
                  <span className="font-bold text-ink">{r.authorName}</span>
                  {r.governorate && ` · ${governorateLabel(r.governorate, lang)}`}
                  {" · "}
                  <Link href={href(lang, `/produit/${r.product.slug}`)} className="underline underline-offset-2">
                    {pick(lang, r.product.name, r.product.nameAr)}
                  </Link>
                </figcaption>
              </figure>
            ))}
          </div>
        </Shelf>
      )}

      {/* --------------------------------------------- how to order, once, at the end */}
      <section className="mx-auto mt-14 max-w-6xl px-4">
        <h2 className="text-[22px] font-bold leading-tight text-ink md:text-[26px]">{t.home.howTitle}</h2>
        <ol className="mt-5 grid gap-4 sm:grid-cols-3">
          {t.home.how.map((step, i) => (
            <li key={step} className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-field text-[17px] font-bold text-ink ltr-nums">{i + 1}</span>
              <span className="text-[17px] leading-snug text-ink">{step}</span>
            </li>
          ))}
        </ol>
        <ul className="mt-6 flex flex-wrap gap-2">
          {settings.delivery.openBeforePaying && (
            <li className="inline-flex min-h-10 items-center gap-2 rounded-full bg-sand px-4 text-[15px] text-ink-2">
              <IconShield className="h-5 w-5 text-sea" />
              {t.trust.openBeforePaying}
            </li>
          )}
          <li className="inline-flex min-h-10 items-center gap-2 rounded-full bg-sand px-4 text-[15px] text-ink-2">
            <IconReturn className="h-5 w-5 text-sea" />
            {t.trust.returns(settings.returns.days)}
          </li>
        </ul>
      </section>
    </>
  );
}

function Shelf({ title, link, children }: { title: string; link?: { href: string; label: string }; children: React.ReactNode }) {
  return (
    <section className="mx-auto mt-12 max-w-6xl px-4 md:mt-16">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-[22px] font-bold leading-tight text-ink md:text-[26px]">{title}</h2>
        {link && (
          <Link href={link.href} className="-me-2 flex min-h-11 shrink-0 items-center gap-1 rounded-full px-2 text-[16px] font-bold text-sea-2 underline-offset-4 hover:underline">
            {link.label}
            <IconChevron className="h-5 w-5" />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}
