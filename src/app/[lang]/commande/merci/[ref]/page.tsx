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
import { ContactLink } from "@/components/shop/ContactLink";
import { ThanksPhone } from "@/components/shop/ThanksPhone";

export const metadata: Metadata = { robots: { index: false } };

export default async function ThanksRoute({ params }: PageProps<"/[lang]/commande/merci/[ref]">) {
  const { lang, ref } = await params;
  if (!isLang(lang)) notFound();
  const t = dict(lang);
  const [id, settings] = await Promise.all([accessibleOrder(ref), getSettings()]);
  const o = id ? await customerOrderView(id) : null;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-4 pb-12 pt-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-olive-soft text-olive">
          <IconCheck className="h-7 w-7" />
        </span>
        <h1 className="text-[26px] font-bold leading-tight">{o?.firstName ? t.thanks.titleName(o.firstName) : t.thanks.title}</h1>
        <p className="text-[16px] text-muted">
          {t.thanks.ref}{" "}
          <strong className="text-[19px] tracking-wider text-ink ltr-nums" data-testid="order-ref">
            {ref}
          </strong>
        </p>
        {o && o.status === "PENDING" && <ThanksPhone lang={lang} firstName={o.firstName} whatsapp={settings.contact.whatsapp || null} orderRef={o.ref} shopPhone={settings.shop.phone || null} />}
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
            <ContactLink
              kind="whatsapp"
              where="thanks"
              href={`https://wa.me/216${settings.contact.whatsapp}?text=${encodeURIComponent(t.thanks.confirmText(o.ref))}`}
              className="flex min-h-14 items-center justify-center gap-2 rounded-full bg-wa px-6 text-[17px] font-bold text-white"
            >
              <IconWhatsApp className="h-6 w-6 shrink-0" />
              {t.thanks.confirmNow}
            </ContactLink>
          )}
          <div className="rounded-2xl border border-line bg-white p-5">
            <ul className="flex flex-col gap-2 text-[16px]">
              {o.items.map((i) => (
                <li key={i.id} className="flex justify-between gap-3">
                  <span>
                    <span className="ltr-nums">{i.qty} × </span>
                    {pick(lang, i.name, i.product?.nameAr)}
                    {i.variantName && <span className="text-muted"> · {pick(lang, i.variantName, i.variant?.name === i.variantName ? i.variant.nameAr : null)}</span>}
                    {i.offerLabel && <span className="text-muted"> · {pick(lang, i.offerLabel, i.offerLabelAr)}</span>}
                  </span>
                  <span className="shrink-0 whitespace-nowrap price-nums ltr-nums">{formatTND(i.lineTotal, lang)}</span>
                </li>
              ))}
            </ul>
            {o.discount > 0 && (
              <div className="mt-2 flex justify-between gap-3 text-[16px] text-olive">
                <span>{t.checkout.discount}</span>
                <span className="whitespace-nowrap price-nums ltr-nums">−{formatTND(o.discount, lang)}</span>
              </div>
            )}
            <div className="mt-2 flex justify-between gap-3 text-[16px] text-muted">
              <span>{t.cart.delivery}</span>
              <span className="whitespace-nowrap price-nums ltr-nums">{o.deliveryFee === 0 ? t.product.free : formatTND(o.deliveryFee, lang)}</span>
            </div>
            <div className="mt-3 flex justify-between gap-3 border-t border-line pt-3 text-[20px] font-bold">
              <span>{o.paymentMethod === "COD" ? t.track.toPay : t.cart.total}</span>
              <span className="whitespace-nowrap price-nums ltr-nums">{formatTND(o.total, lang)}</span>
            </div>
          </div>
        </>
      )}

      <Link href={href(lang, o ? `/suivi/${o.ref}` : "/suivi")} className="flex min-h-14 items-center justify-center rounded-full border border-field bg-white text-[17px] font-bold text-ink hover:bg-sand">
        {t.thanks.track}
      </Link>
      <Link href={href(lang, "/boutique")} className="-mt-2 inline-flex min-h-11 items-center self-center text-[16px] text-sea underline underline-offset-4">
        {t.thanks.keepShopping}
      </Link>
    </div>
  );
}
