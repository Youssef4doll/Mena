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
        <h1 className="text-[30px] leading-tight">{t.thanks.title}</h1>
        <div className="rounded-2xl border border-line bg-white px-6 py-3">
          <p className="text-sm uppercase tracking-[0.14em] text-muted">{t.thanks.ref}</p>
          <p className="mt-1 text-2xl tracking-wider ltr-nums" data-testid="order-ref">{ref}</p>
        </div>
      </div>

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
              className="flex items-center gap-3 rounded-2xl bg-[#1f9d55] p-4 text-white"
            >
              <IconWhatsApp className="h-7 w-7 shrink-0" />
              <span className="flex flex-col">
                <span className="font-semibold">{t.thanks.confirmNow}</span>
                <span className="text-sm text-white/85">{t.thanks.confirmNowSub}</span>
              </span>
            </a>
          )}
          <div className="rounded-2xl border border-line bg-white p-5">
            <ul className="flex flex-col gap-2 text-sm">
              {o.items.map((i) => (
                <li key={i.id} className="flex justify-between gap-3">
                  <span>
                    <span className="ltr-nums">{i.qty} × </span>
                    {pick(lang, i.name, i.product?.nameAr)}
                    {i.variantName && <span className="text-muted"> · {i.variantName}</span>}
                    {i.offerLabel && <span className="text-muted"> · {i.offerLabel}</span>}
                  </span>
                  <span className="ltr-nums">{formatTND(i.lineTotal, lang)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex justify-between border-t border-line pt-3 font-semibold">
              <span>{o.paymentMethod === "COD" ? t.track.toPay : t.cart.total}</span>
              <span className="ltr-nums">{formatTND(o.total, lang)}</span>
            </div>
          </div>
        </>
      )}

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-muted">{t.thanks.next}</h2>
        <ol className="flex flex-col gap-3">
          {t.thanks.steps.map((s, i) => (
            <li key={s} className="flex gap-3 text-[15px]">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sea-soft text-sm font-semibold text-sea ltr-nums">{i + 1}</span>
              <span className="pt-0.5 text-ink-2">{s}</span>
            </li>
          ))}
        </ol>
        {settings.notify.smsOnPlaced && settings.notify.smsUrl && <p className="mt-4 text-sm text-muted">{t.thanks.sms}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <Link href={href(lang, o ? `/suivi/${o.ref}` : "/suivi")} className="flex h-12 items-center justify-center rounded-full bg-sea font-medium text-white">
          {t.thanks.track}
        </Link>
        <Link href={href(lang, "/boutique")} className="flex h-12 items-center justify-center rounded-full border border-line font-medium">
          {t.thanks.keepShopping}
        </Link>
      </div>
    </div>
  );
}
