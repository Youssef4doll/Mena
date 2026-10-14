import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { dict, href, isLang, pick } from "@/i18n";
import { accessibleOrder } from "@/lib/order-access";
import { customerOrderView } from "@/lib/order-view";
import { getSettings } from "@/lib/settings";
import { formatTND } from "@/lib/money";
import { PurchasePixel } from "@/components/shop/PurchasePixel";
import { IconCheck, IconWhatsApp } from "@/components/shop/Icons";
import { ThanksPhone } from "@/components/shop/ThanksPhone";

export const metadata: Metadata = { robots: { index: false } };

export default async function ThanksRoute({ params }: PageProps<"/[lang]/commande/merci/[ref]">) {
  const { lang, ref } = await params;
  if (!isLang(lang)) notFound();
  const t = dict(lang);
  const [id, settings] = await Promise.all([accessibleOrder(ref), getSettings()]);
  const o = id ? await customerOrderView(id) : null;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 px-4 pb-10 pt-10">
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-olive-soft text-olive">
          <IconCheck className="h-8 w-8" />
        </span>
        <h1 className="text-[28px] font-bold leading-tight">{o?.firstName ? t.thanks.titleName(o.firstName) : t.thanks.title}</h1>
        <div className="rounded-2xl border-2 border-dashed border-sea/40 bg-sea-soft px-6 py-4">
          <p className="text-[15px] font-bold text-sea-2">{t.thanks.ref}</p>
          <p className="mt-1 text-[28px] font-bold tracking-wider ltr-nums" data-testid="order-ref">{ref}</p>
        </div>
      </div>
      {o && o.status === "PENDING" && <ThanksPhone lang={lang} firstName={o.firstName} whatsapp={settings.contact.whatsapp || null} orderRef={o.ref} />}

      {o && (
        <>
          <PurchasePixel
            ref_={o.ref}
            total={o.total}
            items={o.items.map((i) => ({ id: i.productId ?? i.id, name: i.name, price: i.unitPrice, qty: i.qty }))}
            enabled={settings.tracking.purchaseAt === "placed"}
          />
          {settings.contact.whatsapp && o.status === "PENDING" && (
            <a
              href={`https://wa.me/216${settings.contact.whatsapp}?text=${encodeURIComponent(t.thanks.confirmText(o.ref))}`}
              target="_blank"
              rel="noopener"
              className="flex min-h-16 items-center gap-3 rounded-2xl bg-wa p-4 text-white"
            >
              <IconWhatsApp className="h-7 w-7 shrink-0" />
              <span className="flex flex-col">
                <span className="text-[18px] font-bold">{t.thanks.confirmNow}</span>
                <span className="text-[15px] text-white">{t.thanks.confirmNowSub}</span>
              </span>
            </a>
          )}
          <div className="rounded-2xl border border-line bg-white p-5">
            <ul className="flex flex-col gap-2 text-[16px]">
              {o.items.map((i) => (
                <li key={i.id} className="flex justify-between gap-3">
                  <span>
                    <span className="ltr-nums">{i.qty} × </span>
                    {pick(lang, i.name, i.product?.nameAr)}
                    {i.variantName && <span className="text-muted"> · {i.variantName}</span>}
                    {i.offerLabel && <span className="text-muted"> · {pick(lang, i.offerLabel, i.offerLabelAr)}</span>}
                  </span>
                  <span className="shrink-0 whitespace-nowrap price-nums ltr-nums">{formatTND(i.lineTotal, lang)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex justify-between gap-3 border-t border-line pt-3 text-[20px] font-bold">
              <span>{o.paymentMethod === "COD" ? t.track.toPay : t.cart.total}</span>
              <span className="whitespace-nowrap price-nums ltr-nums">{formatTND(o.total, lang)}</span>
            </div>
          </div>
        </>
      )}

      <div>
        <h2 className="mb-3 text-[19px] font-bold">{t.thanks.next}</h2>
        <ol className="flex flex-col gap-3">
          {t.thanks.steps.map((s, i) => (
            <li key={s} className="flex gap-3 text-[17px]">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sea text-[17px] font-bold text-white">{i + 1}</span>
              <span className="pt-1.5 text-ink-2">{s}</span>
            </li>
          ))}
        </ol>
        {settings.notify.smsOnPlaced && settings.notify.smsUrl && <p className="mt-4 text-[16px] text-muted">{t.thanks.sms}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <Link href={href(lang, o ? `/suivi/${o.ref}` : "/suivi")} className="flex min-h-14 items-center justify-center rounded-2xl bg-navy text-[17px] font-bold text-white hover:bg-night">
          {t.thanks.track}
        </Link>
        <Link href={href(lang, "/boutique")} className="flex min-h-14 items-center justify-center rounded-2xl border-2 border-field bg-white text-[17px] font-bold text-ink hover:bg-sand">
          {t.thanks.keepShopping}
        </Link>
      </div>
    </div>
  );
}
