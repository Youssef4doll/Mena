"use client";

import { usePathname } from "next/navigation";
import { dict, type Lang } from "@/i18n";
import { track } from "@/lib/client/track";
import { pixelContact } from "@/lib/client/pixels";
import { IconWhatsApp } from "./Icons";

/**
 * The floating WhatsApp button, to ask the shop a question in one tap. The
 * green mark says what it is; no text bubble over the products. Hidden where
 * an order bar or form already sits (product, basket, checkout).
 */
export function WhatsAppFloat({ lang, phone }: { lang: Lang; phone: string }) {
  const pathname = usePathname();
  const t = dict(lang);
  if (!phone || /\/(produit|commande|panier)(\/|$)/.test(pathname)) return null;
  const link = `https://wa.me/216${phone}?text=${encodeURIComponent(t.trust.waHello)}`;
  return (
    <a
      href={link}
      target="_blank"
      rel="noopener"
      onClick={() => {
        track("whatsapp_clicked", { props: { where: "float" } });
        pixelContact();
      }}
      className="wa-float fixed bottom-[max(1rem,env(safe-area-inset-bottom))] end-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-wa text-white shadow-[0_6px_16px_-6px_rgb(0_0_0/.45)] transition active:scale-95 md:bottom-6 md:end-6"
      aria-label={t.trust.waBubble}
    >
      <IconWhatsApp className="h-7 w-7" />
    </a>
  );
}
