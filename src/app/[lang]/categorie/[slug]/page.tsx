import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { dict, href, isLang, languages, pick } from "@/i18n";
import { getCategoryPage } from "@/lib/catalog";
import { Listing, parseSort } from "@/components/shop/Listing";
import { TrackView } from "@/components/shop/TrackView";
import { getSettings } from "@/lib/settings";
import { JsonLd, itemListLd, listDescription } from "@/lib/seo";

export async function generateMetadata({ params }: PageProps<"/[lang]/categorie/[slug]">): Promise<Metadata> {
  const { lang, slug } = await params;
  const page = await getCategoryPage(slug, "new");
  if (!page || !isLang(lang)) return {};
  const path = `/categorie/${slug}`;
  const title = pick(lang, page.category.name, page.category.nameAr);
  return { title, description: listDescription(title, page.products, lang, await getSettings()), alternates: { canonical: href(lang, path), languages: languages(path) } };
}

export default async function CategoryRoute({ params, searchParams }: PageProps<"/[lang]/categorie/[slug]">) {
  const { lang, slug } = await params;
  if (!isLang(lang)) notFound();
  const sort = parseSort((await searchParams).tri);
  const page = await getCategoryPage(slug, sort);
  if (!page) notFound();
  return (
    <>
      <TrackView name="category_viewed" props={{ slug }} />
      <JsonLd data={itemListLd(page.products, lang)} />
      <Listing lang={lang} title={pick(lang, page.category.name, page.category.nameAr)} path={`/categorie/${slug}`} sort={sort} products={page.products} emptyText={dict(lang).category.empty} />
    </>
  );
}
