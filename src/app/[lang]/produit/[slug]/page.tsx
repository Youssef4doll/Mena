import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { dict, href, isLang, languages, pick } from "@/i18n";
import { getProduct } from "@/lib/catalog";
import { getSettings } from "@/lib/settings";
import { publicSettings } from "@/lib/settings-schema";
import { ProductView } from "@/components/shop/ProductView";
import { ProductGrid } from "@/components/shop/ProductCard";
import { JsonLd, breadcrumbLd, productLd } from "@/lib/seo";
import { SITE_URL } from "@/lib/site";
import { formatTND } from "@/lib/money";
import { leadOffer } from "@/lib/offer-display";

export const revalidate = 60;

export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: PageProps<"/[lang]/produit/[slug]">): Promise<Metadata> {
  const { lang, slug } = await params;
  const p = await getProduct(slug);
  if (!p || !isLang(lang)) return {};
  const name = pick(lang, p.name, p.nameAr);
  const desc = (pick(lang, p.summary, p.summaryAr) || pick(lang, p.description, p.descriptionAr)).slice(0, 155) || `${name} — ${formatTND(leadOffer(p.offers)?.price ?? p.price, lang)}`;
  const path = `/produit/${p.slug}`;
  return {
    title: name,
    description: desc,
    alternates: { canonical: href(lang, path), languages: languages(path) },
    openGraph: { title: name, description: desc, type: "website", images: p.images[0] ? [{ url: `/api/img/${p.images[0].id}/1080`, width: 1080 }] : [] },
  };
}

export default async function ProductPageRoute({ params }: PageProps<"/[lang]/produit/[slug]">) {
  const { lang, slug } = await params;
  if (!isLang(lang)) notFound();
  const [p, settings] = await Promise.all([getProduct(slug), getSettings()]);
  if (!p) notFound();
  const t = dict(lang);
  const url = `${SITE_URL}${href(lang, `/produit/${p.slug}`)}`;
  const { related, ...product } = p;

  return (
    <>
      <JsonLd data={productLd(p, settings, url)} />
      <JsonLd
        data={breadcrumbLd([
          { name: t.nav.home, url: `${SITE_URL}${href(lang, "/")}` },
          ...(p.category ? [{ name: pick(lang, p.category.name, p.category.nameAr), url: `${SITE_URL}${href(lang, `/categorie/${p.category.slug}`)}` }] : []),
          { name: pick(lang, p.name, p.nameAr), url },
        ])}
      />
      <nav className="mx-auto hidden max-w-6xl px-4 pt-5 text-sm text-muted md:block" aria-label="breadcrumb">
        <Link href={href(lang, "/")}>{t.nav.home}</Link>
        {p.category && (
          <>
            {" / "}
            <Link href={href(lang, `/categorie/${p.category.slug}`)}>{pick(lang, p.category.name, p.category.nameAr)}</Link>
          </>
        )}
      </nav>
      <ProductView p={product} lang={lang} settings={publicSettings(settings)} url={url} />
      {related.length > 0 && (
        <section className="mx-auto max-w-6xl px-4">
          <h2 className="mb-4 text-[24px] font-bold leading-tight">{t.product.related}</h2>
          <ProductGrid products={related.slice(0, 8)} lang={lang} />
        </section>
      )}
    </>
  );
}
