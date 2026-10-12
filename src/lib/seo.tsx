import type { Settings } from "./settings-schema";
import type { ProductPage } from "./catalog";
import { SITE_URL } from "./site";

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
    sameAs: [s.shop.instagram, s.shop.facebook, s.shop.tiktok].filter(Boolean),
    areaServed: "TN",
    currenciesAccepted: "TND",
    paymentAccepted: "Cash",
  };
}

/** Product structured data. Ratings are included only when real, approved reviews exist. */
export function productLd(p: ProductPage, s: Settings, url: string) {
  const zones = Object.values(s.delivery.zones).filter((z) => z.enabled);
  const minFee = zones.length ? Math.min(...zones.map((z) => z.fee)) : null;
  const inStock = p.stock.kind !== "out";
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    description: p.description.slice(0, 500),
    image: p.images.map((i) => `${SITE_URL}/api/img/${i.id}/1080`),
    sku: p.id,
    url,
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: "TND",
      price: (Math.min(p.price, ...p.variants.map((v) => v.price)) / 1000).toFixed(3),
      availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
      ...(minFee != null
        ? {
            shippingDetails: {
              "@type": "OfferShippingDetails",
              shippingRate: { "@type": "MonetaryAmount", value: (minFee / 1000).toFixed(3), currency: "TND" },
              shippingDestination: { "@type": "DefinedRegion", addressCountry: "TN" },
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
