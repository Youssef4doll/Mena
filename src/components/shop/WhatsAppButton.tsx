"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { dict, type Lang } from "@/i18n";
import { track } from "@/lib/client/track";
import { pixelContact } from "@/lib/client/pixels";
import { IconWhatsApp } from "./Icons";

/**
 * The floating WhatsApp button, to ask the shop a question in one tap.
 * Hidden where an order bar or form already sits (product, basket, checkout).
 * On the home page only, a small greeting appears beside it after a few
 * seconds; closed once, it stays closed for the visit.
 */
const HELLO = "mena_wa_hello";

export function WhatsAppFloat({ lang, phone }: { lang: Lang; phone: string }) {
  const pathname = usePathname();
  const t = dict(lang);
  const home = pathname === "/" || pathname === "/fr" || pathname === "/ar";
  const [hello, setHello] = useState(false);
  useEffect(() => {
    if (!home) return;
    try {
      if (sessionStorage.getItem(HELLO)) return;
    } catch {}
    const id = setTimeout(() => setHello(true), 3000);
    return () => clearTimeout(id);
  }, [home]);
  const closeHello = () => {
    setHello(false);
    try {
      sessionStorage.setItem(HELLO, "1");
    } catch {}
  };
  if (!phone || /\/(produit|commande|panier)(\/|$)/.test(pathname)) return null;
  const link = `https://wa.me/216${phone}?text=${encodeURIComponent(t.trust.waHello)}`;
  const onClick = () => {
    track("whatsapp_clicked", { props: { where: "float" } });
    pixelContact();
  };
  return (
    <>
      {hello && home && (
        <div className="wa-float fixed bottom-[calc(max(1rem,env(safe-area-inset-bottom))+4.25rem)] end-4 z-30 flex max-w-[15rem] animate-fade items-start gap-1 rounded-2xl rounded-ee-md bg-white py-2.5 ps-3.5 pe-1.5 text-[16px] leading-snug text-ink shadow-[0_8px_24px_-8px_rgb(0_0_0/.35)] md:bottom-[5.5rem] md:end-6">
          <a href={link} target="_blank" rel="noopener" onClick={() => { onClick(); closeHello(); }} className="font-medium">
            {t.trust.waGreeting}
          </a>
          <button type="button" onClick={closeHello} className="-my-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-sand" aria-label={t.nav.close}>
            ×
          </button>
        </div>
      )}
    <a
      href={link}
      target="_blank"
      rel="noopener"
      onClick={onClick}
      className="wa-float fixed bottom-[max(1rem,env(safe-area-inset-bottom))] end-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-wa text-white shadow-[0_6px_16px_-6px_rgb(0_0_0/.45)] transition active:scale-95 md:bottom-6 md:end-6"
      aria-label={t.trust.waBubble}
    >
      <IconWhatsApp className="h-7 w-7" />
    </a>
    </>
  );
}
