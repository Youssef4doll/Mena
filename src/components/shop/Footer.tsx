import Link from "next/link";
import { dict, href, type Lang } from "@/i18n";
import type { Settings } from "@/lib/settings-schema";
import { formatPhone, normalizePhone } from "@/lib/phone";
import { Logo } from "./Logo";
import { IconPhone, IconWhatsApp } from "./Icons";

/** White and short: the shop's number one tap away, and the useful links tall enough for a thumb. */
export function Footer({ lang, settings }: { lang: Lang; settings: Settings }) {
  const t = dict(lang);
  const s = settings.shop;
  const tel = normalizePhone(s.phone);
  const wa = settings.contact.whatsapp;
  const year = new Date().getFullYear();
  return (
    <footer className="mt-16 border-t border-line bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col items-start gap-4">
          <Logo />
          {(tel || wa) && (
            <div className="flex flex-wrap gap-2">
              {tel && (
                <a href={`tel:+216${tel}`} className="inline-flex h-12 items-center gap-2 rounded-full border border-field bg-white px-5 text-[17px] font-bold text-ink hover:bg-sand">
                  <IconPhone className="h-5 w-5" />
                  <span className="ltr-nums">{formatPhone(tel)}</span>
                </a>
              )}
              {wa && (
                <a href={`https://wa.me/216${wa}`} target="_blank" rel="noopener" className="inline-flex h-12 items-center gap-2 rounded-full bg-wa-soft px-5 text-[17px] font-bold text-wa-ink">
                  <IconWhatsApp className="h-5 w-5" />
                  WhatsApp
                </a>
              )}
            </div>
          )}
        </div>
        <nav aria-label={t.footer.help} className="grid grid-cols-2 gap-x-8 text-[16px] text-ink-2 sm:grid-cols-3 [&>a]:flex [&>a]:min-h-11 [&>a]:items-center [&>a:hover]:text-sea">
          <Link href={href(lang, "/suivi")}>{t.nav.track}</Link>
          <Link href={href(lang, "/livraison-retours")}>{t.footer.deliveryReturns}</Link>
          <Link href={href(lang, "/contact")}>{t.footer.contact}</Link>
          <Link href={href(lang, "/conditions")}>{t.footer.terms}</Link>
          <Link href={href(lang, "/confidentialite")}>{t.footer.privacy}</Link>
          {s.instagram && <a href={s.instagram} target="_blank" rel="noopener">Instagram</a>}
          {s.facebook && <a href={s.facebook} target="_blank" rel="noopener">Facebook</a>}
          {s.tiktok && <a href={s.tiktok} target="_blank" rel="noopener">TikTok</a>}
          {s.email && <a href={`mailto:${s.email}`} className="col-span-2 break-all sm:col-span-1">{s.email}</a>}
        </nav>
      </div>
      <div className="border-t border-line">
        <p className="mx-auto max-w-6xl px-4 py-4 text-[15px] text-muted">
          © {year} {s.name}
          {s.legalId && <span className="ltr-nums"> · MF {s.legalId}</span>}
          {s.address && ` · ${s.address}`}
        </p>
      </div>
    </footer>
  );
}
