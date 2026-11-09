import type { HistoryRow } from "@/lib/ads/forecast-data";
import type { Calibration } from "@/lib/ads/forecast-model";
import { EVAL_MIN } from "@/lib/ads/forecast-model";
import { Badge, Card } from "@/components/admin/ui";
import { DeleteForecast } from "./DeleteForecast";
import { dt, num } from "./fmt";

/**
 * The saved forecasts against what their ads really did (the platform's
 * import, matched on the ad names, and the shop's own visits and orders),
 * and the correction the finished ones apply to the next forecasts.
 */

const STATUS: Record<HistoryRow["status"], { text: string; tone: "neutral" | "info" | "ok" | "warn" }> = {
  waiting: { text: "Pas encore commencée", tone: "neutral" },
  running: { text: "En cours", tone: "info" },
  done: { text: "Terminée", tone: "ok" },
  none: { text: "Aucune dépense importée", tone: "warn" },
};
const STAGE = { cpm: "CPM", ctr: "Clics", landing: "Visites par clic", orderRate: "Commandes par visite" } as const;
const ratio = (x: number) => `×${x.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}`;
const per1000 = (x: number | null | undefined) => (x == null ? "—" : (x * 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 }));

export function History({ rows, calibration }: { rows: HistoryRow[]; calibration: Calibration }) {
  const done = rows.filter((r) => r.status === "done" && r.evaluation?.inRange != null);
  const inside = done.filter((r) => r.evaluation!.inRange).length;
  const corrections = Object.entries(calibration).filter(([, v]) => v && Math.abs(v.factor - 1) > 0.005);
  return (
    <Card
      title="Prévisions et vrais résultats"
      hint={`Les dépenses viennent de l'onglet Importer, les visites et commandes du site, sur les noms des publicités. Une étape est comparée à partir de ${num(EVAL_MIN.impressions)} affichages, ${EVAL_MIN.clicks} clics ou ${EVAL_MIN.sessions} visites.`}
    >
      {!rows.length ? (
        <p className="text-sm text-muted">Aucune prévision enregistrée. Enregistrez celle de votre prochain test : une fois ses dépenses importées, elle corrigera les suivantes.</p>
      ) : (
        <>
          <p className="mb-3 text-sm text-ink">
            {done.length ? (
              <>
                Justesse : <strong>{inside}</strong> prévision{inside > 1 ? "s" : ""} terminée{inside > 1 ? "s" : ""} sur {done.length} dans sa fourchette de commandes par dinar dépensé.
              </>
            ) : (
              "Pas encore de prévision terminée avec des dépenses importées."
            )}{" "}
            {corrections.length > 0 && <>Correction appliquée aux chiffres publics : {corrections.map(([k, v]) => `${STAGE[k as keyof typeof STAGE] ?? k} ${ratio(v!.factor)} (${v!.forecasts})`).join(", ")}.</>}
          </p>
          <div className="relative overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="bg-sand/60 text-xs text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Produit</th>
                  <th className="px-3 py-2 font-medium">Plan</th>
                  <th className="px-3 py-2 font-medium">État</th>
                  <th className="px-3 py-2 font-medium">Prévu</th>
                  <th className="px-3 py-2 font-medium">Réel</th>
                  <th className="px-3 py-2 font-medium">Écarts (réel ÷ prévu)</th>
                  <th className="px-3 py-2 font-medium">
                    <span className="sr-only">Supprimer</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line align-top">
                {rows.map((r) => {
                  const f = r.forecast;
                  const e = r.evaluation;
                  return (
                    <tr key={r.id}>
                      <td className="px-3 py-2 text-ink">
                        {r.productName}
                        <span className="block text-xs text-muted">
                          {r.adNames.join(", ")}
                          {r.mode === "manual" ? " · claude.ai" : ""}
                        </span>
                      </td>
                      <td className="px-3 py-2 tabular-nums text-ink-2">
                        {r.startDay}, {r.days} j
                        <span className="block text-xs">{dt(f?.daily)} par jour</span>
                      </td>
                      <td className="px-3 py-2">
                        <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].text}</Badge>
                        {e?.inRange != null && <span className={`block text-xs ${e.inRange ? "text-olive" : "text-clay"}`}>{e.inRange ? "Dans la fourchette" : "Hors fourchette"}</span>}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-ink-2">
                        {f?.orders ? `${num(f.orders.p50)} commandes (${num(f.orders.p10)} à ${num(f.orders.p90)})` : "—"}
                        {f?.ordersPerDinar && <span className="block text-xs">{per1000(f.ordersPerDinar.p10)} à {per1000(f.ordersPerDinar.p90)} pour 1 000 DT</span>}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-ink-2">
                        {r.actual ? (
                          <>
                            {num(r.actual.orders)} commandes, {dt(r.actual.spend)}
                            <span className="block text-xs">{per1000(e?.ordersPerDinar)} pour 1 000 DT</span>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-ink-2">{e?.checks.length ? e.checks.map((c) => `${STAGE[c.stage]} ${ratio(c.ratio)}`).join(" · ") : "—"}</td>
                      <td className="px-3 py-2">
                        <DeleteForecast id={r.id} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}
