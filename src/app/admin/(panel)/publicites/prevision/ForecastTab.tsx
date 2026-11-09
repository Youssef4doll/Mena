"use client";

import { useState, useTransition } from "react";
import type { BriefProductOption } from "@/lib/ads/brief-data";
import type { BenchStore } from "@/lib/ads/forecast-data";
import type { ReviewResult } from "@/lib/ads/forecast-prompt";
import type { ForecastResult, PlanInput } from "@/lib/ads/forecast-plan";
import { suggestAdName, suggestCampaign } from "@/lib/ads/utm";
import { Card, btn, input as inputCls, label } from "@/components/admin/ui";
import { forecastProduct, runForecast, saveForecast, type ProductData } from "./actions";
import { Creatives, type AdItem, type AdSetItem } from "./Creatives";
import { Figures } from "./Figures";
import { Results } from "./Results";
import { dt, parseDt } from "./fmt";

/**
 * The "Prévision" tab in the browser: pick the product and the offer the ads
 * push, add the real ads and have Claude read them, tick the public figures,
 * set the plan (ad sets, daily budgets, days), then forecast. The server
 * computes everything from the database; this only holds the plan and the
 * pictures. A saved forecast is compared with the real results later.
 */

const DEFAULT_DAYS = 4;
const firstSet = (): AdSetItem[] => [{ id: "E1", name: "Ensemble 1", daily: "20" }];

