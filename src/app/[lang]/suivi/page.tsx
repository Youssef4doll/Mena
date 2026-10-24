import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { dict, href, isLang } from "@/i18n";
import { rememberedOrders } from "@/lib/order-access";
import { formatTND } from "@/lib/money";
import { LookupForm } from "@/components/shop/LookupForm";
import { ForgetDevice } from "@/components/shop/ForgetDevice";
import { IconChevron } from "@/components/shop/Icons";

export const metadata: Metadata = { robots: { index: false } };

export default async function TrackRoute({ params }: PageProps<"/[lang]/suivi">) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const t = dict(lang);
  const mine = await rememberedOrders();
  return (
    <div className="mx-auto flex max-w-md flex-col gap-8 px-4 pt-10">
      <div>
        <h1 className="text-[28px] font-bold leading-tight">{t.track.title}</h1>
      </div>
      <LookupForm lang={lang} />
      {mine.length > 0 && (
        <section>
          <h2 className="mb-2 text-[19px] font-bold">{t.track.yours}</h2>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-white">
            {mine.map((o) => (
              <li key={o.ref}>
                <Link href={href(lang, `/suivi/${o.ref}`)} className="flex items-center justify-between gap-3 px-4 py-3.5">
                  <span className="flex flex-col">
                    <span className="font-medium ltr-nums">{o.ref}</span>
                    <span className="text-[16px] text-muted">{t.track.status[o.status]} · <span className="ltr-nums">{formatTND(o.total, lang)}</span></span>
                  </span>
                  <IconChevron className="h-4 w-4 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <ForgetDevice lang={lang} hasOrders={mine.length > 0} />
    </div>
  );
}
