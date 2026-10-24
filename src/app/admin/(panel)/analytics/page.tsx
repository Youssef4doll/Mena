import Link from "next/link";
import { getAnalytics, getLive } from "@/lib/analytics";
import { parseRange, PRESETS, delta, ratio } from "@/lib/analytics-range";
import { Card, PageTitle, btn, input } from "@/components/admin/ui";
import { BarList, ColumnChart, LineChart, TableView } from "@/components/admin/charts";
import { VIZ, fmt } from "@/lib/viz";
import { LivePanel } from "@/components/admin/LivePanel";
import { isExcluded } from "@/lib/internal";
import { ExcludeDevice } from "./ExcludeDevice";

export const metadata = { title: "Analytics" };

const pct = (v: number | null) => fmt(v, "pct");

export default async function AnalyticsPage({ searchParams }: PageProps<"/admin/analytics">) {
  const sp = await searchParams;
  const r = parseRange({ p: str(sp.p), from: str(sp.from), to: str(sp.to) });
  const [a, live] = await Promise.all([getAnalytics(r), getLive()]);
  const k = a.kpis;
  const p = a.prev;
  const conv = ratio(k.orders, k.sessions);
  const convPrev = ratio(p.orders, p.sessions);
  const decided = k.orders - k.pending;
  const confirmRate = ratio(k.confirmed, decided);
  const refusalRate = ratio(k.refused, k.delivered + k.refused);
  const refusalPrev = ratio(p.refused, p.delivered + p.refused);
  const qs = `p=${r.key}${r.key === "custom" ? `&from=${str(sp.from)}&to=${str(sp.to)}` : ""}`;
  const insights = buildInsights(a);
  const hasTraffic = k.sessions > 0 || k.orders > 0;

  return (
    <div className="flex flex-col gap-4">
      <PageTitle title="Analytics" sub={`Données de première partie : mesurées par la boutique elle-même, sans service extérieur. Période : ${r.label}, comparée à la période précédente de même durée.`} />
      <ExcludeDevice excluded={await isExcluded()} />

      {/* One filter row, above everything it scopes. */}
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((x) => (
          <Link key={x.key} href={`/admin/analytics?p=${x.key}`} className={`rounded-full border px-3 py-1.5 text-[13px] ${r.key === x.key ? "border-ink bg-ink text-white" : "border-line bg-white"}`}>
            {x.key === r.key && "✓ "}{x.label}
          </Link>
        ))}
        <form action="/admin/analytics" className="flex items-center gap-1.5">
          <input type="hidden" name="p" value="custom" />
          <input type="date" name="from" defaultValue={str(sp.from)} className={`${input} h-9 w-[150px]`} aria-label="Du" required />
          <input type="date" name="to" defaultValue={str(sp.to)} className={`${input} h-9 w-[150px]`} aria-label="Au" required />
          <button className={`${btn.ghost} h-9`}>OK</button>
        </form>
        <details className="relative ms-auto">
          <summary className={`${btn.ghost} h-9 cursor-pointer list-none`}>Exporter CSV</summary>
          <div className="absolute end-0 z-20 mt-1 flex w-56 flex-col rounded-xl border border-line bg-white p-1 text-sm shadow-lift">
            {[
              ["daily", "Jour par jour"], ["funnel", "Entonnoir"], ["sources", "Sources"], ["campaigns", "Campagnes"], ["devices", "Appareils"],
              ["products", "Produits"], ["details", "Détails en images (téléphone)"], ["searches", "Recherches"], ["governorates", "Gouvernorats"], ["customers", "Clients"], ["cohorts", "Cohortes"], ["contacts", "Clics WhatsApp et téléphone"],
            ].map(([key, label]) => (
              <a key={key} href={`/admin/analytics/export?report=${key}&${qs}`} className="rounded-lg px-3 py-2 hover:bg-cream">{label}</a>
            ))}
          </div>
        </details>
      </div>

      <LivePanel initial={live} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Visiteurs" value={fmt(k.visitors, "int")} d={delta(k.visitors, p.visitors)} sub={`${fmt(k.sessions, "int")} visites`} />
        <Kpi label="Commandes" value={fmt(k.orders, "int")} d={delta(k.orders, p.orders)} sub={`${k.pending} à confirmer · ${k.cancelled} annulée(s)`} />
        <Kpi label="Taux de conversion" value={pct(conv)} d={conv != null && convPrev != null ? delta(conv, convPrev) : null} sub="commandes / visites" />
        <Kpi label="Panier moyen" value={fmt(k.aov, "tnd")} d={k.aov != null && p.aov != null ? delta(k.aov, p.aov) : null} sub="livraison comprise" />
        <Kpi label="CA commandé" value={fmt(k.bookedRevenue, "tnd")} d={delta(k.bookedRevenue, p.bookedRevenue)} sub="hors annulées" />
        <Kpi label="CA livré (encaissé)" value={fmt(k.deliveredRevenue, "tnd")} d={delta(k.deliveredRevenue, p.deliveredRevenue)} sub={`${k.delivered} livrée(s)`} />
        <Kpi label="Taux de confirmation" value={pct(confirmRate)} sub={`${k.confirmed} / ${decided} traitées`} />
        <Kpi label="Refus à la livraison" value={pct(refusalRate)} d={refusalRate != null && refusalPrev != null ? delta(refusalRate, refusalPrev) : null} upIsBad sub={`${k.refused} refusée(s)`} />
      </div>
      {k.marginKnownOrders > 0 && (
        <p className="text-sm text-ink-2">
          Marge produits sur les commandes livrées : <strong>{fmt(k.deliveredMargin, "tnd")}</strong> ({k.marginKnownOrders} commande(s) dont le coût fournisseur est connu, livraison non comprise).
        </p>
      )}

      <ProfitCard m={a.profit} />

      {insights.length > 0 && (
        <Card title="À retenir" hint="Ce que les chiffres de la période disent de faire.">
          <ul className="flex flex-col gap-2 text-sm">
            {insights.map((t, i) => (
              <li key={i} className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: VIZ.s1 }} /><span>{t}</span></li>
            ))}
          </ul>
        </Card>
      )}

      {!hasTraffic && (
        <p className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
          Pas encore de visites ni de commandes sur la période. Les graphiques se remplissent dès les premières visites.
        </p>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        <Card title="Visites par jour">
          <LineChart points={a.days.map((d) => ({ x: d.day, y: d.sessions }))} unit="int" name="Visites" />
          <TableView head={["Jour", "Visites", "Commandes", "Confirmées", "CA"]} rows={a.days.map((d) => [d.day, d.sessions, d.orders, d.confirmed, fmt(d.revenue, "tnd")])} />
        </Card>
        <Card title="Commandes par jour" hint="Hors annulées.">
          <ColumnChart points={a.days.map((d) => ({ x: d.day, y: d.orders }))} unit="int" name="Commandes" highlightMax />
        </Card>
        <Card title="Chiffre d'affaires commandé par jour">
          <LineChart points={a.days.map((d) => ({ x: d.day, y: d.revenue }))} unit="tnd" name="CA commandé" />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Entonnoir" hint="Visites uniques à chaque étape, puis commandes. Le pourcentage rouge est la perte depuis l'étape précédente : c'est elle qu'on répare.">
          <Funnel steps={a.funnel} />
          <TableView head={["Étape", "Nombre", "Depuis l'étape précédente", "Depuis les visites"]} rows={a.funnel.map((s, i) => [s.step, s.count, i ? pct(ratio(s.count, a.funnel[i - 1].count)) : "", pct(ratio(s.count, a.funnel[0].count))])} />
        </Card>
        <Card title="Appareils" hint="Visites et taux de conversion par type d'appareil (lu sur le serveur).">
          <BarList rows={a.devices.map((d) => ({ label: deviceLabel(d.device), value: d.sessions, sub: `${d.orders} cmd · ${pct(ratio(d.orders, d.sessions))}` }))} unit="int" />
          <TableView head={["Appareil", "Visites", "Commandes", "Conversion", "CA"]} rows={a.devices.map((d) => [deviceLabel(d.device), d.sessions, d.orders, pct(ratio(d.orders, d.sessions)), fmt(d.revenue, "tnd")])} />
        </Card>
      </div>

      <Card title="Sources de trafic" hint="Visites (sessions) et commandes par source. La source d'une visite sans lien de campagne est la dernière source connue du visiteur dans les 30 jours. Ajoutez utm_source, utm_medium et utm_campaign aux liens de vos publicités.">
        <SourceTable rows={a.sources} />
      </Card>
      {a.campaigns.length > 0 && (
        <Card title="Campagnes (utm_campaign)">
          <SourceTable rows={a.campaigns} campaign />
        </Card>
      )}

      <Card title="Produits" hint="Fiches vues (visites uniques), formulaires de commande commencés, commandes et CA sur la période.">
        <ProductTable rows={a.products} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Recherches sans résultat" hint="Ce que les clients cherchent et que la boutique n'a pas : des produits à ajouter.">
          {a.searches.none.length === 0 ? <p className="text-sm text-muted">Aucune.</p> : <BarList rows={a.searches.none.map((s) => ({ label: s.q, value: s.count }))} unit="int" />}
        </Card>
        <Card title="Catégories les plus ouvertes" hint="Ouvertures d'une catégorie (cartes de l'accueil, menu, liens) sur la période, et visiteurs différents.">
          {a.categories.length === 0 ? <p className="text-sm text-muted">Aucune.</p> : <BarList rows={a.categories.map((c) => ({ label: c.name, value: c.views, sub: `${c.visitors} visiteur(s)` }))} unit="int" />}
        </Card>
        <Card title="Recherches les plus fréquentes" hint={`${a.searches.total} recherche(s) sur la période.`}>
          {a.searches.top.length === 0 ? <p className="text-sm text-muted">Aucune.</p> : <BarList rows={a.searches.top.map((s) => ({ label: s.q, value: s.count, sub: `${s.results} résultat(s)` }))} unit="int" />}
        </Card>
      </div>

      <Card title="Livraison par gouvernorat" hint="Commandes de la période. Le taux de refus compte les colis refusés sur les colis arrivés au bout (livrés + refusés).">
        <GovTable rows={a.governorates} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Motifs de refus">
          {a.refusalReasons.length === 0 ? <p className="text-sm text-muted">Aucun refus sur la période.</p> : <BarList rows={a.refusalReasons.map((x) => ({ label: x.reason, value: x.count }))} unit="int" />}
        </Card>
        <Card title="Confirmation par téléphone">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-xs text-muted">Délai médian de confirmation</dt><dd className="text-xl font-semibold">{a.confirmation.medianHours == null ? "—" : a.confirmation.medianHours < 1 ? `${Math.round(a.confirmation.medianHours * 60)} min` : `${a.confirmation.medianHours.toFixed(1)} h`}</dd></div>
            <div><dt className="text-xs text-muted">Appels par commande appelée</dt><dd className="text-xl font-semibold">{a.confirmation.avgCalls == null ? "—" : a.confirmation.avgCalls.toFixed(1)}</dd></div>
            <div className="col-span-2"><dt className="text-xs text-muted">Annulées avant confirmation</dt><dd className="text-xl font-semibold">{a.confirmation.cancelledBeforeConfirm}</dd></div>
            <div><dt className="text-xs text-muted">Clics WhatsApp sur le site</dt><dd className="text-xl font-semibold">{a.contacts.whatsapp}</dd></div>
            <div><dt className="text-xs text-muted">Clics téléphone sur le site</dt><dd className="text-xl font-semibold">{a.contacts.phone}</dd></div>
          </dl>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Panier et commande rapide" hint="Où les commandes sont passées : le formulaire de la fiche produit, le même formulaire ouvert en fenêtre depuis la fiche, le bouton « Acheter maintenant » d'une carte (commande rapide), ou le panier. Visites : sessions distinctes.">
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div><dt className="text-xs text-muted">Commandes depuis la fiche</dt><dd className="text-xl font-semibold">{a.basket.orders.product}</dd></div>
            <div><dt className="text-xs text-muted">Commandes depuis la {ORIGINS.sheet.toLowerCase()}</dt><dd className="text-xl font-semibold">{a.basket.orders.sheet}</dd></div>
            <div><dt className="text-xs text-muted">Commandes rapides</dt><dd className="text-xl font-semibold">{a.basket.orders.quick}</dd></div>
            <div><dt className="text-xs text-muted">Commandes depuis le panier</dt><dd className="text-xl font-semibold">{a.basket.orders.cart}</dd></div>
            <div><dt className="text-xs text-muted">Visites avec ajout au panier</dt><dd className="text-xl font-semibold">{a.basket.added}</dd></div>
            <div><dt className="text-xs text-muted">Visites qui ont ouvert le panier</dt><dd className="text-xl font-semibold">{a.basket.viewed}</dd></div>
            {a.basket.orders.unknown > 0 && <div><dt className="text-xs text-muted">Origine non enregistrée (avant le 14 octobre)</dt><dd className="text-xl font-semibold">{a.basket.orders.unknown}</dd></div>}
          </dl>
        </Card>
        <Card title="Photos et vidéo" hint="Visites où le client a ouvert les photos en plein écran, ou lancé la vidéo d'un produit.">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-xs text-muted">Photos en plein écran</dt><dd className="text-xl font-semibold">{a.basket.zooms}</dd></div>
            <div><dt className="text-xs text-muted">Vidéos lancées</dt><dd className="text-xl font-semibold">{a.basket.videos}</dd></div>
          </dl>
        </Card>
      </div>

      <DetailsCard d={a.details} from={r.from} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Commandes par heure" hint="Heure de Tunis. Utile pour placer les appels de confirmation et les budgets publicitaires.">
          <ColumnChart points={a.hours.map((h) => ({ x: `${h.hour}h`, y: h.orders }))} unit="int" name="Commandes" days={false} highlightMax />
          <TableView head={["Heure", "Commandes"]} rows={a.hours.map((h) => [`${h.hour}h`, h.orders])} />
        </Card>
        <Card title="Commandes non terminées" hint="Formulaires commencés sans commande depuis plus d'une heure." aside={<Link href="/admin/paniers" className="text-sm text-sea underline">Relancer</Link>}>
          <dl className="grid grid-cols-3 gap-3 text-sm">
            <div><dt className="text-xs text-muted">Formulaires</dt><dd className="text-xl font-semibold">{a.abandoned.count}</dd></div>
            <div><dt className="text-xs text-muted">Valeur</dt><dd className="text-xl font-semibold">{fmt(a.abandoned.value, "tnd", true)}</dd></div>
            <div><dt className="text-xs text-muted">Avec numéro</dt><dd className="text-xl font-semibold">{a.abandoned.withPhone}</dd></div>
          </dl>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <Card title="Clients" hint="Une commande est « fidèle » quand le même numéro avait déjà commandé avant.">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-xs text-muted">Clients sur la période</dt><dd className="text-xl font-semibold">{a.customers.customers}</dd></div>
            <div><dt className="text-xs text-muted">Commandes de clients fidèles</dt><dd className="text-xl font-semibold">{a.customers.returning} <span className="text-sm font-normal text-muted">{pct(ratio(a.customers.returning, a.customers.orders))}</span></dd></div>
            <div className="col-span-2"><dt className="text-xs text-muted">Clients livrés au moins 2 fois (depuis le début)</dt><dd className="text-xl font-semibold">{a.customers.repeatersAllTime}</dd></div>
          </dl>
        </Card>
        <Card title="Rétention par cohorte" hint="Clients regroupés par mois de première commande ; part qui recommande 1, 2, 3… mois plus tard.">
          <CohortTable cohorts={a.cohorts} />
        </Card>
      </div>
    </div>
  );
}

