import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { dict, href, isLang, pageMeta } from "@/i18n";
import { getSettings } from "@/lib/settings";
import { formatPhone, normalizePhone } from "@/lib/phone";
import { Prose } from "../Prose";
import { IconMessenger, IconPhone, IconWhatsApp } from "@/components/shop/Icons";
import { ContactLink } from "@/components/shop/ContactLink";

export async function generateMetadata({ params }: PageProps<"/[lang]/contact">): Promise<Metadata> {
  return pageMeta((await params).lang, "/contact", (t) => t.footer.contact);
}

/** One main channel in colour, the others as outlined pills, then the shop's details. */
export default async function ContactRoute({ params }: PageProps<"/[lang]/contact">) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const t = dict(lang);
  const s = await getSettings();
  const ar = lang === "ar";
  const tel = normalizePhone(s.shop.phone);
  return (
    <Prose title={t.footer.contact}>
      <div className="flex flex-col gap-3">
        {s.contact.whatsapp && (
          <ContactLink kind="whatsapp" where="contact" href={`https://wa.me/216${s.contact.whatsapp}?text=${encodeURIComponent(t.trust.waHello)}`} className="flex min-h-14 items-center justify-center gap-2.5 rounded-full bg-wa px-6 text-[17px] font-bold text-white">
            <IconWhatsApp className="h-6 w-6" />
            {ar ? "ابعثلنا على واتساب" : "Écrivez-nous sur WhatsApp"}
          </ContactLink>
        )}
        {tel && (
          <ContactLink kind="phone" where="contact" href={`tel:+216${tel}`} className="flex min-h-14 items-center justify-center gap-2.5 rounded-full border border-ink/60 bg-white px-6 text-[17px] font-bold text-ink hover:bg-sand">
            <IconPhone className="h-5 w-5" />
            <span className="ltr-nums">{formatPhone(tel)}</span>
          </ContactLink>
        )}
        {s.contact.messenger && (
          <ContactLink kind="messenger" where="contact" href={`https://m.me/${s.contact.messenger}`} className="flex min-h-14 items-center justify-center gap-2.5 rounded-full border border-line bg-white px-6 text-[17px] font-bold text-ink hover:bg-sand">
            <IconMessenger className="h-5 w-5 text-[#0866ff]" />
            Messenger
          </ContactLink>
        )}
      </div>
      {/* Who sells: only what the shop entered in its settings. */}
      {(s.shop.email || s.shop.address || s.shop.legalName || s.shop.legalId || s.shop.facebook) && (
        <dl className="mt-3 divide-y divide-line rounded-[20px] border border-line">
          {(s.shop.legalName || s.shop.legalId) && (
            <div className="px-5 py-4">
              <dt className="text-[15px] text-muted">{ar ? "البائع" : "Vendeur"}</dt>
              <dd className="text-[17px] text-ink">
                {s.shop.legalName || s.shop.name}
                {s.shop.legalId && <span className="block text-[15px] text-ink-2 ltr-nums">{ar ? "المعرّف الجبائي" : "Matricule fiscal"} {s.shop.legalId}</span>}
              </dd>
            </div>
          )}
          {s.shop.email && (
            <div className="px-5 py-4">
              <dt className="text-[15px] text-muted">{ar ? "الإيميل" : "E-mail"}</dt>
              <dd>
                <a href={`mailto:${s.shop.email}`} dir="ltr" className="text-[17px] text-ink underline-offset-4 hover:underline">
                  {s.shop.email}
                </a>
              </dd>
            </div>
          )}
          {s.shop.address && (
            <div className="px-5 py-4">
              <dt className="text-[15px] text-muted">{ar ? "العنوان" : "Adresse"}</dt>
              <dd className="text-[17px] text-ink">{s.shop.address}</dd>
            </div>
          )}
          {s.shop.facebook && (
            <div className="px-5 py-4">
              <dt className="text-[15px] text-muted">Facebook</dt>
              <dd>
                <a href={s.shop.facebook} target="_blank" rel="noopener" dir="ltr" className="break-all text-[17px] text-sea underline underline-offset-4">
                  {s.shop.facebook.replace(/^https?:\/\/(www\.)?/, "")}
                </a>
              </dd>
            </div>
          )}
        </dl>
      )}
      <Link href={href(lang, "/suivi")} className="inline-flex min-h-11 w-fit items-center text-[17px] text-sea underline underline-offset-4">
        {t.nav.track}
      </Link>
    </Prose>
  );
}
