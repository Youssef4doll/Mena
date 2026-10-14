import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { dict, href, isLang, languages, pick } from "@/i18n";
import { getProduct, productMovedTo } from "@/lib/catalog";
import { getSettings } from "@/lib/settings";
import { publicSettings } from "@/lib/settings-schema";
import { ProductView } from "@/components/shop/ProductView";
import { ProductRow } from "@/components/shop/ProductCard";
import { JsonLd, breadcrumbLd, productDescription, productLd, productTitle } from "@/lib/seo";
import { SITE_URL } from "@/lib/site";
import { leadOffer } from "@/lib/offer-display";
import { deliversEverywhere } from "@/lib/governorates";

export const revalidate = 60;

export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: PageProps<"/[lang]/produit/[slug]">): Promise<Metadata> {
  const { lang, slug } = await params;
  const [p, settings] = await Promise.all([getProduct(slug), getSettings()]);
  if (!p || !isLang(lang)) return {};
  const title = productTitle(p, lang);
  const description = productDescription(p, lang, deliversEverywhere(settings.delivery.zones));
  const path = `/produit/${p.slug}`;
  return {
    title,
    description,
    alternates: { canonical: href(lang, path), languages: languages(path) },
    openGraph: {
      title,
      description,
      type: "website",
      locale: lang === "ar" ? "ar_TN" : "fr_TN",
      url: href(lang, path),
      images: p.images.slice(0, 4).map((i) => ({ url: `/api/img/${i.id}/1080`, width: 1080, height: Math.round((1080 * i.height) / Math.max(1, i.width)), alt: i.alt ?? pick(lang, p.name, p.nameAr) })),
    },
  };
}

export default async function ProductPageRoute({ params }: PageProps<"/[lang]/produit/[slug]">) {
  const { lang, slug } = await params;
  if (!isLang(lang)) notFound();
  const [p, settings] = await Promise.all([getProduct(slug), getSettings()]);
  if (!p) {
    // Renamed: the old address leads to the new one, for good (Google moves its result over).
    const moved = await productMovedTo(slug);
    if (moved) permanentRedirect(href(lang, `/produit/${moved}`));
    notFound();
  }
  const t = dict(lang);
  const url = `${SITE_URL}${href(lang, `/produit/${p.slug}`)}`;
  const { related, ...product } = p;

  return (
    <>
      {/* What Facebook, WhatsApp and Pinterest show with a shared link: the real price (React puts these in <head>). */}
      <meta property="product:price:amount" content={((leadOffer(p.offers)?.price ?? Math.min(p.price, ...p.variants.map((v) => v.price))) / 1000).toFixed(3)} />
      <meta property="product:price:currency" content="TND" />
      <meta property="product:availability" content={p.stock.kind === "out" ? "out of stock" : "in stock"} />
      <JsonLd data={productLd(p, settings, url, lang)} />
      <JsonLd
        data={breadcrumbLd([
          { name: t.nav.home, url: `${SITE_URL}${href(lang, "/")}` },
          ...(p.category ? [{ name: pick(lang, p.category.name, p.category.nameAr), url: `${SITE_URL}${href(lang, `/categorie/${p.category.slug}`)}` }] : []),
          { name: pick(lang, p.name, p.nameAr), url },
        ])}
      />
      {/* The page itself on white, like the shops customers know; the suggestions under it on the shop's light grey. */}
      <div className="bg-white">
        <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-1.5 px-4 py-1 text-[15px] text-muted md:pt-4" aria-label="breadcrumb">
          <Link href={href(lang, "/")} className="flex min-h-10 items-center hover:text-ink">
            {t.nav.home}
          </Link>
          {p.category && (
            <>
              <span aria-hidden>/</span>
              <Link href={href(lang, `/categorie/${p.category.slug}`)} className="flex min-h-10 items-center hover:text-ink">
                {pick(lang, p.category.name, p.category.nameAr)}
              </Link>
            </>
          )}
        </nav>
        <ProductView p={product} lang={lang} settings={publicSettings(settings)} url={url} />
        {/* Quiet suggestions: pictures, names and prices, no more buy buttons beside the order bar. */}
        {related.length >= 2 && (
          <section className="mx-auto max-w-6xl border-t border-line px-4 pb-4 pt-8" aria-labelledby="related-title">
            <h2 id="related-title" className="mb-4 text-[20px] font-bold">
              {t.product.related}
            </h2>
            <ProductRow products={related.slice(0, 8)} lang={lang} compact />
          </section>
        )}
      </div>
    </>
  );
}
