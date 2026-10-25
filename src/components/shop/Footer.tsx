import Link from "next/link";
import { dict, href, type Lang } from "@/i18n";
import type { Settings } from "@/lib/settings-schema";
import { formatPhone, normalizePhone } from "@/lib/phone";
import { profileUrl } from "@/lib/social";
import { Logo } from "./Logo";
import { IconPhone, IconWhatsApp } from "./Icons";
import { ContactLink } from "./ContactLink";

/** White and short: the shop's number one tap away, and the useful links tall enough for a thumb. */
export function Footer({ lang, settings }: { lang: Lang; settings: Settings }) {
  const t = dict(lang);
  const s = settings.shop;
  const tel = normalizePhone(s.phone);
  const wa = settings.contact.whatsapp;
  const year = new Date().getFullYear();
  return (
    <footer className="mt-16 border-t border-line bg-white">
      <div className="mx-auto flex max-w-6xl xl:max-w-7xl 2xl:max-w-[90rem] flex-col gap-8 px-4 py-10 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col items-start gap-4">
          <Logo />
          {(tel || wa) && (
            <div className="flex flex-wrap gap-2">
              {tel && (
                <ContactLink kind="phone" where="footer" href={`tel:+216${tel}`} className="inline-flex h-12 items-center gap-2 rounded-full border border-field bg-white px-5 text-[17px] font-bold text-ink hover:bg-sand">
                  <IconPhone className="h-5 w-5" />
                  <span className="ltr-nums">{formatPhone(tel)}</span>
                </ContactLink>
              )}
              {wa && (
                <ContactLink kind="whatsapp" where="footer" href={`https://wa.me/216${wa}?text=${encodeURIComponent(t.trust.waHello)}`} className="inline-flex h-12 items-center gap-2 rounded-full bg-wa-soft px-5 text-[17px] font-bold text-wa-ink">
                  <IconWhatsApp className="h-5 w-5" />
                  WhatsApp
                </ContactLink>
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
          {/* Only real profiles: an empty or bare address is left out (see social.ts). */}
          {(["instagram", "facebook", "tiktok"] as const).map((k) => {
            const url = profileUrl(k, s[k]);
            return url ? <a key={k} href={url} target="_blank" rel="noopener">{{ instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok" }[k]}</a> : null;
          })}
          {s.email && <a href={`mailto:${s.email}`} className="col-span-2 break-all sm:col-span-1">{s.email}</a>}
        </nav>
      </div>
      <div className="border-t border-line">
        <p className="mx-auto max-w-6xl xl:max-w-7xl 2xl:max-w-[90rem] px-4 py-4 text-[15px] text-muted">
          © {year} {s.legalName || s.name}
          {s.legalId && <span className="ltr-nums"> · MF {s.legalId}</span>}
          {s.address && ` · ${s.address}`}
        </p>
      </div>
    </footer>
  );
}
