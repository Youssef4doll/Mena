import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { dict, isLang } from "@/i18n";
import { getSettings } from "@/lib/settings";
import { publicSettings } from "@/lib/settings-schema";
import { CartView } from "@/components/shop/CartView";

export async function generateMetadata({ params }: PageProps<"/[lang]/panier">): Promise<Metadata> {
  const { lang } = await params;
  return { title: isLang(lang) ? dict(lang).cart.title : "Panier", robots: { index: false, follow: true } };
}

/** The basket lives in the browser: the page itself is the same for everyone. */
export default async function CartRoute({ params }: PageProps<"/[lang]/panier">) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const settings = await getSettings();
  return <CartView lang={lang} settings={publicSettings(settings)} />;
}
