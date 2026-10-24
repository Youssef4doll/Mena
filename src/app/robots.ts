import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { OTHER_LANG } from "@/i18n/lang";

export default function robots(): MetadataRoute.Robots {
  return {
    // Product pictures are served from /api/img: allowed for Google Images and rich results, the rest of /api stays closed.
    rules: [{ userAgent: "*", allow: ["/", "/api/img/"], disallow: ["/admin", "/api", ...["/commande", "/suivi", "/recherche", "/panier"].flatMap((p) => [p, `/${OTHER_LANG}${p}`])] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
