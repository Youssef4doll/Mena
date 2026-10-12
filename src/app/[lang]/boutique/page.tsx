import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { dict, isLang } from "@/i18n";
import { getShop } from "@/lib/catalog";
import { Listing, parseSort } from "@/components/shop/Listing";

export async function generateMetadata({ params }: PageProps<"/[lang]/boutique">): Promise<Metadata> {
  const { lang } = await params;
  return { title: isLang(lang) ? dict(lang).nav.shop : "Boutique", alternates: { canonical: lang === "ar" ? "/ar/boutique" : "/boutique" } };
}

export default async function ShopRoute({ params, searchParams }: PageProps<"/[lang]/boutique">) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const sort = parseSort((await searchParams).tri);
  const products = await getShop(sort);
  return <Listing lang={lang} title={dict(lang).nav.shop} path="/boutique" sort={sort} products={products} emptyText={dict(lang).home.empty} />;
}
