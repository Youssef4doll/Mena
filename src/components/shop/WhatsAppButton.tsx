"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { dict, type Lang } from "@/i18n";
import { track } from "@/lib/client/track";
import { pixelContact } from "@/lib/client/pixels";
import { IconClose, IconWhatsApp } from "./Icons";

const SEEN = "mena_wa_hint";

/**
 * The floating WhatsApp button, to ask the shop a question in one tap. Once
 * per visit a small bubble says what it is for ("Une question ?"), then goes
 * away by itself. Hidden where an order bar or form already sits (product,
 * basket, checkout).
 */
export function WhatsAppFloat({ lang, phone }: { lang: Lang; phone: string }) {
  const pathname = usePathname();
  const t = dict(lang);
  const [hint, setHint] = useState(false);
  const hidden = !phone || /\/(produit|commande|panier)(\/|$)/.test(pathname);

  // Once per visit, after the customer has started to look around (a first scroll), for ten seconds.
  useEffect(() => {
    if (hidden) return;
    let seen = false;
    try {
      seen = sessionStorage.getItem(SEEN) === "1";
    } catch {}
    if (seen) return;
    let show = 0;
    let hide = 0;
    const onScroll = () => {
      if (scrollY < 250 || show) return;
      removeEventListener("scroll", onScroll);
      show = window.setTimeout(() => {
        setHint(true);
        try {
          sessionStorage.setItem(SEEN, "1");
        } catch {}
        hide = window.setTimeout(() => setHint(false), 10_000);
      }, 1200);
    };
    addEventListener("scroll", onScroll, { passive: true });
    return () => {
      removeEventListener("scroll", onScroll);
      clearTimeout(show);
      clearTimeout(hide);
      // Leaving for a page without the button ends the hint; it does not come back.
      setHint(false);
    };
  }, [hidden]);

  if (hidden) return null;
  const link = `https://wa.me/216${phone}?text=${encodeURIComponent(t.trust.waHello)}`;
  const open = (where: string) => {
    setHint(false);
    track("whatsapp_clicked", { props: { where } });
    pixelContact();
  };
  return (
    <div className="wa-float fixed bottom-4 end-4 z-30 flex items-end gap-2 pb-[env(safe-area-inset-bottom)]">
      {hint && (
        <div className="relative mb-2 flex max-w-[190px] animate-fade items-start gap-0.5 rounded-2xl rounded-ee-md bg-white py-2 ps-3 pe-0.5 text-[16px] font-bold leading-snug text-ink shadow-lift sm:max-w-[230px]" role="status">
          <a href={link} target="_blank" rel="noopener" onClick={() => open("bubble")} className="py-0.5">
            {t.trust.waBubble}
          </a>
          <button type="button" onClick={() => setHint(false)} className="-my-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-sand" aria-label={t.nav.close}>
            <IconClose className="h-5 w-5" />
          </button>
        </div>
      )}
      <a
        href={link}
        target="_blank"
        rel="noopener"
        onClick={() => open("float")}
        className="flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-full bg-wa text-white shadow-lift ring-4 ring-white transition active:scale-95"
        aria-label={t.trust.waBubble}
      >
        <IconWhatsApp className="h-8 w-8" />
      </a>
    </div>
  );
}
