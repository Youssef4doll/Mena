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
 * A plain starting text, filled from the settings. The shop should have it
 * read by someone who knows Tunisian consumer law before launch.
 */
export default async function TermsRoute({ params }: PageProps<"/[lang]/conditions">) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const s = await getSettings();
  const shop = s.shop;
  return (
    <Prose title="Conditions générales de vente" french={lang === "ar"}>
      <p>
        Le site est édité par {shop.name}
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
