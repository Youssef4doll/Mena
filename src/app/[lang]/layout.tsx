import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { Atkinson_Hyperlegible_Next, IBM_Plex_Sans_Arabic } from "next/font/google";
import "../globals.css";
import { dict, isLang, LOCALES, type Lang } from "@/i18n";
import { getSettings } from "@/lib/settings";
import { getCategories } from "@/lib/catalog";
import { Header } from "@/components/shop/Header";
import { Footer } from "@/components/shop/Footer";
import { ConsentAndPixels } from "@/components/shop/Consent";
import { WhatsAppFloat } from "@/components/shop/WhatsAppButton";
import { SITE_URL } from "@/lib/site";
import { normalizePhone } from "@/lib/phone";
import { deliversEverywhere } from "@/lib/governorates";

// Atkinson Hyperlegible: letters that cannot be mistaken for one another (I/l/1, O/0), for readers with low vision.
const body = Atkinson_Hyperlegible_Next({ subsets: ["latin"], variable: "--font-body", display: "swap" });
const plexAr = IBM_Plex_Sans_Arabic({ subsets: ["arabic"], weight: ["400", "700"], variable: "--font-plex-ar", display: "swap", preload: false });

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: LayoutProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  const s = await getSettings();
  const ar = lang === "ar";
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: `${s.shop.name} — ${ar ? s.shop.taglineAr : s.shop.tagline}`, template: `%s · ${s.shop.name}` },
    description: ar ? s.shop.taglineAr : s.shop.tagline,
    openGraph: { siteName: s.shop.name, locale: ar ? "ar_TN" : "fr_TN", type: "website" },
    alternates: { languages: { fr: "/", ar: "/ar" } },
  };
}

export const viewport: Viewport = {
  themeColor: "#f5f7fa",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function ShopLayout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang: raw } = await params;
  if (!isLang(raw)) notFound();
  const lang: Lang = raw;
  const t = dict(lang);
  const [settings, categories] = await Promise.all([getSettings(), getCategories()]);
  const cats = categories.map((c) => ({ slug: c.slug, name: c.name, nameAr: c.nameAr }));
  const announcement = [t.trust.cod, deliversEverywhere(settings.delivery.zones) ? t.trust.delivery : t.trust.deliveryHome, t.trust.returns(settings.returns.days)];

  return (
    <html lang={lang === "ar" ? "ar-TN" : "fr-TN"} dir={t.dir} className={`shop-root ${body.variable} ${plexAr.variable}`}>
      <body className="min-h-dvh">
        <Header lang={lang} categories={cats} announcement={announcement} phone={normalizePhone(settings.shop.phone)} />
        <main>{children}</main>
        <Footer lang={lang} settings={settings} categories={cats} />
        <WhatsAppFloat lang={lang} phone={settings.contact.whatsapp} />
        <ConsentAndPixels lang={lang} ids={{ metaPixelId: settings.tracking.metaPixelId, ga4Id: settings.tracking.ga4Id, tiktokPixelId: settings.tracking.tiktokPixelId }} />
      </body>
    </html>
  );
}
