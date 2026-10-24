import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { dict, href, isLang, languages, pick } from "@/i18n";
import { categoryMovedTo, getCategoryPage, getShop } from "@/lib/catalog";
import { Listing, parseSort } from "@/components/shop/Listing";
import { ProductRow } from "@/components/shop/ProductCard";
import { TrackView } from "@/components/shop/TrackView";
import { getSettings } from "@/lib/settings";
import { JsonLd, itemListLd, listDescription } from "@/lib/seo";

export async function generateMetadata({ params }: PageProps<"/[lang]/categorie/[slug]">): Promise<Metadata> {
  const { lang, slug } = await params;
  const page = await getCategoryPage(slug, "new");
  if (!page || !isLang(lang)) return {};
  const path = `/categorie/${slug}`;
  const title = pick(lang, page.category.name, page.category.nameAr);
  return {
    title,
    description: listDescription(title, page.products, lang, await getSettings()),
    alternates: { canonical: href(lang, path), languages: languages(path) },
    // An empty category is not a page to send people to from Google.
    ...(page.products.length === 0 ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function CategoryRoute({ params, searchParams }: PageProps<"/[lang]/categorie/[slug]">) {
  const { lang, slug } = await params;
  if (!isLang(lang)) notFound();
  const sort = parseSort((await searchParams).tri);
  const page = await getCategoryPage(slug, sort);
  if (!page) {
    // Renamed: the old address leads to the new one, for good.
    const moved = await categoryMovedTo(slug);
    if (moved) permanentRedirect(href(lang, `/categorie/${moved}`));
    notFound();
  }
  // A small category does not end the visit after one card: the rest of the shop follows.
  const ids = new Set(page.products.map((p) => p.id));
  const others = page.products.length < 4 ? (await getShop("new")).filter((p) => !ids.has(p.id)).slice(0, 8) : [];
  return (
    <>
      <TrackView name="category_viewed" props={{ slug }} />
      <JsonLd data={itemListLd(page.products, lang)} />
      <Listing lang={lang} title={pick(lang, page.category.name, page.category.nameAr)} path={`/categorie/${slug}`} sort={sort} products={page.products} emptyText={dict(lang).category.empty} banner={{ image: page.category.imageId ?? page.products[0]?.images[0]?.id ?? null, line: pick(lang, page.category.headline ?? "", page.category.headlineAr ?? "") || null }} />
      {others.length >= 2 && (
        <section className="mx-auto max-w-6xl border-t border-line px-4 pt-8" aria-labelledby="others-title">
          <h2 id="others-title" className="mb-4 text-[20px] font-bold">
            {dict(lang).category.others}
          </h2>
          <ProductRow products={others} lang={lang} list="category_others" />
        </section>
      )}
    </>
  );
}
