import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLang, dict } from "@/i18n";
import { getSettings } from "@/lib/settings";
import { publicSettings } from "@/lib/settings-schema";
import { Checkout } from "@/components/shop/Checkout";

export async function generateMetadata({ params }: PageProps<"/[lang]/commande">): Promise<Metadata> {
  const { lang } = await params;
  return { title: isLang(lang) ? dict(lang).checkout.title : "Commande", robots: { index: false } };
}

export default async function CheckoutRoute({ params }: PageProps<"/[lang]/commande">) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const settings = await getSettings();
  return <Checkout lang={lang} settings={publicSettings(settings)} />;
}
