import Link from "next/link";
import { notFound } from "next/navigation";
import { dict, href, isLang, pick, type Lang } from "@/i18n";
import { getHome, getHomeCategories } from "@/lib/catalog";
import { getSettings } from "@/lib/settings";
import { formatTND } from "@/lib/money";
import { governorateLabel } from "@/lib/governorates";
import { ProductRow } from "@/components/shop/ProductCard";
import { TrustBar } from "@/components/shop/TrustBar";
import { Stars } from "@/components/shop/Stars";
import { Img, Placeholder } from "@/components/shop/Img";
import { IconChevron } from "@/components/shop/Icons";
import { JsonLd, organizationLd } from "@/lib/seo";

export const revalidate = 60;

/** Soft card backgrounds, in order: one per category, never a colour that shouts. */
const TINTS = ["bg-tint-1", "bg-tint-2", "bg-tint-3", "bg-tint-4", "bg-tint-5", "bg-tint-6"];

/**
 * Laid out like Amazon's home page, which most shoppers already know how to
 * read: big category cards first, then "four products per card" boxes, then
 * shelves of products. Calm colours, large type, every card one tap.
 */
export default async function Home({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const t = dict(lang);
  const [settings, home, cats] = await Promise.all([getSettings(), getHome(), getHomeCategories()]);
  const hero = settings.hero;
  const empty = home.newest.length === 0;

  return (
    <>
      <JsonLd data={organizationLd(settings)} />

      {/* ---------------------------------------------------- welcome */}
      <section className="bg-gradient-to-b from-sea-soft to-cream">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 pb-6 pt-6 md:flex-row md:items-center md:gap-10 md:pb-10 md:pt-10">
          <div className="flex flex-1 flex-col items-start gap-3">
            <h1 className="text-[30px] font-bold leading-tight text-ink sm:text-[40px]">{pick(lang, hero.title, hero.titleAr)}</h1>
            <p className="max-w-xl text-[18px] leading-relaxed text-ink-2">{pick(lang, hero.subtitle, hero.subtitleAr)}</p>
          </div>
          {hero.imageId && (
            <div className="relative aspect-[16/9] w-full overflow-hidden rounded-3xl md:w-[45%]">
              <Img image={{ id: hero.imageId, blur: null, width: 1600, height: 900 }} alt="" sizes="(min-width: 768px) 45vw, 100vw" priority />
            </div>
          )}
        </div>
      </section>

      {empty && <p className="mx-auto max-w-6xl px-4 py-16 text-center text-[18px] text-muted">{t.home.empty}</p>}

      {/* ------------------------------------------ big category cards */}
      {cats.length > 0 && (
        <section className="mx-auto max-w-6xl px-4" aria-label={t.home.categories}>
          <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 no-scrollbar md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:px-0">
            {cats.slice(0, 8).map((c, i) => {
              const image = c.imageId ?? c.products[0]?.images[0]?.id ?? null;
              return (
                <Link
                  key={c.slug}
                  href={href(lang, `/categorie/${c.slug}`)}
                  className={`group flex w-[72%] shrink-0 snap-start flex-col overflow-hidden rounded-3xl sm:w-[44%] md:w-auto ${TINTS[i % TINTS.length]}`}
                >
                  <span className="px-4 pb-2 pt-4 text-[22px] font-bold leading-tight text-ink">{pick(lang, c.headline || c.name, c.headlineAr || c.nameAr)}</span>
                  <span className="relative mx-4 mb-4 aspect-[4/3] overflow-hidden rounded-2xl bg-white/60">
                    {image ? <Img image={{ id: image, blur: null, width: 800, height: 600 }} alt="" sizes="(min-width: 1024px) 25vw, 72vw" className="transition duration-500 group-hover:scale-[1.03]" priority={i < 2} /> : <Placeholder />}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <section className="mx-auto mt-6 max-w-6xl px-4">
        <TrustBar lang={lang} returnDays={settings.returns.days} whatsapp={Boolean(settings.contact.whatsapp)} />
      </section>

      {/* --------------------------------------- four products per card */}
      {cats.length > 0 && (
        <section className="mx-auto mt-8 grid max-w-6xl gap-4 px-4 sm:grid-cols-2 lg:grid-cols-4">
          {cats.map((c) => (
            <CategoryBox key={c.slug} c={c} lang={lang} />
          ))}
        </section>
      )}

      {/* --------------------------------------------------- shelves */}
      {home.featured.length > 0 && (
        <Shelf title={t.home.featured} link={{ href: href(lang, "/boutique"), label: t.home.shopNow }}>
          <ProductRow products={home.featured} lang={lang} />
        </Shelf>
      )}
      {/* "Most ordered" only when at least four products really sold. */}
      {home.bestsellers.length >= 4 && (
        <Shelf title={t.home.bestsellers} sub={t.home.bestsellersSub}>
          <ProductRow products={home.bestsellers.slice(0, 8)} lang={lang} />
        </Shelf>
      )}
      {home.newest.length > 0 && (
        <Shelf title={t.home.newest} link={{ href: href(lang, "/boutique"), label: t.home.shopNow }}>
          <ProductRow products={home.newest} lang={lang} />
        </Shelf>
      )}

      {/* --------------------------------------------- how to order */}
      <section className="mx-auto mt-10 max-w-6xl px-4">
        <div className="rounded-3xl border border-line bg-white px-5 py-7 sm:px-8">
          <h2 className="text-[24px] font-bold leading-tight text-ink">{t.home.howTitle}</h2>
          <ol className="mt-5 grid gap-5 sm:grid-cols-3">
            {t.home.how.map(([title, sub], i) => (
              <li key={title} className="flex gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sea text-[20px] font-bold text-white ltr-nums">{i + 1}</span>
                <span>
                  <span className="block text-[18px] font-bold text-ink">{title}</span>
                  <span className="mt-1 block text-[16px] leading-relaxed text-ink-2">{sub}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ------------------------------------- reviews (real buyers only) */}
      {home.reviews.length > 0 && (
        <Shelf title={t.home.reviews} sub={t.home.reviewsSub}>
          <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 no-scrollbar md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0">
            {home.reviews.map((r) => (
              <figure key={r.id} className="w-[82%] shrink-0 snap-start rounded-2xl border border-line bg-white p-5 sm:w-80 md:w-auto">
                <Stars value={r.rating} size={18} />
                <blockquote className="mt-3 line-clamp-5 text-[17px] leading-relaxed text-ink-2">{r.text}</blockquote>
                <figcaption className="mt-4 text-[14px] text-muted">
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
    </>
  );
}

type HomeCategory = Awaited<ReturnType<typeof getHomeCategories>>[number];

/** Amazon's box: a title, four products with their names and prices, and "see more". */
function CategoryBox({ c, lang }: { c: HomeCategory; lang: Lang }) {
  const t = dict(lang);
  const title = pick(lang, c.headline || c.name, c.headlineAr || c.nameAr);
  return (
    <div className="flex flex-col rounded-3xl border border-line bg-white p-4">
      <Link href={href(lang, `/categorie/${c.slug}`)} className="mb-3 flex items-start justify-between gap-2">
        <h2 className="text-[21px] font-bold leading-tight text-ink">{title}</h2>
        <IconChevron className="mt-1 h-5 w-5 shrink-0 text-muted" />
      </Link>
      <div className="grid grid-cols-2 gap-3">
        {c.products.map((p) => {
          const out = p.stock.kind === "out";
          const note = p.packOf ? t.product.pack(p.packOf) : p.priceFrom ? t.product.from : null;
          return (
            <Link key={p.id} href={href(lang, `/produit/${p.slug}`)} className="flex flex-col gap-1.5" prefetch={false}>
              <span className="relative aspect-square overflow-hidden rounded-xl bg-sand">
                {p.images[0] ? <Img image={{ ...p.images[0], blur: null }} alt="" sizes="(min-width: 1024px) 12vw, 45vw" className={out ? "opacity-60 grayscale" : ""} /> : <Placeholder />}
              </span>
              <span className="line-clamp-2 text-[15px] leading-snug text-ink-2">{pick(lang, p.name, p.nameAr)}</span>
              {out ? (
                <span className="text-[15px] font-bold text-muted">{t.product.out}</span>
              ) : (
                <span className="text-[16px] font-bold text-ink ltr-nums">
                  {note && <span className="me-1 text-[14px] font-normal text-muted">{note}</span>}
                  {formatTND(p.price, lang)}
                </span>
              )}
            </Link>
          );
        })}
      </div>
      <Link href={href(lang, `/categorie/${c.slug}`)} className="mt-auto pt-4 text-[16px] font-bold text-sea underline-offset-4 hover:underline">
        {t.home.seeMore}
      </Link>
    </div>
  );
}

function Shelf({ title, sub, link, children }: { title: string; sub?: string; link?: { href: string; label: string }; children: React.ReactNode }) {
  return (
    <section className="mx-auto mt-10 max-w-6xl px-4">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-[24px] font-bold leading-tight text-ink">{title}</h2>
          {sub && <p className="mt-1 text-[16px] text-muted">{sub}</p>}
        </div>
        {link && (
          <Link href={link.href} className="flex shrink-0 items-center gap-1 text-[16px] font-bold text-sea">
            {link.label}
            <IconChevron className="h-5 w-5" />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}
