import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLang, pageMeta } from "@/i18n";
import { getSettings } from "@/lib/settings";
import { formatTND } from "@/lib/money";
import { formatPhone, normalizePhone } from "@/lib/phone";
import { Prose } from "../Prose";

export async function generateMetadata({ params }: PageProps<"/[lang]/conditions">): Promise<Metadata> {
  return pageMeta((await params).lang, "/conditions", (t) => t.footer.terms);
}

/**
 * A plain starting text, filled from the settings, in both languages. The shop should have it
 * read by someone who knows Tunisian consumer law before launch.
 */
export default async function TermsRoute({ params }: PageProps<"/[lang]/conditions">) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const s = await getSettings();
  const shop = s.shop;
  const phone = shop.phone ? formatPhone(normalizePhone(shop.phone) || shop.phone) : "";
  if (lang === "ar")
    return (
      <Prose title="شروط البيع">
        <p>
          ينشر هذا الموقع {shop.legalName || shop.name}
          {shop.legalId && <>، المعرّف الجبائي <bdi>{shop.legalId}</bdi></>}
          {shop.address && <>، {shop.address}</>}.{phone && <> الهاتف: <bdi dir="ltr">{phone}</bdi>.</>}
          {shop.email && <> البريد الإلكتروني: <bdi>{shop.email}</bdi>.</>}
        </p>
        <h2>الطلبية</h2>
        <p>تُسجَّل الطلبية عند تأكيدها على الموقع. نتصل بك بعد ذلك بالهاتف أو على واتساب لتأكيدها. يمكن إلغاء الطلبية التي لم يتمّ تأكيدها.</p>
        <h2>الأسعار</h2>
        <p>الأسعار معروضة بالدينار التونسي، وتشمل كل الأداءات. معلوم التوصيل <bdi>{formatTND(s.delivery.fee, "ar")}</bdi> مهما كانت الولاية، ويظهر قبل تأكيد الطلبية. المبلغ الجملي المعروض عند الطلب هو المبلغ الذي تدفعه.</p>
        <h2>الدفع</h2>
        <p>يتمّ الدفع نقدًا عند الاستلام.</p>
        <h2>التوصيل</h2>
        <p>آجال التوصيل المذكورة هي الآجال المعتادة، تُحتسب من تاريخ تأكيد الطلبية، وليست تاريخًا مضمونًا. التفاصيل في صفحة التوصيل والإرجاع.</p>
        <h2>حقّ الإرجاع</h2>
        <p>طبقًا للقانون عدد 83 لسنة 2000 المتعلّق بالمبادلات والتجارة الإلكترونية، يمكنك العدول عن الشراء في أجل {s.returns.days} {s.returns.days > 10 ? "يومًا" : "أيام"} من تاريخ استلام المنتوج. يجب إرجاع المنتوج في حالته الأصلية. يتمّ استرجاع المبلغ بعد استلام المنتوج والتثبّت منه.</p>
        <h2>الشكايات</h2>
        <p>لأيّ سؤال أو شكاية، اتصل بنا{s.contact.whatsapp ? " على واتساب" : ""}{phone ? <> على الرقم <bdi dir="ltr">{phone}</bdi></> : ""}.</p>
      </Prose>
    );
  return (
    <Prose title="Conditions générales de vente">
      <p>
        Le site est édité par {shop.legalName || shop.name}
        {shop.legalId && <>, matricule fiscal {shop.legalId}</>}
        {shop.address && <>, {shop.address}</>}.{shop.phone && <> Téléphone : {formatPhone(normalizePhone(shop.phone) || shop.phone)}.</>}
        {shop.email && <> E-mail : {shop.email}.</>}
      </p>
      <h2>Commande</h2>
      <p>La commande est enregistrée quand vous la validez sur le site. Nous vous contactons ensuite par téléphone ou WhatsApp pour la confirmer. Une commande non confirmée peut être annulée.</p>
      <h2>Prix</h2>
      <p>Les prix sont indiqués en dinars tunisiens, toutes taxes comprises. La livraison coûte {formatTND(s.delivery.fee, "fr")}, quel que soit le gouvernorat, et s&apos;affiche avant la validation. Le montant total affiché au moment de la commande est celui que vous payez.</p>
      <h2>Paiement</h2>
      <p>Le paiement se fait en espèces à la livraison.</p>
      <h2>Livraison</h2>
      <p>Les délais indiqués sont des délais habituels, à partir de la confirmation de la commande, et non une date garantie. Le détail est sur la page Livraison et retours.</p>
      <h2>Droit de retour</h2>
      <p>Conformément à la loi n° 2000-83 relative aux échanges et au commerce électroniques, vous pouvez vous rétracter dans un délai de {s.returns.days} jours à compter de la réception du produit. Le produit doit être retourné dans son état d&apos;origine. Le remboursement intervient après réception et vérification du produit.</p>
      <h2>Réclamations</h2>
      <p>Pour toute question ou réclamation, contactez-nous{s.contact.whatsapp ? " sur WhatsApp" : ""}{shop.phone ? ` au ${formatPhone(normalizePhone(shop.phone) || shop.phone)}` : ""}.</p>
    </Prose>
  );
}
