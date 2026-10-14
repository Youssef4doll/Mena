import Link from "next/link";
import { dict, href, pick, type Lang } from "@/i18n";
import type { Settings } from "@/lib/settings-schema";
import { formatPhone, normalizePhone } from "@/lib/phone";
import { Logo } from "./Logo";
import { IconWhatsApp } from "./Icons";

/** Links tall enough for a thumb, and the shop's number one tap away. */
export function Footer({ lang, settings, categories }: { lang: Lang; settings: Settings; categories: { slug: string; name: string; nameAr: string | null }[] }) {
  const t = dict(lang);
  const s = settings.shop;
  const tel = normalizePhone(s.phone);
  const wa = settings.contact.whatsapp;
  const year = new Date().getFullYear();
  return (
    <footer className="mt-12 border-t border-line bg-sand/60">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-8 px-4 py-10 lg:grid-cols-4">
        <div className="col-span-2 flex flex-col items-start gap-3 lg:col-span-1">
          <Logo />
          <p className="max-w-xs text-[16px] leading-relaxed text-muted">{pick(lang, s.tagline, s.taglineAr)}</p>
          {(tel || wa) && (
            <div className="flex flex-wrap gap-2">
              {tel && (
                <a href={`tel:+216${tel}`} className="inline-flex min-h-12 items-center rounded-xl border-2 border-field bg-white px-4 text-[17px] font-bold text-ink ltr-nums">
                  {formatPhone(tel)}
                </a>
              )}
              {wa && (
                <a href={`https://wa.me/216${wa}`} target="_blank" rel="noopener" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-wa-soft px-4 text-[17px] font-bold text-wa-ink">
                  <IconWhatsApp className="h-5 w-5" />
                  WhatsApp
                </a>
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-x-5 text-[16px] [&>a]:inline-flex [&>a]:min-h-11 [&>a]:items-center">
            {s.instagram && <a href={s.instagram} target="_blank" rel="noopener" className="underline-offset-2 hover:underline">Instagram</a>}
            {s.facebook && <a href={s.facebook} target="_blank" rel="noopener" className="underline-offset-2 hover:underline">Facebook</a>}
            {s.tiktok && <a href={s.tiktok} target="_blank" rel="noopener" className="underline-offset-2 hover:underline">TikTok</a>}
          </div>
        </div>
        <FooterCol title={t.nav.categories}>
          {categories.slice(0, 6).map((c) => (
            <Link key={c.slug} href={href(lang, `/categorie/${c.slug}`)}>{pick(lang, c.name, c.nameAr)}</Link>
          ))}
        </FooterCol>
        <FooterCol title={t.footer.help}>
          <Link href={href(lang, "/suivi")}>{t.nav.track}</Link>
          <Link href={href(lang, "/livraison-retours")}>{t.footer.deliveryReturns}</Link>
          <Link href={href(lang, "/contact")}>{t.footer.contact}</Link>
        </FooterCol>
        <FooterCol title={t.footer.about}>
          <Link href={href(lang, "/conditions")}>{t.footer.terms}</Link>
          <Link href={href(lang, "/confidentialite")}>{t.footer.privacy}</Link>
          {s.email && <a href={`mailto:${s.email}`}>{s.email}</a>}
        </FooterCol>
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-5 text-[15px] text-muted">
          <span>
            © {year} {s.name}. {t.footer.rights}
            {s.legalId && <span className="ltr-nums"> · MF {s.legalId}</span>}
          </span>
          {s.address && <span>{s.address}</span>}
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[17px] font-bold text-ink">{title}</p>
      <div className="flex flex-col text-[16px] text-ink-2 [&>*]:flex [&>*]:min-h-11 [&>*]:items-center [&_a:hover]:text-sea">{children}</div>
    </div>
  );
}
