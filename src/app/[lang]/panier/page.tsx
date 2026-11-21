import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { dict, isLang } from "@/i18n";
import { getSettings } from "@/lib/settings";
import { publicSettings } from "@/lib/settings-schema";
import { CartView } from "@/components/shop/CartView";
import { ProductRow } from "@/components/shop/ProductCard";
import { getHome } from "@/lib/catalog";

export async function generateMetadata({ params }: PageProps<"/[lang]/panier">): Promise<Metadata> {
  const { lang } = await params;
  return { title: isLang(lang) ? dict(lang).cart.title : "Panier", robots: { index: false, follow: true } };
}

/** The basket lives in the browser: the page itself is the same for everyone. */
export default async function CartRoute({ params }: PageProps<"/[lang]/panier">) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const t = dict(lang);
  const [settings, home] = await Promise.all([getSettings(), getHome()]);
  // An empty basket is not the end of the visit: the shop's real shelves under it, the most ordered when there
  // are orders behind them (the home page's rule), else the selection, else what is new.
  const shelf =
    home.bestsellers.length >= 4
      ? { title: t.home.bestsellers, products: home.bestsellers, list: "cart_empty_best" }
      : home.featured.length >= 4
        ? { title: t.home.featured, products: home.featured, list: "cart_empty_featured" }
        : { title: t.home.newest, products: home.newest, list: "cart_empty_new" };
  const suggestions =
    shelf.products.length > 0 ? (
      <section className="mt-12 text-start" aria-labelledby="cart-empty-shelf">
        <h2 id="cart-empty-shelf" className="mb-4 text-[22px] font-bold leading-tight text-ink">
          {shelf.title}
        </h2>
        <ProductRow products={shelf.products} lang={lang} list={shelf.list} />
      </section>
    ) : null;
  return <CartView lang={lang} settings={publicSettings(settings)} suggestions={suggestions} />;
}