export function ForecastTab({ options, initial, store: initialStore, aiReady, today }: { options: BriefProductOption[]; initial: ProductData; store: BenchStore | null; aiReady: boolean; today: string }) {
  const [data, setData] = useState(initial);
  const [store, setStore] = useState(initialStore);
  const [offerKey, setOfferKey] = useState(initial.offers[0]?.key ?? "unit");
  const [ads, setAds] = useState<AdItem[]>([]);
  const [sets, setSets] = useState<AdSetItem[]>(firstSet);
  const [review, setReview] = useState<ReviewResult | null>(null);
  const [mode, setMode] = useState<"api" | "manual">(aiReady ? "api" : "manual");
  const [days, setDays] = useState(String(DEFAULT_DAYS));
  const [startDay, setStartDay] = useState(today);
  const [maxLoss, setMaxLoss] = useState("");
  const [campaign, setCampaign] = useState(suggestCampaign(initial.input.product.slug, today));
  const [result, setResult] = useState<ForecastResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [loading, start] = useTransition();
  const [running, run] = useTransition();
  const p = data.input.product;
  const offer = data.offers.find((o) => o.key === offerKey) ?? data.offers[0];

  function pick(id: string) {
    start(async () => {
      setError(null);
      try {
        const r = await forecastProduct(id);
        if (!r.ok) return setError(r.error);
        setData(r.data);
        setOfferKey(r.data.offers[0]?.key ?? "unit");
        setAds([]);
        setReview(null);
        setResult(null);
        setSaved(null);
        setCampaign(suggestCampaign(r.data.input.product.slug, today));
        const url = new URL(window.location.href);
        url.searchParams.set("produit", id);
        window.history.replaceState(null, "", url);
      } catch {
        setError("Chargement impossible : vérifiez la connexion, puis réessayez.");
      }
    });
  }

  function plan(override?: { daily: number }): PlanInput | string {
    const d = Math.round(Number(days));
    if (!Number.isInteger(d) || d < 1 || d > 60) return "Nombre de jours : de 1 à 60.";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDay)) return "Date de début illisible.";
    const loss = parseDt(maxLoss);
    if (maxLoss.trim() && loss == null) return "Perte maximum illisible.";
    const budgets = sets.map((s) => parseDt(s.daily));
    if (budgets.some((b) => b == null || b <= 0)) return "Chaque ensemble a besoin d'un budget par jour.";
    const total = budgets.reduce((s: number, b) => s + (b ?? 0), 0);
    const scale = override && total > 0 ? override.daily / total : 1;
    const byId = new Map((review?.creatives ?? []).map((c) => [c.id, c]));
    return {
      productId: p.id,
      offerKey: offer?.key ?? "unit",
      days: d,
      startDay,
      maxLoss: loss,
      campaign: campaign.trim(),
      adSets: sets.map((s, i) => ({ id: s.id, name: s.name, creativeIds: ads.filter((a) => a.adSet === s.id).map((a) => a.id), dailyBudget: Math.round((budgets[i]! * scale) / 1000) * 1000 })),
      creatives: ads.map((a) => {
        const r = byId.get(a.id);
        return { id: a.id, label: a.id, kind: a.prepared.kind, adName: a.adName.trim(), primaryText: a.primaryText, headline: a.headline, review: r ? { verdict: r.verdict, ctrFactor: r.ctrFactor, convFactor: r.convFactor, confidence: r.confidence } : null };
      }),
    };
  }

  function forecast(override?: { daily: number }) {
    const pl = plan(override);
    if (typeof pl === "string") return setError(pl);
    if (override) {
      // The budgets typed follow the choice, split as before.
      setSets((ss) => ss.map((s, i) => ({ ...s, daily: String(pl.adSets[i].dailyBudget / 1000) })));
    }
    run(async () => {
      setError(null);
      setSaved(null);
      try {
        const r = await runForecast(pl);
        if (!r.ok) return setError(r.error);
        setResult(r.result);
        requestAnimationFrame(() => document.getElementById("resultat")?.scrollIntoView({ behavior: "smooth", block: "start" }));
      } catch {
        setError("Prévision impossible : vérifiez la connexion, puis réessayez.");
      }
    });
  }

  function save() {
    const pl = plan();
    if (typeof pl === "string") return setError(pl);
    run(async () => {
      setError(null);
      try {
        // The full review (reasons, fixes) is kept with the plan; the pictures are not.
        const r = await saveForecast(pl, review, mode);
        if (!r.ok) return setError(r.error);
        setSaved("Prévision enregistrée. Elle sera comparée aux vrais résultats une fois les dépenses importées (onglet Importer).");
      } catch {
        setError("Enregistrement impossible : vérifiez la connexion, puis réessayez.");
      }
    });
  }

  function group(grouping: string[][]) {
    const next: AdSetItem[] = grouping.map((_, i) => ({ id: `E${i + 1}`, name: `Ensemble ${i + 1}`, daily: sets[i]?.daily ?? sets[0]?.daily ?? "20" }));
    const where = new Map(grouping.flatMap((g, i) => g.map((id) => [id, `E${i + 1}`] as const)));
    setSets(next.length ? next : firstSet());
    setAds((as) => as.map((a) => ({ ...a, adSet: where.get(a.id) ?? next[0]?.id ?? "E1" })));
  }

  const missingCosts = !offer || offer.productCost == null;

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <label className={`${label} min-w-0 flex-1 basis-64`}>
            Produit
            <select value={p.id} onChange={(e) => pick(e.target.value)} disabled={loading} className={inputCls}>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                  {o.active ? "" : " (hors ligne)"} · {o.orders} commande{o.orders > 1 ? "s" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className={`${label} min-w-0 basis-56`}>
            Offre mise en avant
            <select value={offerKey} onChange={(e) => (setOfferKey(e.target.value), setResult(null))} className={inputCls}>
              {data.offers.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label} · {dt(o.price)}
                </option>
              ))}
            </select>
          </label>
          {loading && <span className="flex h-10 items-center text-sm text-muted">Chargement…</span>}
        </div>
        {offer && (
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div className="rounded-xl border border-line px-3 py-2">
              <dt className="text-xs text-muted">Le client paie</dt>
              <dd className="tabular-nums text-ink">{dt(offer.revenue)}</dd>
            </div>
            <div className="rounded-xl border border-line px-3 py-2">
              <dt className="text-xs text-muted">Reste par commande livrée, avant publicité</dt>
              <dd className="tabular-nums text-ink">{dt(offer.margin)}</dd>
            </div>
            <div className="rounded-xl border border-line px-3 py-2">
              <dt className="text-xs text-muted">Publicité max par commande livrée</dt>
              <dd className="tabular-nums font-medium text-ink">{dt(offer.maxCostPerDelivered)}</dd>
            </div>
            <div className="rounded-xl border border-line px-3 py-2">
              <dt className="text-xs text-muted">Publicité max par commande passée</dt>
              <dd className="tabular-nums text-ink">{dt(offer.maxCpa)}</dd>
            </div>
          </dl>
        )}
        {missingCosts && (
          <p className="mt-2 text-sm text-clay">
            Coût fournisseur inconnu : sans lui, pas de seuil de rentabilité. <a href={`/admin/produits/${p.id}`} className="underline">Renseignez-le sur la fiche</a>.
          </p>
        )}
        {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
      </Card>

      <section id="publicites" className="scroll-mt-16">
        <Card title="Vos publicités" hint="Les vraies images et vidéos que vous allez payer. Claude les regarde comme un acheteur média : accroche, produit, preuve, offre, cohérence avec la page, format téléphone.">
          <Creatives
            input={data.input}
            photos={data.photos}
            ads={ads}
            sets={sets}
            aiReady={aiReady}
            review={review}
            suggestName={(n) => suggestAdName(p.slug, "pub", n)}
            onAds={(a) => (setAds(a), setResult(null))}
            onReview={(r, m) => (setReview(r), setMode(m), setResult(null))}
            onGroup={group}
          />
        </Card>
      </section>

      <section id="chiffres" className="scroll-mt-16">
        <Card title="Chiffres publics" hint="Avant d'avoir vos propres résultats, la prévision s'appuie sur des chiffres publiés (Tunisie d'abord, puis Maghreb, région, monde), chacun avec sa page. Ne cochez que ce que vous avez vérifié.">
          <Figures store={store} aiReady={aiReady} onChange={(s) => (setStore(s), setResult(null))} />
        </Card>
      </section>

      <section id="plan" className="scroll-mt-16">
        <Card title="Le plan" hint="Comme dans le gestionnaire de publicités : les ensembles, leur budget par jour et les publicités de chacun.">
          <div className="flex flex-col gap-3">
            {sets.map((s, i) => (
              <div key={s.id} className="flex flex-wrap items-end gap-2 rounded-xl border border-line p-2">
                <label className={`${label} basis-48`}>
                  Ensemble
                  <input className={inputCls} value={s.name} onChange={(e) => setSets(sets.map((x) => (x.id === s.id ? { ...x, name: e.target.value } : x)))} />
                </label>
                <label className={`${label} w-36`}>
                  Budget par jour (DT)
                  <input inputMode="decimal" className={inputCls} value={s.daily} onChange={(e) => setSets(sets.map((x) => (x.id === s.id ? { ...x, daily: e.target.value } : x)))} />
                </label>
                <span className="flex h-10 items-center text-sm text-muted">
                  {ads.filter((a) => a.adSet === s.id).map((a) => a.id).join(", ") || "Aucune publicité"}
                </span>
                {sets.length > 1 && (
                  <button
                    type="button"
                    className="ms-auto flex h-10 items-center text-[13px] text-clay underline"
                    onClick={() => {
                      const rest = sets.filter((x) => x.id !== s.id);
                      setSets(rest);
                      setAds(ads.map((a) => (a.adSet === s.id ? { ...a, adSet: rest[0].id } : a)));
                    }}
                  >
                    Retirer
                  </button>
                )}
                {i === sets.length - 1 && sets.length < 8 && (
                  <button
                    type="button"
                    className={`${btn.ghost} ${sets.length > 1 ? "" : "ms-auto"}`}
                    onClick={() => {
                      let n = 1;
                      while (sets.some((x) => x.id === `E${n}`)) n++;
                      setSets([...sets, { id: `E${n}`, name: `Ensemble ${n}`, daily: s.daily }]);
                    }}
                  >
                    Ajouter un ensemble
                  </button>
                )}
              </div>
            ))}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <label className={label}>
                Jours
                <input inputMode="numeric" className={inputCls} value={days} onChange={(e) => setDays(e.target.value)} />
              </label>
              <label className={label}>
                Début
                <input type="date" className={inputCls} value={startDay} onChange={(e) => setStartDay(e.target.value)} />
              </label>
              <label className={label}>
                Perte maximum acceptée (DT)
                <input inputMode="decimal" placeholder="Aucune" className={inputCls} value={maxLoss} onChange={(e) => setMaxLoss(e.target.value)} />
              </label>
              <label className={label}>
                Campagne
                <input className={inputCls} value={campaign} onChange={(e) => setCampaign(e.target.value)} />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={btn.primary} disabled={running || loading} onClick={() => forecast()}>
                {running ? "Calcul…" : "Prévoir"}
              </button>
              {!ads.length && <span className="text-sm text-muted">Sans publicité, la prévision compte une publicité ordinaire.</span>}
            </div>
          </div>
        </Card>
      </section>

      {result && (
        <section id="resultat" className="scroll-mt-16" aria-busy={running}>
          <Card title={`Prévision : ${p.name}`} hint="Des fourchettes, pas des promesses : 8 scénarios sur 10 tombent dedans. Elle s'affine à chaque test enregistré et importé.">
            <Results r={result} onUseDaily={(daily) => forecast({ daily })} />
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
              <button type="button" className={btn.sea} disabled={running} onClick={save}>
                Enregistrer cette prévision
              </button>
              <span className="text-xs text-muted">Utilisez les mêmes noms de publicités dans le gestionnaire : c&apos;est ainsi que les vrais résultats se retrouvent.</span>
            </div>
            {saved && (
              <p role="status" className="mt-2 text-sm text-olive">
                {saved}
              </p>
            )}
          </Card>
        </section>
      )}
    </>
  );
}
