import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { dict, href, isLang, pageMeta } from "@/i18n";
import { getSettings } from "@/lib/settings";
import { hasFreeDeliveryOffers } from "@/lib/catalog";
import { formatTND } from "@/lib/money";
import { GOVERNORATES, deliversEverywhere, governorateLabel } from "@/lib/governorates";
import { deliveryRangeLabel } from "@/lib/delivery";
import { IconCash, IconPhone, IconReturn, IconShield } from "@/components/shop/Icons";
import { Prose } from "../Prose";

export async function generateMetadata({ params }: PageProps<"/[lang]/livraison-retours">): Promise<Metadata> {
  return pageMeta((await params).lang, "/livraison-retours", (t) => t.footer.deliveryReturns);
}

/** Built from the delivery settings: the fee and the times shown are the ones the checkout uses. */
export default async function DeliveryRoute({ params }: PageProps<"/[lang]/livraison-retours">) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const t = dict(lang);
  const [s, freeOffers] = await Promise.all([getSettings(), hasFreeDeliveryOffers()]);
  const ar = lang === "ar";
  const sep = ar ? "، " : ", ";
  const everywhere = deliversEverywhere(s.delivery.zones);
  const on = GOVERNORATES.filter((g) => s.delivery.zones[g.id]?.enabled !== false);
  const off = GOVERNORATES.filter((g) => s.delivery.zones[g.id]?.enabled === false);

  // The delivery times, by group of governorates with the same range: a few lines instead of 24.
  const groups = new Map<string, { min: number; max: number; ids: string[] }>();
  for (const g of on) {
    const z = s.delivery.zones[g.id];
    const min = z?.minDays ?? 0;
    const max = Math.max(min, z?.maxDays ?? 0);
    const key = `${min}-${max}`;
    const row = groups.get(key) ?? { min, max, ids: [] };
    row.ids.push(g.id);
    groups.set(key, row);
  }
  const largest = Math.max(0, ...[...groups.values()].map((r) => r.ids.length));
  const rows = [...groups.values()].sort((a, b) => Number(a.ids.length === largest) - Number(b.ids.length === largest) || a.min - b.min);
  const who = (r: { ids: string[] }) =>
    rows.length === 1 && off.length === 0
      ? ar ? "كل الولايات" : "Tous les gouvernorats"
      : r.ids.length === largest && r.ids.length > 6
        ? ar ? "باقي الولايات" : "Autres gouvernorats"
        : r.ids.map((id) => governorateLabel(id, lang)).join(sep);
  const d = s.returns.days;

  return (
    <Prose title={t.footer.deliveryReturns}>
      <section className="rounded-[20px] border border-line">
        <div className="px-5 py-5">
          <p className="text-[16px] text-muted">{t.product.deliveryFee}</p>
          <p className="mt-1 whitespace-nowrap text-[30px] font-bold leading-none text-ink price-nums ltr-nums">{s.delivery.fee === 0 ? t.product.free : formatTND(s.delivery.fee, lang)}</p>
          <p className="mt-2 text-[16px] text-ink-2">{everywhere ? (ar ? "نفس السوم لكل الولايات" : "Le même prix dans tous les gouvernorats") : ar ? "نفس السوم لكل الولايات اللي نوصلولها" : "Le même prix dans tous les gouvernorats desservis"}</p>
          {s.delivery.fee > 0 && freeOffers && <p className="mt-1 text-[16px] font-bold text-olive">{ar ? "ومجاني في العروض اللي مكتوب عليها «التوصيل مجاني»" : "Offerte sur les offres marquées « Livraison offerte »"}</p>}
          {s.delivery.freeThreshold != null && <p className="mt-1 text-[16px] font-bold text-olive">{t.product.freeFrom(formatTND(s.delivery.freeThreshold, lang))}</p>}
        </div>
        <div className="flex flex-col gap-3 border-t border-line px-5 py-4 text-[16px] leading-snug text-ink-2">
          <p className="flex items-start gap-3"><IconCash className="mt-0.5 h-5 w-5 shrink-0 text-sea" />{ar ? "تخلّص كاش كي تستلم" : "Paiement en espèces à la livraison"}</p>
          <p className="flex items-start gap-3"><IconPhone className="mt-0.5 h-5 w-5 shrink-0 text-sea" />{ar ? "نكلموك نأكدو قبل ما نبعثو" : "Nous vous appelons pour confirmer avant l'envoi"}</p>
          {s.delivery.openBeforePaying && <p className="flex items-start gap-3"><IconShield className="mt-0.5 h-5 w-5 shrink-0 text-sea" />{t.trust.openBeforePaying}</p>}
        </div>
      </section>

      <h2>{ar ? "مدة التوصيل" : "Délais de livraison"}</h2>
      <div className="divide-y divide-line rounded-[20px] border border-line">
        {rows.map((r) => (
          <div key={`${r.min}-${r.max}`} className="flex flex-col gap-0.5 px-5 py-4 md:flex-row md:items-baseline md:justify-between md:gap-6">
            <span className="text-[17px] font-bold leading-snug text-ink">{who(r)}</span>
            <span className="text-[16px] text-ink-2 md:shrink-0">{deliveryRangeLabel(r.min, r.max, lang)}</span>
          </div>
        ))}
      </div>
      {off.length > 0 && (
        <p className="text-[16px] text-muted">
          {ar ? "ما نوصلوش توّا لـ: " : "Pas encore livrés : "}
          {off.map((g) => governorateLabel(g.id, lang)).join(sep)}
        </p>
      )}
      <p className="text-[15px] text-muted">{ar ? "تتحسب من نهار تأكيد الطلبية." : "À compter de la confirmation de la commande."}</p>

      <h2>{ar ? "الإرجاع" : "Retours"}</h2>
      <p>{ar ? `ترجّع المنتوج خلال ${d} ${d > 10 ? "يوم" : "أيام"} من الاستلام، في حالتو وفي الكرتونة متاعو.` : `Retour possible sous ${d} jours après réception, produit intact et dans son emballage.`}</p>
      <Link href={href(lang, "/suivi")} className="inline-flex min-h-12 w-fit items-center gap-2 rounded-full border border-ink/60 bg-white px-6 text-[17px] font-bold text-ink hover:bg-sand">
        <IconReturn className="h-5 w-5" />
        {t.track.returnTitle}
      </Link>
    </Prose>
  );
}
