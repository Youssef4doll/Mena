import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLang } from "@/i18n";
import { getSettings } from "@/lib/settings";
import { Prose } from "../Prose";

export const metadata: Metadata = { title: "Confidentialité" };

export default async function PrivacyRoute({ params }: PageProps<"/[lang]/confidentialite">) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const s = await getSettings();
  const pixels = [s.tracking.metaPixelId && "Meta (Facebook, Instagram)", s.tracking.tiktokPixelId && "TikTok", s.tracking.ga4Id && "Google Analytics"].filter(Boolean);
  return (
    <Prose title="Confidentialité et cookies">
      <p>{s.shop.name} traite vos données conformément à la loi organique n° 2004-63 sur la protection des données à caractère personnel.</p>
      <h2>Ce que nous gardons</h2>
      <ul>
        <li>Pour une commande : nom, téléphone, adresse de livraison, contenu de la commande. Ils servent à confirmer, livrer et suivre la commande.</li>
        <li>Si vous commencez une commande sans la terminer, nous pouvons vous recontacter une fois sur le numéro saisi.</li>
        <li>Une mesure d&apos;audience interne au site, sans cookie publicitaire : pages vues, ajouts au panier, recherches, avec un identifiant anonyme.</li>
      </ul>
      <h2>Cookies publicitaires</h2>
      {pixels.length > 0 ? (
        <p>Si vous les acceptez, nous utilisons les outils de mesure de {pixels.join(", ")} pour mesurer nos publicités. Si vous refusez, ils ne sont pas chargés et le site fonctionne de la même façon.</p>
      ) : (
        <p>Le site n&apos;utilise actuellement aucun cookie publicitaire.</p>
      )}
      <h2>Vos droits</h2>
      <p>Vous pouvez demander l&apos;accès, la correction ou la suppression de vos données en nous contactant{s.shop.email ? ` à ${s.shop.email}` : ""}{s.shop.phone ? ` ou au ${s.shop.phone}` : ""}.</p>
    </Prose>
  );
}
