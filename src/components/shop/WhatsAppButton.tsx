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

  useEffect(() => {
    if (hidden) return;
    let seen = false;
    try {
      seen = sessionStorage.getItem(SEEN) === "1";
    } catch {}
    if (seen) return;
    const show = setTimeout(() => {
      setHint(true);
      try {
        sessionStorage.setItem(SEEN, "1");
      } catch {}
    }, 3500);
    const hide = setTimeout(() => setHint(false), 14_000);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
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
    <div className="fixed bottom-4 end-4 z-30 flex items-end gap-2 pb-[env(safe-area-inset-bottom)]">
      {hint && (
        <div className="relative mb-2 flex max-w-[220px] animate-fade items-start gap-1 rounded-2xl rounded-ee-md bg-white py-2.5 ps-3.5 pe-1 text-[16px] font-bold leading-snug text-ink shadow-lift" role="status">
          <a href={link} target="_blank" rel="noopener" onClick={() => open("bubble")} className="py-0.5">
            {t.trust.waBubble}
          </a>
          <button type="button" onClick={() => setHint(false)} className="-mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-sand" aria-label={t.nav.close}>
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