function str(v: string | string[] | undefined) {
  return typeof v === "string" ? v : undefined;
}

/** Where an order was placed, as the order form tells it. */
const ORIGINS = { product: "Fiche produit", sheet: "Fenêtre de commande", quick: "Commande rapide", cart: "Panier" } as const;

/** "12 (34 %)": a share always with its count; "—" with nothing to divide by. */
function share(count: number, of: number) {
  return of > 0 ? `${fmt(count, "int")} (${pct(ratio(count, of))})` : "—";
}

function deviceLabel(d: string) {
  return ({ mobile: "Téléphone", desktop: "Ordinateur", tablet: "Tablette" } as Record<string, string>)[d] ?? "Inconnu";
}

function Kpi({ label, value, d, sub, upIsBad = false }: { label: string; value: string; d?: number | null; sub?: string; upIsBad?: boolean }) {
  const good = d == null || d === 0 ? null : upIsBad ? d < 0 : d > 0;
  return (
    <div className="min-w-0 rounded-2xl border border-line bg-white p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 truncate text-[24px] font-semibold text-ink">{value}</p>
      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
        {d != null && d !== 0 && (
          <span className="font-medium" style={{ color: good ? "#006300" : VIZ.critical }}>
            {d > 0 ? "▲" : "▼"} {fmt(Math.abs(d), "pct")}
          </span>
        )}
        {sub && <span className="truncate">{sub}</span>}
      </p>
    </div>
  );
}

