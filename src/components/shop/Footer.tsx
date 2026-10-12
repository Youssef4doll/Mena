import Link from "next/link";
import { dict, href, pick, type Lang } from "@/i18n";
import type { Settings } from "@/lib/settings-schema";
import { Logo } from "./Logo";

export function Footer({ lang, settings, categories }: { lang: Lang; settings: Settings; categories: { slug: string; name: string; nameAr: string | null }[] }) {
  const t = dict(lang);
  const s = settings.shop;
  const year = new Date().getFullYear();
  return (
    <footer className="mt-20 border-t border-line bg-sand/60">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-3">
          <Logo />
          <p className="max-w-xs text-sm leading-relaxed text-muted">{pick(lang, s.tagline, s.taglineAr)}</p>
          <div className="flex gap-3 text-sm">
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
          {s.phone && <span className="ltr-nums">{s.phone}</span>}
          {s.email && <span>{s.email}</span>}
        </FooterCol>
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-5 text-xs text-muted">
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
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{title}</p>
      <div className="flex flex-col gap-2 text-sm text-ink-2 [&_a:hover]:text-sea">{children}</div>
    </div>
  );
}
