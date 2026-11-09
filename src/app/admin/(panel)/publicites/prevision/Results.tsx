"use client";

import type { ForecastResult } from "@/lib/ads/forecast-plan";
import { DRAWS, FACTOR_MAX, FACTOR_MIN, FACTOR_SIGMA } from "@/lib/ads/forecast-model";
import { VERDICT_LABELS } from "@/lib/ads/forecast-prompt";
import { Badge, btn } from "@/components/admin/ui";
import { dt, dtFine, num, pct, spread } from "./fmt";

/**
 * The forecast as read: the advice first, then the plan's ranges, where each
 * stage's number comes from (the shop's own counts, public pages, the
 * correction from past forecasts), each creative's outlook, the plan at
 * other budgets, and the model's assumptions. Every range is the 80 % range
 * of the simulation: one time in five, reality falls outside it.
 */

const TONE = { good: "border-olive/40 bg-olive-soft text-olive", warn: "border-[#e8c66a] bg-[#fff3d6] text-[#8a5a00]", bad: "border-clay/40 bg-clay-soft text-clay", info: "border-line bg-white text-ink" } as const;
const BASIS = { shop: "Vos chiffres", public: "Chiffres publics", both: "Vos chiffres + publics" } as const;

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "ok" | "warn" | "danger" }) {
  const c = tone === "warn" ? "text-[#8a5a00]" : tone === "danger" ? "text-clay" : tone === "ok" ? "text-olive" : "text-ink";
  return (
    <div className="min-w-0 rounded-2xl border border-line bg-white p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-[20px] font-semibold tabular-nums ${c}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}

export function Results({ r, onUseDaily }: { r: ForecastResult; onUseDaily: (daily: number) => void }) {
  const m = r.sim.metrics;
  const cpd = m.costPerDelivered;
  const ceiling = r.offer.maxCostPerDelivered;
  const p = r.sim.probProfit;
  const isNum = (x: number) => (Number.isFinite(x) ? x : Infinity);
  return (
    <div className="flex flex-col gap-4" data-testid="forecast-result">
      <ul className="flex flex-col gap-2">
        {r.advice.map((a) => (
          <li key={a.text} className={`rounded-xl border px-3 py-2 text-sm ${TONE[a.tone]}`}>
            {a.text}
          </li>
        ))}
      </ul>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-6">
        <Tile label="Dépense" value={dt(r.total)} sub={`${dt(r.daily)} par jour`} />
        <Tile label="Commandes" value={m.orders ? num(m.orders.p50) : "—"} sub={m.orders ? `${num(m.orders.p10)} à ${num(m.orders.p90)}` : "Il manque un chiffre"} />
        <Tile label="Colis livrés" value={m.delivered ? num(m.delivered.p50) : "—"} sub={m.delivered ? `${num(m.delivered.p10)} à ${num(m.delivered.p90)}` : undefined} />
        <Tile
          label="Coût par commande livrée"
          value={cpd ? dt(cpd.p50) : "—"}
          sub={cpd ? `${dt(cpd.p10)} à ${Number.isFinite(cpd.p90) ? dt(cpd.p90) : "beaucoup plus"}${ceiling != null ? ` · plafond ${dt(ceiling)}` : ""}` : undefined}
          tone={cpd && ceiling != null ? (isNum(cpd.p50) <= ceiling ? "ok" : "danger") : undefined}
        />
        <Tile label="Bénéfice après publicité" value={m.profit ? dt(m.profit.p50) : "—"} sub={m.profit ? `${dt(m.profit.p10)} à ${dt(m.profit.p90)}` : "Un coût manque"} tone={m.profit ? (m.profit.p50 >= 0 ? "ok" : "danger") : undefined} />
        <Tile label="Chances d'être rentable" value={p == null ? "—" : `${Math.round(p * 100)} %`} sub={`sur ${num(r.sim.draws)} scénarios`} tone={p == null ? undefined : p >= 0.6 ? "ok" : p >= 0.35 ? "warn" : "danger"} />
      </div>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-ink">D&apos;où viennent les chiffres</h3>
        <div className="relative overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-sand/60 text-xs text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Étape</th>
                <th className="px-3 py-2 font-medium">Utilisé</th>
                <th className="px-3 py-2 font-medium">Vos chiffres</th>
                <th className="px-3 py-2 font-medium">Chiffres publics</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {r.stages.map((s) => {
                const f = s.stage === "cpm" ? dtFine : pct;
                return (
                  <tr key={s.stage} className="align-top">
                    <td className="px-3 py-2 text-ink">{s.label}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {s.value ? (
                        <>
                          <span className="font-medium text-ink">{f(s.value.median)}</span> <span className="text-muted">({f(s.value.low)} à {f(s.value.high)})</span>
                          {s.basis && <span className="block text-xs text-muted">{BASIS[s.basis]}</span>}
                        </>
                      ) : (
                        <Badge tone="danger">Manque</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-ink-2">{s.shop ?? <span className="text-muted">Pas encore</span>}</td>
                    <td className="px-3 py-2 text-ink-2">
                      {s.public ? (
                        <>
                          {f(s.public.low)} à {f(s.public.high)} <span className="text-muted">({s.public.marketLabel})</span>
                          {s.calibration != null && <span className="block text-xs text-[#8a5a00]">Corrigé ×{s.calibration.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} d&apos;après vos prévisions passées</span>}
                          <span className="block">
                            {s.public.sources.map((src) => (
                              <a key={src.url} href={src.url} target="_blank" rel="noreferrer noopener" className="me-2 text-xs text-sea underline underline-offset-2">
                                {src.title.length > 50 ? `${src.title.slice(0, 50)}…` : src.title}
                              </a>
                            ))}
                          </span>
                        </>
                      ) : (
                        <span className="text-muted">Aucun coché</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {r.creatives.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-ink">Chaque publicité, seule</h3>
          <div className="relative overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-sand/60 text-xs text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Publicité</th>
                  <th className="px-3 py-2 font-medium">Lecture de Claude</th>
                  <th className="px-3 py-2 font-medium">Clics par affichage</th>
                  <th className="px-3 py-2 font-medium">Commandes par visite</th>
                  <th className="px-3 py-2 font-medium">Coût par commande</th>
                  <th className="px-3 py-2 font-medium">Coût par livrée</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line tabular-nums">
                {r.creatives.map((c) => (
                  <tr key={c.id}>
                    <td className="px-3 py-2 text-ink">{c.label}</td>
                    <td className="px-3 py-2">
                      {c.reviewed ? (
                        <span className="text-ink-2">
                          {c.verdict && VERDICT_LABELS[c.verdict]} · ×{c.ctrFactor.toLocaleString("fr-FR")} / ×{c.convFactor.toLocaleString("fr-FR")}
                        </span>
                      ) : (
                        <Badge tone="warn">Pas lue</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2">{pct(c.ctr)}</td>
                    <td className="px-3 py-2">{pct(c.orderRate)}</td>
                    <td className="px-3 py-2">{dt(c.costPerOrder)}</td>
                    <td className={`px-3 py-2 ${c.costPerDelivered != null && ceiling != null ? (c.costPerDelivered <= ceiling ? "text-olive" : "text-clay") : ""}`}>{dt(c.costPerDelivered)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1 text-xs text-muted">Valeurs médianes, pour classer les publicités entre elles : seul le test dira la vérité.</p>
        </section>
      )}

      {r.options.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-ink">Le même plan à d&apos;autres budgets</h3>
          <div className="relative overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-sand/60 text-xs text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Par jour</th>
                  <th className="px-3 py-2 font-medium">Jours pour juger</th>
                  <th className="px-3 py-2 font-medium">Commandes</th>
                  <th className="px-3 py-2 font-medium">Livrées</th>
                  <th className="px-3 py-2 font-medium">Coût par livrée</th>
                  <th className="px-3 py-2 font-medium">Bénéfice</th>
                  <th className="px-3 py-2 font-medium">Rentable</th>
                  <th className="px-3 py-2 font-medium">
                    <span className="sr-only">Choisir</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line tabular-nums">
                {r.options.map((o) => (
                  <tr key={o.daily} className={o.daily === r.test?.daily ? "bg-sea-soft/50" : o.daily === r.daily ? "bg-sand/40" : ""}>
                    <td className="px-3 py-2 text-ink">
                      {dt(o.daily)}
                      {o.daily === r.test?.daily && <span className="block text-xs text-sea-2">Budget de test</span>}
                      {o.daily === r.daily && <span className="block text-xs text-muted">Votre plan</span>}
                    </td>
                    <td className="px-3 py-2">{o.daysToVerdict ?? "—"}</td>
                    <td className="px-3 py-2">{spread(o.orders, num)}</td>
                    <td className="px-3 py-2">{spread(o.delivered, num)}</td>
                    <td className="px-3 py-2">{spread(o.costPerDelivered, dt, "aucune livrée dans la moitié des cas")}</td>
                    <td className="px-3 py-2">{spread(o.profit, dt)}</td>
                    <td className="px-3 py-2">{o.probProfit == null ? "—" : `${Math.round(o.probProfit * 100)} %`}</td>
                    <td className="px-3 py-2">
                      {o.daily !== r.daily && (
                        <button type="button" className={`${btn.ghost} h-9 px-3 text-[13px]`} onClick={() => onUseDaily(o.daily)}>
                          Utiliser
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1 text-xs text-muted">Sur {r.test?.days ?? "les"} jours du plan. Le modèle ne suppose aucune baisse de rendement quand le budget monte : à gros budget, la réalité est souvent moins bonne. Augmentez par paliers de 20 à 30 %.</p>
        </section>
      )}

      <details className="rounded-xl border border-line px-3 py-2 text-sm text-ink-2">
        <summary className="flex min-h-10 cursor-pointer items-center font-medium text-ink">Comment la prévision est calculée</summary>
        <ul className="mt-1 list-disc ps-5">
          <li>{num(DRAWS)} scénarios tirés au hasard (toujours les mêmes pour le même plan) : les fourchettes montrent 8 scénarios sur 10.</li>
          <li>Chaque étape part des chiffres publics cochés (le marché le plus proche), corrigés par vos prévisions passées, puis vos propres chiffres prennent le dessus à mesure qu&apos;ils s&apos;accumulent.</li>
          <li>
            La lecture de Claude multiplie les clics et les commandes de chaque publicité (de ×{FACTOR_MIN.toLocaleString("fr-FR")} à ×{FACTOR_MAX.toLocaleString("fr-FR")}), avec une incertitude selon sa certitude (±{Math.round((Math.exp(FACTOR_SIGMA.high) - 1) * 100)} % à ±{Math.round((Math.exp(FACTOR_SIGMA.low) - 1) * 100)} %).
          </li>
          <li>Dans un ensemble, les publicités comptent à parts égales ; en vrai, Meta pousse la meilleure, ce qui peut faire un peu mieux.</li>
          <li>Le bénéfice compte le produit, le transporteur pour chaque colis envoyé et le retour pour chaque colis refusé.</li>
        </ul>
      </details>
    </div>
  );
}
