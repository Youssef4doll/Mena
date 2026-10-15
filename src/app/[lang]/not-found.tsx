import { ar } from "@/i18n/ar";
import { fr } from "@/i18n/fr";
import { getHome } from "@/lib/catalog";
import { NotFoundBody } from "./NotFoundBody";

/**
 * A missing page (often a product paused while its ad still runs): the way
 * home, and the shop's own selection right there, so a paid visit does not
 * end on an empty page. The status stays 404.
 */
export default async function NotFound() {
  const home = await getHome().catch(() => null);
  const products = home ? (home.featured.length ? home.featured : home.newest).slice(0, 8) : [];
  return <NotFoundBody copy={{ ar: { ...ar.notFound, others: ar.search.discover }, fr: { ...fr.notFound, others: fr.search.discover } }} products={products} />;
}
