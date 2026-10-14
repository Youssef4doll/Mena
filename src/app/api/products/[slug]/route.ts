import { NextResponse } from "next/server";
import { getProduct } from "@/lib/catalog";
import { getSettings } from "@/lib/settings";
import { publicSettings } from "@/lib/settings-schema";

/**
 * What the quick order form needs, loaded when a shopper taps "Acheter
 * maintenant" on a product card: the product as its page shows it (offers,
 * options, stock) and the public settings. Prices here are for display; the
 * order is priced again on the server like any other.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/products/[slug]">) {
  const { slug } = await ctx.params;
  if (!/^[a-z0-9-]{1,120}$/.test(slug)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const [p, settings] = await Promise.all([getProduct(slug), getSettings()]);
  if (!p) return NextResponse.json({ error: "not_found" }, { status: 404 });
  // The sheet shows the form, not the page: no reviews, related products or long texts.
  const product = { ...p, related: undefined, reviews: [], description: "", descriptionAr: null, specs: [], specsAr: null, detailImages: [], video: null };
  return NextResponse.json({ product, settings: publicSettings(settings) }, { headers: { "cache-control": "public, max-age=30, s-maxage=60" } });
}
