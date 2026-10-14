import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { dict, isLang, pageMeta } from "@/i18n";
import { getSettings } from "@/lib/settings";
import { formatTND } from "@/lib/money";
import { GOVERNORATES, governorateLabel } from "@/lib/governorates";
import { deliveryRangeLabel } from "@/lib/delivery";
import { Prose } from "../Prose";

export async function generateMetadata({ params }: PageProps<"/[lang]/livraison-retours">): Promise<Metadata> {
  return pageMeta((await params).lang, "/livraison-retours", (t) => t.footer.deliveryReturns);
}

/** Built from the delivery settings: the table customers read is the one the checkout charges. */
export default async function DeliveryRoute({ params }: PageProps<"/[lang]/livraison-retours">) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const t = dict(lang);
  const s = await getSettings();
  const ar = lang === "ar";
  return (
    <Prose title={t.footer.deliveryReturns}>
      <p>
        {ar
          ? "نوصلو للدار في الولايات المذكورة أسفله. الدفع عند الاستلام، كاش. نكلموك قبل ما نبعثو باش نأكدو الطلبية."
          : "Nous livrons à domicile dans les gouvernorats ci-dessous. Le paiement se fait à la livraison, en espèces. Nous vous appelons avant d'expédier pour confirmer la commande."}
      </p>
      {s.delivery.freeThreshold != null && <p className="font-medium">{t.product.freeFrom(formatTND(s.delivery.freeThreshold, lang))}</p>}
      <table>
        <thead>
          <tr>
            <th>{t.checkout.governorate}</th>
            <th>{t.product.deliveryFee}</th>
            <th>{t.product.deliveryDelay}</th>
          </tr>
        </thead>
        <tbody>
          {GOVERNORATES.map((g) => {
            const z = s.delivery.zones[g.id];
            return (
              <tr key={g.id}>
                <td>{governorateLabel(g.id, lang)}</td>
                <td className="ltr-nums">{z?.enabled ? formatTND(z.fee, lang) : "—"}</td>
                <td>{z?.enabled ? deliveryRangeLabel(z.minDays, z.maxDays, lang) : t.product.notDelivered}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-sm text-muted">{ar ? "المدة تبدا من تأكيد الطلبية، أيام العمل." : "Délais comptés à partir de la confirmation de la commande, en jours ouvrés."}</p>
      <h2>{ar ? "الإرجاع" : "Retours"}</h2>
      <p>
        {ar
          ? `عندك ${s.returns.days} أيام من نهار الاستلام باش تطلب إرجاع، من صفحة تتبّع الطلبية ولا على واتساب. المنتوج لازم يرجع في حالتو وفي الكرتونة متاعو.`
          : `Vous avez ${s.returns.days} jours après la réception pour demander un retour, depuis la page de suivi de votre commande ou sur WhatsApp. Le produit doit revenir dans son état d'origine, dans son emballage.`}
      </p>
      {s.delivery.openBeforePaying && <p>{t.trust.openBeforePaying}.</p>}
    </Prose>
  );
}
