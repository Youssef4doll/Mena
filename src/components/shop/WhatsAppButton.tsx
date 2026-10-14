"use client";

import { usePathname } from "next/navigation";
import { dict, type Lang } from "@/i18n";
import { track } from "@/lib/client/track";
import { pixelContact } from "@/lib/client/pixels";
import { IconWhatsApp } from "./Icons";

/** The floating WhatsApp button. Hidden where a sticky order bar already sits (product, checkout). */
export function WhatsAppFloat({ lang, phone }: { lang: Lang; phone: string }) {
  const pathname = usePathname();
  const t = dict(lang);
  if (!phone || /\/(produit|commande)(\/|$)/.test(pathname)) return null;
  const text = lang === "ar" ? "السلام، عندي سؤال" : "Bonjour, j'ai une question";
  return (
    <a
      href={`https://wa.me/216${phone}?text=${encodeURIComponent(text)}`}
      target="_blank"
      rel="noopener"
      onClick={() => {
        track("whatsapp_clicked", { props: { where: "float" } });
        pixelContact();
      }}
      className="fixed bottom-4 end-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-wa text-white shadow-lift transition active:scale-95"
      aria-label={t.trust.support}
    >
      <IconWhatsApp className="h-7 w-7" />
    </a>
  );
}
