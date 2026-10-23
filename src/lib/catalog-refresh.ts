import "server-only";
import { revalidateTag, updateTag } from "next/cache";
import { prisma } from "./prisma";
import { CATALOG_TAG, productTag } from "./catalog";

const EXPIRE_AT_MOST = 50;

/**
 * After the back office changed products (in a Server Action: updateTag only
 * works there). The pages of the products changed are expired, so the owner
 * who opens one next sees the change. Every other page of the shop (the
 * lists, the other products and their suggestions) is only marked stale:
 * customers keep getting it at once while it is rebuilt in the background,
 * instead of each waiting for a rebuild after every change. `slugs`: the
 * addresses of products already deleted. Past a few dozen products (a
 * change to a whole selection), nobody opens each page right away: they are
 * only marked stale, like the rest.
 */
export async function refreshCatalog(productIds: string[] = [], slugs: string[] = []) {
  if (productIds.length + slugs.length <= EXPIRE_AT_MOST) {
    const rows = productIds.length ? await prisma.product.findMany({ where: { id: { in: productIds } }, select: { slug: true, oldSlugs: true } }) : [];
    for (const s of new Set([...slugs, ...rows.flatMap((r) => [r.slug, ...r.oldSlugs])])) updateTag(productTag(s));
  }
  revalidateTag(CATALOG_TAG, "max");
}
