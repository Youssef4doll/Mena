import Link from "next/link";
import { notFound } from "next/navigation";
import { dict, href, isLang, pick } from "@/i18n";
import { getCategories, getHome } from "@/lib/catalog";
import { getSettings } from "@/lib/settings";
import { ProductGrid } from "@/components/shop/ProductCard";
import { TrustBar } from "@/components/shop/TrustBar";
import { Stars } from "@/components/shop/Stars";
import { Img } from "@/components/shop/Img";
import { IconChevron } from "@/components/shop/Icons";
import { governorateLabel } from "@/lib/governorates";
import { JsonLd, organizationLd } from "@/lib/seo";

export const revalidate = 60;

export default async function Home({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const t = dict(lang);
  const [settings, home, categories] = await Promise.all([getSettings(), getHome(), getCategories()]);
  const hero = settings.hero;
  const lead = home.featured.length > 0 ? home.featured : home.newest;
  const empty = home.newest.length === 0;

  return (
    <>
      <JsonLd data={organizationLd(settings)} />
      {/* ------------------------------------------------------------ hero */}
      <section className="relative overflow-hidden">
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 pb-10 pt-8 md:grid-cols-2 md:pb-16 md:pt-14">
          <div className="flex flex-col items-start gap-5">
            <span className="rounded-full border border-line bg-white/70 px-3 py-1 text-[12px] font-medium text-sea">{t.trust.cod}</span>
            <h1 className="font-display text-[40px] font-medium leading-[1.04] tracking-tight text-ink sm:text-[52px]">{pick(lang, hero.title, hero.titleAr)}</h1>
            <p className="max-w-md text-[15px] leading-relaxed text-muted">{pick(lang, hero.subtitle, hero.subtitleAr)}</p>
            <div className="flex flex-wrap gap-3">
              <Link href={href(lang, "/boutique")} className="inline-flex h-12 items-center gap-2 rounded-full bg-sea px-6 text-[15px] font-semibold text-white shadow-soft transition active:scale-[.98]">
                {t.home.shopNow}
                <IconChevron />
              </Link>
            </div>
          </div>
          <div className="relative mx-auto aspect-[4/5] w-full max-w-[420px]">
            <div className="arch absolute inset-0 overflow-hidden bg-sand">
              {hero.imageId ? (
                <Img image={{ id: hero.imageId, blur: null, width: 1200, height: 1500 }} alt="" sizes="(min-width: 768px) 420px, 90vw" priority />
              ) : lead[0]?.images[0] ? (
                <Img image={lead[0].images[0]} alt={pick(lang, lead[0].name, lead[0].nameAr)} sizes="(min-width: 768px) 420px, 90vw" priority />
              ) : (
                <HeroPattern />
              )}
            </div>
            <div className="arch absolute -inset-3 -z-10 border border-line" aria-hidden />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4">
        <TrustBar lang={lang} returnDays={settings.returns.days} whatsapp={Boolean(settings.contact.whatsapp)} />
      </section>

      {empty && <p className="mx-auto max-w-6xl px-4 py-16 text-center text-muted">{t.home.empty}</p>}

      {/* ------------------------------------------------------ categories */}
      {categories.length > 1 && (
        <section className="mx-auto mt-14 max-w-6xl px-4">
          <SectionTitle title={t.home.categories} />
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 no-scrollbar">
            {categories.map((c) => (
              <Link key={c.slug} href={href(lang, `/categorie/${c.slug}`)} className="group flex w-[42%] shrink-0 flex-col gap-2 sm:w-44">
                <span className="arch relative block aspect-[4/5] overflow-hidden bg-sand">
                  {c.imageId ? <Img image={{ id: c.imageId, blur: null, width: 800, height: 1000 }} alt="" sizes="180px" className="transition duration-500 group-hover:scale-105" /> : <HeroPattern small />}
                </span>
                <span className="text-center text-sm font-medium text-ink">{pick(lang, c.name, c.nameAr)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* --------------------------------------------------------- products */}
      {home.featured.length > 0 && (
        <section className="mx-auto mt-14 max-w-6xl px-4">
          <SectionTitle title={t.home.featured} link={{ href: href(lang, "/boutique"), label: t.home.shopNow }} />
          <ProductGrid products={home.featured} lang={lang} priorityFirst={2} />
        </section>
      )}

      {home.bestsellers.length > 0 && (
        <section className="mx-auto mt-14 max-w-6xl px-4">
          <SectionTitle title={t.home.bestsellers} sub={t.home.bestsellersSub} />
          <ProductGrid products={home.bestsellers.slice(0, 8)} lang={lang} />
        </section>
      )}

      {home.newest.length > 0 && (
        <section className="mx-auto mt-14 max-w-6xl px-4">
          <SectionTitle title={t.home.newest} link={{ href: href(lang, "/boutique"), label: t.home.shopNow }} />
          <ProductGrid products={home.newest} lang={lang} priorityFirst={home.featured.length ? 0 : 2} />
        </section>
      )}

      {/* ------------------------------------------------------ how it works */}
      <section className="mx-auto mt-16 max-w-6xl px-4">
        <div className="rounded-[28px] bg-ink px-6 py-10 text-white sm:px-10">
          <h2 className="font-display text-[28px] leading-tight">{t.home.howTitle}</h2>
          <ol className="mt-6 grid gap-6 sm:grid-cols-3">
            {t.home.how.map(([title, sub], i) => (
              <li key={title} className="flex gap-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 font-display text-lg ltr-nums">{i + 1}</span>
                <span>
                  <span className="block font-semibold">{title}</span>
                  <span className="mt-1 block text-sm leading-relaxed text-white/70">{sub}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* --------------------------------------------- reviews (real only) */}
      {home.reviews.length > 0 && (
        <section className="mx-auto mt-16 max-w-6xl px-4">
          <SectionTitle title={t.home.reviews} sub={t.home.reviewsSub} />
          <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 no-scrollbar">
            {home.reviews.map((r) => (
              <figure key={r.id} className="w-[80%] shrink-0 snap-start rounded-2xl border border-line bg-white p-5 sm:w-80">
                <Stars value={r.rating} />
                <blockquote className="mt-3 line-clamp-5 text-[14px] leading-relaxed text-ink-2">{r.text}</blockquote>
                <figcaption className="mt-4 text-xs text-muted">
                  <span className="font-semibold text-ink">{r.authorName}</span>
                  {r.governorate && ` · ${governorateLabel(r.governorate, lang)}`}
                  {" · "}
                  <Link href={href(lang, `/produit/${r.product.slug}`)} className="underline underline-offset-2">
                    {pick(lang, r.product.name, r.product.nameAr)}
                  </Link>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function SectionTitle({ title, sub, link }: { title: string; sub?: string; link?: { href: string; label: string } }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        <h2 className="font-display text-[26px] leading-tight text-ink">{title}</h2>
        {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
      </div>
      {link && (
        <Link href={link.href} className="flex shrink-0 items-center gap-1 text-sm font-medium text-sea">
          {link.label}
          <IconChevron />
        </Link>
      )}
    </div>
  );
}

/** A zellige-like pattern for when there is no picture yet. */
function HeroPattern({ small = false }: { small?: boolean }) {
  return (
    <svg className="absolute inset-0 h-full w-full" aria-hidden>
      <defs>
        <pattern id={small ? "zs" : "zl"} width={small ? 28 : 48} height={small ? 28 : 48} patternUnits="userSpaceOnUse">
          <rect width="100%" height="100%" fill="var(--color-sand)" />
          <path d={small ? "M14 2 26 14 14 26 2 14Z" : "M24 4 44 24 24 44 4 24Z"} fill="none" stroke="var(--color-sea)" strokeOpacity=".18" strokeWidth="1.5" />
          <circle cx={small ? 14 : 24} cy={small ? 14 : 24} r={small ? 2.5 : 4} fill="var(--color-clay)" fillOpacity=".35" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${small ? "zs" : "zl"})`} />
    </svg>
  );
}
