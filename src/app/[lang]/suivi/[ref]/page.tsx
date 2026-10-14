import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { dict, href, isLang, pick } from "@/i18n";
import { accessibleOrder } from "@/lib/order-access";
import { customerOrderView } from "@/lib/order-view";
import { getSettings } from "@/lib/settings";
import { formatTND } from "@/lib/money";
import { governorateLabel } from "@/lib/governorates";
import { TrackView } from "@/components/shop/TrackView";
import { ReturnForm, ReviewForm } from "@/components/shop/AfterSale";
import { IconWhatsApp } from "@/components/shop/Icons";

export const metadata: Metadata = { robots: { index: false } };

const STEPS = ["PENDING", "CONFIRMED", "SUPPLIER_ORDERED", "SHIPPED", "DELIVERED"] as const;

export default async function OrderRoute({ params, searchParams }: PageProps<"/[lang]/suivi/[ref]">) {
  const { lang, ref } = await params;
  if (!isLang(lang)) notFound();
  const t = dict(lang);
  const id = await accessibleOrder(ref);
  if (!id) redirect(href(lang, "/suivi"));
  const [o, settings, sp] = await Promise.all([customerOrderView(id), getSettings(), searchParams]);
  if (!o) notFound();

  const stepIndex = STEPS.indexOf(o.status as (typeof STEPS)[number]);
  const ended = ["REFUSED", "RETURNED", "CANCELLED"].includes(o.status);
  const deliveredAt = o.deliveredAt ? new Date(o.deliveredAt) : null;
  const returnOpen = o.returns[0] && ["REQUESTED", "ACCEPTED", "RECEIVED"].includes(o.returns[0].status);
  // eslint-disable-next-line react-hooks/purity -- one render per request
  const canReturn = o.status === "DELIVERED" && deliveredAt && Date.now() - deliveredAt.getTime() < settings.returns.days * 86_400_000 && !returnOpen;
  const reviewable = o.status === "DELIVERED" ? o.items.filter((i) => i.productId && !i.review) : [];
  const dateFmt = (d: string) => new Date(d).toLocaleDateString(lang === "ar" ? "ar-TN" : "fr-FR", { day: "numeric", month: "long" });

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 px-4 pt-8">
      <TrackView name="tracking_viewed" props={{ status: o.status }} />
      <div>
        <p className="text-[15px] text-muted">{t.thanks.ref}</p>
        <h1 className="text-[28px] font-bold tracking-wide ltr-nums">{o.ref}</h1>
        <p className="mt-1 text-[16px] text-muted">{dateFmt(o.createdAt)}</p>
      </div>

      {sp.paiement === "ok" && <p className="rounded-xl bg-olive-soft px-4 py-3 text-[16px] text-olive">{t.track.paymentOk}</p>}
      {sp.paiement === "echec" && <p className="rounded-xl bg-clay-soft px-4 py-3 text-[16px] text-clay">{t.track.paymentFail}</p>}

      <div className="rounded-2xl border border-line bg-white p-5">
        <p className={`text-[22px] font-bold ${ended ? "text-clay" : "text-ink"}`}>{t.track.status[o.status]}</p>
        {!ended && (
          <ol className="mt-4 flex flex-col gap-0">
            {STEPS.map((s, i) => {
              const done = i <= stepIndex;
              return (
                <li key={s} className="flex gap-3">
                  <span className="flex flex-col items-center">
                    <span className={`mt-1 h-3.5 w-3.5 rounded-full ${done ? "bg-sea" : "border-2 border-line bg-white"}`} />
                    {i < STEPS.length - 1 && <span className={`w-px flex-1 ${i < stepIndex ? "bg-sea" : "bg-line"}`} />}
                  </span>
                  <span className={`pb-4 text-[16px] ${done ? "text-ink" : "text-muted"}`}>
                    {t.track.timeline[i]}
                    {s === "CONFIRMED" && o.confirmedAt && <span className="text-muted"> · {dateFmt(o.confirmedAt)}</span>}
                    {s === "SHIPPED" && o.shippedAt && <span className="text-muted"> · {dateFmt(o.shippedAt)}</span>}
                    {s === "DELIVERED" && o.deliveredAt && <span className="text-muted"> · {dateFmt(o.deliveredAt)}</span>}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
        {(o.carrier || o.trackingNumber) && (
          <dl className="mt-2 grid grid-cols-2 gap-3 border-t border-line pt-3 text-[16px]">
            {o.carrier && (
              <div>
                <dt className="text-[16px] text-muted">{t.track.carrier}</dt>
                <dd>{o.carrier}</dd>
              </div>
            )}
            {o.trackingNumber && (
              <div>
                <dt className="text-[16px] text-muted">{t.track.tracking}</dt>
                <dd className="ltr-nums">{o.trackingNumber}</dd>
              </div>
            )}
          </dl>
        )}
      </div>

      <div className="rounded-2xl border border-line bg-white p-5">
        <h2 className="mb-3 text-[19px] font-bold">{t.track.items}</h2>
        <ul className="flex flex-col gap-3">
          {o.items.map((i) => (
            <li key={i.id} className="flex items-center gap-3 text-[16px]">
              <span className="relative h-14 w-12 shrink-0 overflow-hidden rounded-lg bg-sand">
                {i.product?.images[0] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/img/${i.product.images[0].mediaId}/128`} alt="" className="h-full w-full object-cover" />
                )}
              </span>
              <span className="flex-1">
                {i.product ? <Link href={href(lang, `/produit/${i.product.slug}`)}>{pick(lang, i.name, i.product.nameAr)}</Link> : i.name}
                {i.variantName && <span className="block text-[16px] text-muted">{i.variantName}</span>}
                {i.offerLabel && <span className="block text-[16px] text-muted">{pick(lang, i.offerLabel, i.offerLabelAr)}</span>}
              </span>
              <span className="shrink-0 text-end">
                <span className="block text-[16px] text-muted ltr-nums">× {i.qty}</span>
                <span className="whitespace-nowrap price-nums ltr-nums">{formatTND(i.lineTotal, lang)}</span>
              </span>
            </li>
          ))}
        </ul>
        <dl className="mt-4 flex flex-col gap-1 border-t border-line pt-3 text-[16px]">
          <div className="flex justify-between text-muted">
            <dt>{t.cart.delivery}</dt>
            <dd className="ltr-nums">{o.deliveryFee === 0 ? t.product.free : formatTND(o.deliveryFee, lang)}</dd>
          </div>
          {o.discount > 0 && (
            <div className="flex justify-between text-olive">
              <dt>{t.checkout.discount}</dt>
              <dd className="ltr-nums">−{formatTND(o.discount, lang)}</dd>
            </div>
          )}
          <div className="flex justify-between text-[19px] font-bold">
            <dt>{o.paymentStatus === "PAID" ? t.track.paid : t.track.toPay}</dt>
            <dd className="ltr-nums">{formatTND(o.total, lang)}</dd>
          </div>
        </dl>
        <p className="mt-3 text-[16px] text-muted">
          {t.track.deliveryTo} {[o.city, governorateLabel(o.governorate, lang)].filter(Boolean).join(lang === "ar" ? "، " : ", ")}
        </p>
      </div>

      {reviewable.length > 0 && (
        <div id="avis" className="rounded-2xl border border-line bg-white p-5">
          <h2 className="text-[20px] font-bold">{t.track.reviewTitle}</h2>
          <p className="mb-4 mt-1 text-[16px] text-muted">{t.track.reviewSub}</p>
          <div className="flex flex-col gap-6">
            {reviewable.map((i) => (
              <ReviewForm key={i.id} lang={lang} orderRef={o.ref} itemId={i.id} productName={pick(lang, i.name, i.product?.nameAr)} defaultName={o.firstName} autoFocus={sp.avis === "1"} />
            ))}
          </div>
        </div>
      )}

      {returnOpen && <p className="rounded-xl bg-sea-soft px-4 py-3 text-[16px] text-sea-2">{t.track.returnOpen}</p>}
      {canReturn && <ReturnForm lang={lang} orderRef={o.ref} days={settings.returns.days} />}

      {settings.contact.whatsapp && (
        <a href={`https://wa.me/216${settings.contact.whatsapp}?text=${encodeURIComponent(`${t.track.help} ${o.ref}`)}`} target="_blank" rel="noopener" className="flex min-h-14 items-center justify-center gap-2 rounded-full border border-field bg-white text-[17px] font-bold text-ink hover:bg-sand">
          <IconWhatsApp className="h-5 w-5 text-wa" />
          {t.track.help}
        </a>
      )}
    </div>
  );
}
