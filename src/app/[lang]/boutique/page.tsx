import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { dict, href, isLang, languages } from "@/i18n";
import { getShop } from "@/lib/catalog";
import { Listing, parseSort } from "@/components/shop/Listing";
import { getSettings } from "@/lib/settings";
import { listDescription } from "@/lib/seo";

export async function generateMetadata({ params }: PageProps<"/[lang]/boutique">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang)) return {};
  const title = dict(lang).nav.shop;
  const [products, settings] = await Promise.all([getShop("new"), getSettings()]);
  return { title, description: listDescription(title, products, lang, settings), alternates: { canonical: href(lang, "/boutique"), languages: languages("/boutique") } };
}

export default async function ShopRoute({ params, searchParams }: PageProps<"/[lang]/boutique">) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const sort = parseSort((await searchParams).tri);
  const products = await getShop(sort);
  return <Listing lang={lang} title={dict(lang).nav.shop} path="/boutique" sort={sort} products={products} emptyText={dict(lang).home.empty} />;
}
