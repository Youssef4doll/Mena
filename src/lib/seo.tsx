import type { Settings } from "./settings-schema";
import type { ProductCard, ProductPage } from "./catalog";
import { SITE_URL } from "./site";
import { leadOffer } from "./offer-display";
import { formatTND } from "./money";
import { deliversEverywhere } from "./governorates";
import { deliveryFeeFor } from "./delivery";
import { profileUrl } from "./social";
import { href, pick, type Lang } from "@/i18n";

/** Google shows about 60 characters of a title and 155 of a description. */
export const SEO_TITLE_MAX = 60;
export const SEO_DESCRIPTION_MAX = 155;

/** Cut at a word, never in the middle of one. */
export function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const at = cut.lastIndexOf(" ");
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[\s,;:.\-–—]+$/, "")}…`;
}

export type SeoProduct = Pick<ProductPage, "name" | "nameAr" | "summary" | "summaryAr" | "description" | "descriptionAr" | "seoTitle" | "seoTitleAr" | "seoDescription" | "seoDescriptionAr" | "price"> & {
  category: { name: string; nameAr: string | null } | null;
  offers: { quantity: number; price: number }[];
  variants: { price: number }[];
};

/**
 * The title Google shows, the way Amazon builds theirs: the product's own
 * words first (the name the shop wrote, keywords included), then its
 * category. The shop's own "Titre pour Google" wins when it is filled.
 * The layout adds "· Mena".
 */
export function productTitle(p: SeoProduct, lang: Lang): string {
  const own = pick(lang, p.seoTitle, p.seoTitleAr);
  if (own.trim()) return clip(own, SEO_TITLE_MAX);
  const name = pick(lang, p.name, p.nameAr);
  const cat = p.category ? pick(lang, p.category.name, p.category.nameAr) : "";
  return clip(cat && name.length + cat.length + 3 <= SEO_TITLE_MAX - 7 ? `${name} — ${cat}` : name, SEO_TITLE_MAX);
}

/**
 * The line under the title in Google: the name again (the words searched
 * are shown in bold there), the short description, the real price, and the
 * two facts that decide a cash-on-delivery purchase.
 */
export function productDescription(p: SeoProduct, lang: Lang, everywhere: boolean): string {
  const own = pick(lang, p.seoDescription, p.seoDescriptionAr);
  if (own.trim()) return clip(own, SEO_DESCRIPTION_MAX + 5);
  const name = pick(lang, p.name, p.nameAr);
  const about = pick(lang, p.summary, p.summaryAr) || pick(lang, p.description, p.descriptionAr).split(/\n/)[0] || "";
  const lead = leadOffer(p.offers);
  const price = formatTND(lead?.price ?? Math.min(p.price, ...p.variants.map((v) => v.price)), lang);
  const facts =
    lang === "ar"
      ? `${price}. الدفع عند الاستلام، ${everywhere ? "توصيل لكل الولايات" : "توصيل حتى لدارك"}.`
      : `${price}. Paiement à la livraison, ${everywhere ? "livraison dans toute la Tunisie" : "livraison à domicile"}.`;
  const head = about && !about.toLowerCase().startsWith(name.toLowerCase()) ? `${name}${lang === "ar" ? ": " : " : "}${about}` : about || name;
  const room = SEO_DESCRIPTION_MAX - facts.length - 1;
  return `${clip(head, Math.max(40, room))} ${facts}`;
}

/** A list page's line in Google: what is in it (the first product names, which are what people search) and how it is sold. */
export function listDescription(title: string, products: Pick<ProductCard, "name" | "nameAr">[], lang: Lang, s: Settings): string {
  const everywhere = deliversEverywhere(s.delivery.zones);
  const names = products.slice(0, 4).map((p) => pick(lang, p.name, p.nameAr)).join(lang === "ar" ? "، " : ", ");
  const facts =
    lang === "ar"
      ? `الدفع عند الاستلام، ${everywhere ? "توصيل لكل الولايات" : "توصيل حتى لدارك"}.`
      : `Paiement à la livraison, ${everywhere ? "livraison dans toute la Tunisie" : "livraison à domicile"}.`;
  const head = names ? (lang === "ar" ? `${title}: ${names}` : `${title} : ${names}`) : title;
  return `${clip(head, SEO_DESCRIPTION_MAX - facts.length - 2)}. ${facts}`.replace("….", "…");
}

/** The store and its search box, for Google's sitelinks search box. */
export function websiteLd(s: Settings, lang: Lang) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: s.shop.name,
    url: `${SITE_URL}${href(lang, "/")}`,
    inLanguage: lang === "ar" ? "ar-TN" : "fr-TN",
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}${href(lang, "/recherche")}?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };
}

/** A category page as a list of its products, in the order shown. */
export function itemListLd(products: Pick<ProductCard, "slug" | "name" | "nameAr">[], lang: Lang) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: products.slice(0, 30).map((p, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE_URL}${href(lang, `/produit/${p.slug}`)}`, name: pick(lang, p.name, p.nameAr) })),
  };
}