function Funnel({ steps }: { steps: { key: string; step: string; count: number }[] }) {
  const max = Math.max(1, steps[0]?.count ?? 1, ...steps.map((s) => s.count));
  return (
    <ol className="flex flex-col gap-2.5">
      {steps.map((s, i) => {
        const prev = i > 0 ? steps[i - 1].count : null;
        const drop = prev ? 1 - s.count / prev : null;
        return (
          <li key={s.key}>
            <div className="mb-1 flex items-baseline justify-between text-[13px]">
              <span className="text-ink-2">{s.step}</span>
              <span className="tabular-nums">
                <strong className="text-ink">{fmt(s.count, "int")}</strong>
                {drop != null && drop > 0 && <span className="ms-2 text-xs" style={{ color: VIZ.critical }}>−{fmt(drop, "pct")}</span>}
              </span>
            </div>
            <div className="h-2.5 rounded-full bg-[#f0efec]">
              <div className="h-2.5 rounded-full" style={{ width: `${Math.max(s.count ? 1.5 : 0, (s.count / max) * 100)}%`, background: VIZ.s1 }} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function SourceTable({ rows, campaign = false }: { rows: import("@/lib/analytics").SourceRow[]; campaign?: boolean }) {
  if (rows.length === 0) return <p className="text-sm text-muted">Aucune donnée sur la période.</p>;
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <table className="w-full min-w-[680px] text-[13px]">
        <thead className="text-xs text-muted">
          <tr className="border-b border-line">
            <th className="py-2 text-start font-medium">{campaign ? "Source · campagne" : "Source"}</th>
            <th className="text-end font-medium">Visites</th>
            <th className="text-end font-medium">Commandes</th>
            <th className="text-end font-medium">Conversion</th>
            <th className="text-end font-medium">Confirmées</th>
            <th className="text-end font-medium">Livrées</th>
            <th className="text-end font-medium">Refus</th>
            <th className="text-end font-medium">CA livré</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line tabular-nums">
          {rows.map((s) => (
            <tr key={`${s.source}|${s.campaign}`}>
              <td className="py-2 pe-3">{s.source}{campaign && s.campaign && <span className="text-muted"> · {s.campaign}</span>}</td>
              <td className="text-end">{s.sessions}</td>
              <td className="text-end">{s.orders}</td>
              <td className="text-end font-medium">{fmt(ratio(s.orders, s.sessions), "pct")}</td>
              <td className="text-end">{s.confirmed}</td>
              <td className="text-end">{s.delivered}</td>
              <td className="text-end">{fmt(ratio(s.refused, s.delivered + s.refused), "pct")}</td>
              <td className="text-end">{fmt(s.revenue, "tnd")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProductTable({ rows }: { rows: import("@/lib/analytics").ProductRow[] }) {
  if (rows.length === 0) return <p className="text-sm text-muted">Aucune donnée sur la période.</p>;
  return (
    <div className="-mx-4 max-h-[520px] overflow-auto px-4 sm:mx-0 sm:px-0">
      <table className="w-full min-w-[640px] text-[13px]">
        <thead className="sticky top-0 bg-white text-xs text-muted">
          <tr className="border-b border-line">
            <th className="py-2 text-start font-medium">Produit</th>
            <th className="text-end font-medium">Vues</th>
            <th className="text-end font-medium">Formulaires</th>
            <th className="text-end font-medium">Commandes</th>
            <th className="text-end font-medium">Vue → commande</th>
            <th className="text-end font-medium">Unités</th>
            <th className="text-end font-medium">CA</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line tabular-nums">
          {rows.map((p) => {
            const c = ratio(p.orders, p.views);
            const flag = p.views >= 20 && p.orders === 0;
            return (
              <tr key={p.id}>
                <td className="py-2 pe-3">
                  <Link href={`/admin/produits/${p.id}`} className="hover:underline">{p.name}</Link>
                  {flag && <span className="ms-2 rounded-full bg-[#fff3d6] px-1.5 py-0.5 text-[11px] text-[#8a5a00]">⚠ vu sans être acheté</span>}
                </td>
                <td className="text-end">{p.views}</td>
                <td className="text-end">{p.forms}</td>
                <td className="text-end">{p.orders}</td>
                <td className="text-end">{fmt(c, "pct")}</td>
                <td className="text-end">{p.units}</td>
                <td className="text-end">{fmt(p.revenue, "tnd")}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function GovTable({ rows }: { rows: import("@/lib/analytics").GovRow[] }) {
  if (rows.length === 0) return <p className="text-sm text-muted">Aucune commande sur la période.</p>;
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <table className="w-full min-w-[600px] text-[13px]">
        <thead className="text-xs text-muted">
          <tr className="border-b border-line">
            <th className="py-2 text-start font-medium">Gouvernorat</th>
            <th className="text-end font-medium">Commandes</th>
            <th className="text-end font-medium">Livrées</th>
            <th className="text-end font-medium">Refusées</th>
            <th className="w-48 ps-4 text-start font-medium">Taux de refus</th>
            <th className="text-end font-medium">CA livré</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line tabular-nums">
          {rows.map((g) => {
            const rate = ratio(g.refused, g.delivered + g.refused);
            const level = rate == null ? null : rate >= 0.3 ? "critical" : rate >= 0.15 ? "warn" : "good";
            return (
              <tr key={g.governorate}>
                <td className="py-2 pe-3">{g.governorate}</td>
                <td className="text-end">{g.orders}</td>
                <td className="text-end">{g.delivered}</td>
                <td className="text-end">{g.refused}</td>
                <td className="ps-4">
                  {rate == null ? <span className="text-muted">pas encore de colis arrivé</span> : (
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-20 rounded-full bg-[#f0efec]"><span className="block h-2 rounded-full" style={{ width: `${Math.max(3, rate * 100)}%`, background: level === "critical" ? VIZ.critical : level === "warn" ? "#ec835a" : VIZ.good }} /></span>
                      <span>{fmt(rate, "pct")}</span>
                      <span className="text-[11px] text-muted">{level === "critical" ? "● élevé" : level === "warn" ? "● à surveiller" : "● bon"}</span>
                    </span>
                  )}
                </td>
                <td className="text-end">{fmt(g.revenue, "tnd")}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Sequential blue, one hue light→dark; the text inside a cell switches to white on the dark steps. */
const RAMP = ["#f4f8fd", "#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95"];

function CohortTable({ cohorts }: { cohorts: import("@/lib/analytics").Cohort[] }) {
  if (cohorts.length === 0) return <p className="text-sm text-muted">Les cohortes apparaissent après les premières commandes.</p>;
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <table className="w-full min-w-[460px] border-separate border-spacing-[2px] text-[12px] tabular-nums">
        <thead className="text-muted">
          <tr>
            <th className="text-start font-medium">Mois</th>
            <th className="text-end font-medium">Clients</th>
            {[1, 2, 3, 4, 5].map((m) => <th key={m} className="font-medium">M+{m}</th>)}
          </tr>
        </thead>
        <tbody>
          {cohorts.map((c) => (
            <tr key={c.month}>
              <td className="pe-2">{c.month}</td>
              <td className="pe-2 text-end">{c.size}</td>
              {c.retained.map((v, i) => {
                if (v == null) return <td key={i} className="rounded bg-[#fafaf8] text-center text-muted">·</td>;
                const r = c.size ? v / c.size : 0;
                const step = r === 0 ? 0 : Math.min(RAMP.length - 1, 1 + Math.floor(r * 10));
                return (
                  <td key={i} className="rounded py-1.5 text-center" style={{ background: RAMP[step], color: step >= 4 ? "#fff" : "#0b0b0b" }} title={`${v} client(s) sur ${c.size}`}>
                    {fmt(r, "pct")}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Plain sentences with a verb in them, from the period's own numbers. */
function buildInsights(a: import("@/lib/analytics").Analytics): string[] {
  const out: string[] = [];
  const f = a.funnel;
  // Leaks the site can fix stop at the order: confirmation and delivery happen by phone, after it.
  const order = f.findIndex((s) => s.key === "order");
  const leaks = f.slice(1, order + 1).map((s, i) => ({ from: f[i].step, to: s.step, drop: f[i].count >= 20 ? 1 - s.count / f[i].count : 0 }));
  const worst = leaks.reduce((x, y) => (y.drop > x.drop ? y : x), leaks[0]);
  if (worst && worst.drop > 0.5) out.push(`La plus grosse perte est entre « ${worst.from} » et « ${worst.to} » : ${fmt(worst.drop, "pct")} des visiteurs s'arrêtent là.`);
  const srcs = a.sources.filter((s) => s.sessions >= 50);
  if (srcs.length >= 2) {
    const best = srcs.reduce((x, y) => ((ratio(y.orders, y.sessions) ?? 0) > (ratio(x.orders, x.sessions) ?? 0) ? y : x));
    out.push(`« ${best.source} » convertit le mieux (${fmt(ratio(best.orders, best.sessions), "pct")} des visites deviennent des commandes).`);
  }
  const govs = a.governorates.filter((g) => g.delivered + g.refused >= 5).map((g) => ({ ...g, rate: g.refused / (g.delivered + g.refused) }));
  const badGov = govs.sort((x, y) => y.rate - x.rate)[0];
  if (badGov && badGov.rate >= 0.25) out.push(`${badGov.governorate} refuse ${fmt(badGov.rate, "pct")} des colis : confirmez ces commandes avec plus de soin, ou demandez un acompte.`);
  if (a.searches.none.length > 0) out.push(`${a.searches.none.length} recherche(s) n'ont rien trouvé, dont « ${a.searches.none[0].q} » (${a.searches.none[0].count} fois) : produits à sourcer.`);
  const viewedNotBought = a.products.filter((p) => p.views >= 20 && p.orders === 0);
  if (viewedNotBought.length > 0) out.push(`${viewedNotBought.length} produit(s) très vus sans aucune commande (ex. « ${viewedNotBought[0].name} ») : vérifiez prix, photos et description.`);
  if (a.abandoned.withPhone > 0) out.push(`${a.abandoned.withPhone} commande(s) commencée(s) et non terminée(s) avec un numéro, pour ${fmt(a.abandoned.value, "tnd")} : rappelez-les une fois sur WhatsApp.`);
  if (a.kpis.pending > 0) out.push(`${a.kpis.pending} commande(s) attendent encore leur appel de confirmation.`);
  return out;
}

const MISSING: Record<string, { text: string; href: string }> = {
  productCost: { text: "le coût fournisseur de certains produits livrés", href: "/admin/produits" },
  carrierCost: { text: "ce que le transporteur vous facture par colis", href: "/admin/parametres" },
  returnCost: { text: "ce que coûte un colis refusé ou retourné", href: "/admin/parametres" },
  adSpend: { text: "les dépenses publicitaires de la période", href: "/admin/depenses" },
};

/**
 * What the period leaves: the delivered orders' money minus every cost the
 * owner gave. A cost not given is named, never guessed.
 */
function ProfitCard({ m }: { m: Awaited<ReturnType<typeof getAnalytics>>["profit"] }) {
  const rows: [string, string, string?][] = [
    ["CA livré (encaissé)", fmt(m.revenue, "tnd"), `${m.delivered} commande(s) livrée(s)`],
    ["− Coût des produits", m.costUnknown ? "?" : fmt(m.productCost, "tnd"), m.costUnknown ? `${m.costUnknown} livrée(s) sans coût fournisseur` : undefined],
    ["− Transport", m.carrierCost == null ? "?" : fmt(m.carrierCost, "tnd"), `${m.parcels} colis envoyé(s)`],
    ["− Colis revenus", m.returnCost == null ? "?" : fmt(m.returnCost, "tnd"), `${m.backParcels} refusé(s) ou retourné(s)`],
    ["= Avant publicité", m.beforeAds == null ? "?" : fmt(m.beforeAds, "tnd")],
    ["− Publicité", m.adSpend == null ? "?" : fmt(m.adSpend, "tnd")],
  ];
  return (
    <Card title="Rentabilité" hint="Commandes passées sur la période. Le transport et les refus coûtent même quand la commande ne rapporte rien : c'est pourquoi on compte en commandes livrées.">
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <dl className="flex flex-col divide-y divide-line text-sm">
          {rows.map(([k, v, sub]) => (
            <div key={k} className="flex items-baseline justify-between gap-3 py-2">
              <dt>
                {k}
                {sub && <span className="block text-xs text-muted">{sub}</span>}
              </dt>
              <dd className="shrink-0 font-medium tabular-nums">{v}</dd>
            </div>
          ))}
          <div className="flex items-baseline justify-between gap-3 py-2 text-base">
            <dt className="font-semibold">Bénéfice après publicité</dt>
            <dd className={`shrink-0 font-semibold tabular-nums ${m.contribution != null && m.contribution < 0 ? "text-danger" : ""}`}>{m.contribution == null ? "?" : fmt(m.contribution, "tnd")}</dd>
          </div>
        </dl>
        <div className="flex flex-col gap-3 text-sm">
          <p>
            Coût publicitaire par commande livrée : <strong className="tabular-nums">{m.costPerDelivered == null ? "?" : fmt(m.costPerDelivered, "tnd")}</strong>
          </p>
          {m.open > 0 && (
            <p className="rounded-xl bg-[#fff8e6] p-3">
              {m.open} commande(s) de la période sont encore en cours (à confirmer, confirmées ou en route) : leur argent n&apos;est pas encore compté, alors qu&apos;une partie de la publicité l&apos;est. Le bénéfice d&apos;une période récente est donc provisoire.
            </p>
          )}
          {m.sources.length > 0 && (
            <TableView head={["Source", "Dépense", "Livrées", "Coût par livrée"]} rows={m.sources.map((x) => [x.source, fmt(x.spend, "tnd"), x.delivered, x.costPerDelivered == null ? "—" : fmt(x.costPerDelivered, "tnd")])} />
          )}
          {m.missing.length > 0 && (
            <div className="rounded-xl bg-cream p-3">
              <p className="font-medium">Pour un bénéfice exact, il manque :</p>
              <ul className="mt-1 list-disc ps-5">
                {m.missing.map((k) => (
                  <li key={k}>
                    <Link href={MISSING[k].href} className="underline underline-offset-2">
                      {MISSING[k].text}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

type DetailsRow = import("@/lib/analytics").DetailsRow;

/**
 * The long pictures on a phone: whether visits reach them and read them to
 * the end, how the bottom bar and the order sheet are used, and what became of
 * the orders of those visits. The deciding numbers are the last ones:
 * delivered orders per visit, and refusals.
 */
function DetailsCard({ d, from }: { d: import("@/lib/analytics").Analytics["details"]; from: Date }) {
  const t = d.total;
  // Before the first picture seen anywhere, the pictures were not measured: a visit then did not "miss" them.
  const since = d.since ? d.since.toLocaleString("fr-FR", { timeZone: "Africa/Tunis", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : null;
  const seen = (x: DetailsRow, k: "seen" | "ended") => (d.since ? share(x[k], x.sessions) : "—");
  const byOrigin = (x: DetailsRow) =>
    [...(Object.keys(ORIGINS) as (keyof typeof ORIGINS)[]).map((o) => [ORIGINS[o], x.orders[o]] as const), ["Origine non enregistrée", x.orders.other] as const].filter(([, v]) => v > 0).map(([l, v]) => `${l} ${v}`).join(" · ") || "—";
  const figures: [string, string, string?][] = [
    ["Visites de la fiche", fmt(t.sessions, "int")],
    ["Ont vu les images", seen(t, "seen")],
    ["Jusqu'à la dernière image", seen(t, "ended")],
    ["Appuis sur le lien vers les images", fmt(t.links, "int")],
    ["Barre du bas touchée", fmt(t.bar.scroll + t.bar.sheet + t.bar.other, "int"), `descend au formulaire ${t.bar.scroll} · ouvre la fenêtre ${t.bar.sheet}${t.bar.other ? ` · non précisé ${t.bar.other}` : ""}`],
    ["Fenêtre de commande ouverte", fmt(t.opened.bar + t.opened.end, "int"), `depuis la barre ${t.opened.bar} · depuis la fin de la fiche ${t.opened.end}`],
    ["Commandes", fmt(t.orders.all, "int"), byOrigin(t)],
    ["Confirmées", share(t.confirmed, t.orders.all), "sur les commandes"],
    ["Livrées par visite", share(t.delivered, t.sessions), "commandes livrées, sur les visites"],
    ["Refus à la livraison", share(t.refused, t.delivered + t.refused), "sur les colis arrivés (livrés + refusés)"],
    ["Commandes après la barre", share(t.barOrders, t.barSessions), `dans les ${t.barSessions} visite(s) qui ont touché la barre`],
  ];
  // Product by product, then all of them when there are several.
  const rows = [...d.products, ...(d.products.length > 1 ? [t] : [])];
  const name = (x: DetailsRow) => (x.id ? <Link href={`/admin/produits/${x.id}`} className="hover:underline">{x.name}</Link> : x.name);
  return (
    <Card
      title="Détails en images (téléphone)"
      hint={`Fiches ouvertes sur un téléphone, une par visite, pour les ${d.withPictures} produit(s) qui ont des images de description. Une commande compte pour un produit quand elle le contient et vient d'une visite de sa fiche.`}
    >
      {t.sessions === 0 ? (
        <p className="text-sm text-muted">{d.withPictures === 0 ? "Aucun produit n'a d'images de description." : "Aucune visite sur téléphone d'une fiche avec des images de description sur la période."}</p>
      ) : (
        <>
          {!since ? (
            <p className="mb-3 rounded-xl bg-cream p-3 text-sm">Les images vues ne sont pas encore mesurées : les deux parts se remplissent dès les premières visites qui les atteignent.</p>
          ) : d.since! > from ? (
            <p className="mb-3 rounded-xl bg-[#fff8e6] p-3 text-sm">Images vues mesurées depuis le {since} : les visites d&apos;avant comptent dans les visites, pas dans les images vues. Les deux parts sont donc trop basses sur cette période.</p>
          ) : null}
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-4">
            {figures.map(([label, value, sub]) => (
              <div key={label} className="min-w-0">
                <dt className="text-xs text-muted">{label}</dt>
                <dd className="text-xl font-semibold tabular-nums">{value}</dd>
                {sub && <dd className="text-xs text-muted">{sub}</dd>}
              </div>
            ))}
          </dl>
          {d.products.length > 0 && (
            <>
              <DetailsTable
                title="Lecture des images"
                head={["Visites", "Images vues", "Jusqu'au bout", "Lien touché", "Barre : formulaire · fenêtre", "Fenêtre : barre · fin"]}
                rows={rows.map((x) => [
                  name(x),
                  x.sessions,
                  seen(x, "seen"),
                  seen(x, "ended"),
                  x.links,
                  <>{x.bar.scroll} · {x.bar.sheet}{x.bar.other > 0 && <span className="text-muted" title="Non précisé : touchée avant que la barre ne dise où elle mène"> (+{x.bar.other})</span>}</>,
                  `${x.opened.bar} · ${x.opened.end}`,
                ])}
              />
              <DetailsTable
                title="Commandes de ces visites"
                head={["Commandes", ...Object.values(ORIGINS), ...(t.orders.other > 0 ? ["Origine non enregistrée"] : []), "Confirmées", "Livrées / visites", "Refus", "Après la barre"]}
                rows={rows.map((x) => [
                  name(x),
                  x.orders.all,
                  x.orders.product,
                  x.orders.sheet,
                  x.orders.quick,
                  x.orders.cart,
                  ...(t.orders.other > 0 ? [x.orders.other] : []),
                  share(x.confirmed, x.orders.all),
                  share(x.delivered, x.sessions),
                  share(x.refused, x.delivered + x.refused),
                  share(x.barOrders, x.barSessions),
                ])}
              />
            </>
          )}
        </>
      )}
    </Card>
  );
}

/** One table of the card: the product first, then its numbers; the last row in bold when it is every product together. */
function DetailsTable({ title, head, rows }: { title: string; head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="mt-5">
      <h3 className="text-[13px] font-semibold text-ink">{title}</h3>
      <div className="-mx-4 mt-1 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <table className="w-full min-w-[720px] text-[13px]">
          <thead className="text-xs text-muted">
            <tr className="border-b border-line align-bottom">
              <th className="min-w-36 py-2 text-start font-medium">Produit</th>
              {head.map((h) => <th key={h} className="ps-4 text-end font-medium">{h}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-line tabular-nums">
            {rows.map(([product, ...cells], i) => (
              <tr key={i} className={i === rows.length - 1 && rows.length > 1 ? "font-semibold" : ""}>
                <td className="py-2 pe-3">{product}</td>
                {cells.map((c, j) => <td key={j} className="whitespace-nowrap ps-4 text-end">{c}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
