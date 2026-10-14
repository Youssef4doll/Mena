import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { dict, isLang, pageMeta } from "@/i18n";
import { getSettings } from "@/lib/settings";
import { Prose } from "../Prose";
import { IconMessenger, IconWhatsApp } from "@/components/shop/Icons";

export async function generateMetadata({ params }: PageProps<"/[lang]/contact">): Promise<Metadata> {
  return pageMeta((await params).lang, "/contact", (t) => t.footer.contact);
}

export default async function ContactRoute({ params }: PageProps<"/[lang]/contact">) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const t = dict(lang);
  const s = await getSettings();
  return (
    <Prose title={t.footer.contact}>
      <div className="flex flex-col gap-3">
        {s.contact.whatsapp && (
          <a href={`https://wa.me/216${s.contact.whatsapp}`} target="_blank" rel="noopener" className="flex h-12 items-center justify-center gap-2 rounded-full bg-wa font-medium text-white">
            <IconWhatsApp /> WhatsApp
          </a>
        )}
        {s.contact.messenger && (
          <a href={`https://m.me/${s.contact.messenger}`} target="_blank" rel="noopener" className="flex h-12 items-center justify-center gap-2 rounded-full bg-[#0866ff] font-medium text-white">
            <IconMessenger /> Messenger
          </a>
        )}
        {s.shop.phone && <p className="ltr-nums">{s.shop.phone}</p>}
        {s.shop.email && <p>{s.shop.email}</p>}
        {s.shop.address && <p>{s.shop.address}</p>}
      </div>
    </Prose>
  );
}
