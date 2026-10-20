import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";
import { MAX_EXPORT_ROWS, MAX_ROW_DAYS } from "@/lib/ads/platform-csv";
import { Card } from "@/components/admin/ui";
import { ExportImport } from "./ExportImport";

export const metadata = { title: "Importer · Publicités" };

/**
 * "Importer": the spend, impressions, clicks and purchases of a Meta or
 * TikTok export, read in the browser (platform-csv.ts), previewed against the
 * campaigns the site knows, then saved by importAdSpend, which checks every
 * row again. Typing by hand stays on "Dépenses pub".
 */
export default async function ImportPage() {
  await requireAdmin();
  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-sm text-ink-2">
        Déposez l&apos;export du gestionnaire de publicités : les dépenses, impressions, clics et achats arrivent ici sans rien retaper. Importer deux fois le même export remplace ses lignes, sans compter deux fois. Pour saisir un montant à la main : <Link href="/admin/depenses" className="text-sea underline">Dépenses pub</Link>.
      </p>
      <ExportImport />
      <Card title="Quel export télécharger">
        <div className="grid gap-4 text-sm text-ink-2 md:grid-cols-2">
          <div>
            <h3 className="mb-1 font-medium text-ink">Meta (Facebook, Instagram)</h3>
            <ol className="list-decimal space-y-1 ps-5">
              <li>Gestionnaire de publicités, onglet Publicités, la période voulue.</li>
              <li>Répartition : Temps, par jour.</li>
              <li>Colonnes : montant dépensé, impressions, couverture, clics sur un lien, achats.</li>
              <li>Exporter le tableau, format CSV.</li>
            </ol>
          </div>
          <div>
            <h3 className="mb-1 font-medium text-ink">TikTok</h3>
            <ol className="list-decimal space-y-1 ps-5">
              <li>Ads Manager, Campagne, niveau Publicité, la période voulue.</li>
              <li>Ventilation par jour.</li>
              <li>Colonnes : coût, impressions, clics (destination), couverture, paiement complet.</li>
              <li>Exporter, format CSV.</li>
            </ol>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted">
          Au plus {MAX_EXPORT_ROWS.toLocaleString("fr-FR")} lignes par fichier et {MAX_ROW_DAYS} jours par ligne. Le niveau publicité permet de comparer les créatives ; le nom de la publicité doit être celui du lien (utm_content).
        </p>
      </Card>
    </div>
  );
}
