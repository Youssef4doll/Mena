import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { SITE_URL } from "@/lib/site";
import { languages } from "@/i18n";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, categories] = await Promise.all([
    prisma.product.findMany({ where: { active: true }, select: { slug: true, updatedAt: true, images: { where: { kind: "GALLERY" }, orderBy: { sort: "asc" }, take: 8, select: { mediaId: true } } } }),
    // Only categories with something to buy, as the menu shows them.
    prisma.category.findMany({ where: { active: true, products: { some: { active: true } } }, select: { slug: true } }),
  ]);
  const both = (path: string, lastModified?: Date, images?: string[]) => ({
    url: `${SITE_URL}${path}`,
    lastModified,
    alternates: { languages: languages(path, SITE_URL) },
    // Product photos, so they can be found in Google Images too.
    ...(images?.length ? { images } : {}),
  });
  return [
    both("/"),
    both("/boutique"),
    ...categories.map((c) => both(`/categorie/${c.slug}`)),
    ...products.map((p) => both(`/produit/${p.slug}`, p.updatedAt, p.images.map((i) => `${SITE_URL}/api/img/${i.mediaId}/1080`))),
    both("/livraison-retours"),
  ];
}
