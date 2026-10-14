import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { SITE_URL } from "@/lib/site";
import { languages } from "@/i18n";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, categories] = await Promise.all([
    prisma.product.findMany({ where: { active: true }, select: { slug: true, updatedAt: true } }),
    prisma.category.findMany({ where: { active: true }, select: { slug: true } }),
  ]);
  const both = (path: string, lastModified?: Date) => ({
    url: `${SITE_URL}${path}`,
    lastModified,
    alternates: { languages: languages(path, SITE_URL) },
  });
  return [
    both("/"),
    both("/boutique"),
    ...categories.map((c) => both(`/categorie/${c.slug}`)),
    ...products.map((p) => both(`/produit/${p.slug}`, p.updatedAt)),
    both("/livraison-retours"),
  ];
}