/** JSON-LD, with "<" escaped so no string in it can close the script tag. */
export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

export function organizationLd(s: Settings) {
  return {
    "@context": "https://schema.org",
    "@type": "OnlineStore",
    name: s.shop.name,
    url: SITE_URL,
    logo: `${SITE_URL}/icon.svg`,
    ...(s.shop.phone ? { telephone: s.shop.phone } : {}),
    ...(s.shop.email ? { email: s.shop.email } : {}),
    sameAs: (["instagram", "facebook", "tiktok"] as const).map((k) => profileUrl(k, s.shop[k])).filter(Boolean),
    // Who sells, only as the shop entered it.
    ...(s.shop.legalName ? { legalName: s.shop.legalName } : {}),
    ...(s.shop.legalId ? { taxID: s.shop.legalId } : {}),
    ...(s.shop.address ? { address: { "@type": "PostalAddress", streetAddress: s.shop.address, addressCountry: "TN" } } : {}),
    areaServed: "TN",
    currenciesAccepted: "TND",
    paymentAccepted: "Cash",
  };
}

/**
 * Product structured data, in the page's language. Ratings are included only
 * when real, approved reviews exist; delivery cost and time are the shop's
 * own (its one fee, the shortest and longest delay).
 */
export function productLd(p: ProductPage, s: Settings, url: string, lang: Lang = "fr") {
  const zones = Object.values(s.delivery.zones).filter((z) => z.enabled);
  const minDays = zones.length ? Math.min(...zones.map((z) => z.minDays)) : null;
  const maxDays = zones.length ? Math.max(...zones.map((z) => Math.max(z.minDays, z.maxDays))) : null;
  const inStock = p.stock.kind !== "out";
  const lead = leadOffer(p.offers);
  const price = lead?.price ?? Math.min(p.price, ...p.variants.map((v) => v.price));
  // The fee for the price given below, by the checkout's rule: 0 when that offer is delivered free.
  const minFee = zones.length ? deliveryFeeFor(s.delivery, { freeOffer: lead?.freeDelivery, subtotal: price }) : null;
  const description = [pick(lang, p.summary, p.summaryAr), pick(lang, p.description, p.descriptionAr)].filter(Boolean).join("\n\n");
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: pick(lang, p.name, p.nameAr),
    description: description.slice(0, 1000),
    image: p.images.map((i) => `${SITE_URL}/api/img/${i.id}/1080`),
    sku: p.id,
    url,
    ...(p.category ? { category: pick(lang, p.category.name, p.category.nameAr) } : {}),
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: "TND",
      // What the page charges: the one-unit offer when there are offers (or the smallest pack, for its quantity).
      price: (price / 1000).toFixed(3),
      ...(lead && lead.quantity > 1 ? { eligibleQuantity: { "@type": "QuantitativeValue", value: lead.quantity } } : {}),
      availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
      ...(minFee != null
        ? {
            shippingDetails: {
              "@type": "OfferShippingDetails",
              shippingRate: { "@type": "MonetaryAmount", value: (minFee / 1000).toFixed(3), currency: "TND" },
              shippingDestination: { "@type": "DefinedRegion", addressCountry: "TN" },
              ...(minDays != null && maxDays != null
                ? {
                    deliveryTime: {
                      "@type": "ShippingDeliveryTime",
                      handlingTime: { "@type": "QuantitativeValue", minValue: 0, maxValue: 1, unitCode: "DAY" },
                      transitTime: { "@type": "QuantitativeValue", minValue: minDays, maxValue: maxDays, unitCode: "DAY" },
                    },
                  }
                : {}),
            },
          }
        : {}),
      hasMerchantReturnPolicy: {
        "@type": "MerchantReturnPolicy",
        applicableCountry: "TN",
        returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
        merchantReturnDays: s.returns.days,
      },
    },
    ...(p.rating
      ? {
          aggregateRating: { "@type": "AggregateRating", ratingValue: p.rating.avg.toFixed(1), reviewCount: p.rating.count },
          review: p.reviews.slice(0, 5).map((r) => ({
            "@type": "Review",
            reviewRating: { "@type": "Rating", ratingValue: r.rating },
            author: { "@type": "Person", name: r.authorName },
            ...(r.text ? { reviewBody: r.text } : {}),
            datePublished: r.createdAt.slice(0, 10),
          })),
        }
      : {}),
  };
}

export function breadcrumbLd(items: { name: string; url: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: it.url })),
  };
}
