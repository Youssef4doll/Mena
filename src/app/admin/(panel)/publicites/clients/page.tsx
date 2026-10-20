import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";
import { formatTND } from "@/lib/money";
import { fmt } from "@/lib/viz";
import { ratio } from "@/lib/analytics-range";
import { adRows, customerGrowth, LTV_DAYS, type Cohort } from "@/lib/ads/data";
import { kpis, totalRow } from "@/lib/ads/kpis";
import { Badge, Card, Empty } from "@/components/admin/ui";
import { adRange, periodText } from "../_ui/range";
import { adsBasics } from "../_ui/server";
import { sourceLabel } from "../_ui/format";
import { Tile } from "../_ui/Kpi";
import { PAYBACK_MIN_CUSTOMERS, payback, type Payback } from "./payback";

export const metadata = { title: "Clients · Publicités" };

/**
 * "Clients": does each source bring new customers or the same ones again,
 * do they come back, what they are worth 30, 60 and 90 days after their
 * first order, and when that pays for the ads that brought them. A customer
 * is a phone number; every count is real (data.ts customerGrowth), the money
 * left per customer is an estimate (payback.ts) and says so.
 */

const money = (v: number | null | undefined) => (v == null ? "—" : formatTND(v));
const pct = (v: number | null | undefined) => fmt(v, "pct");

export default async function ClientsPage({ searchParams }: PageProps<"/admin/publicites/clients">) {
  await requireAdmin();
  const r = adRange(await searchParams);
  const [growth, rows, { costs, baseline: base }] = await Promise.all([customerGrowth(r.from, r.to), adRows(r.from, r.to, "source"), adsBasics(r.to)]);

  // Margin per delivered order of each source (the engine's), the shop's as a fallback.
  const shopMargin = kpis(totalRow(rows), costs, base).marginPerDelivered;
  const bySource = new Map(rows.map((x) => [x.source, x]));
  const reads = growth.cohorts.map((c) => {
    const row = bySource.get(c.source);
    const own = row ? kpis(row, costs, base).marginPerDelivered : null;
    const margin = own ?? shopMargin;
    return { cohort: c, spend: row?.platform.spend ?? null, marginBasis: own != null ? "source" : margin != null ? "shop" : null, pb: payback(c, row?.platform.spend ?? null, margin) };
  });
  const totalOrders = growth.bySource.reduce((s, x) => s + x.orders, 0);
  const totalNew = growth.bySource.reduce((s, x) => s + x.fromNew, 0);
  const anyMeasured = growth.total.ltv.some((p) => p.customers > 0);

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-sm text-ink-2">
        Un client est un numéro de téléphone. « Nouveau » : ce numéro n&apos;avait jamais commandé avant, par aucun canal. La valeur d&apos;un client compte ses commandes livrées dans les 30, 60 et 90 jours qui suivent la première.
      </p>

      {totalOrders === 0 ? (
        <Empty>Aucune commande du site sur la période.</Empty>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label="Commandes du site" value={String(totalOrders)} sub={`hors annulées, ${periodText(r)}`} />
            <Tile label="De nouveaux clients" value={pct(ratio(totalNew, totalOrders))} sub={`${totalNew} commande${totalNew > 1 ? "s" : ""}`} help="Commandes d'un numéro qui n'avait jamais commandé." />
            <Tile label="Clients acquis" value={String(growth.total.customers)} sub="première commande sur la période" />
            <Tile label="Ont recommandé depuis" value={pct(growth.total.repeatRate)} sub={`${growth.total.repeaters} client${growth.total.repeaters > 1 ? "s" : ""}`} help="Une autre commande depuis, par n'importe quel canal." />
          </div>

          <Card title="Nouveaux et fidèles par source" hint="Source de la commande (premier contact de la visite). Les commandes saisies dans le back-office ne sont pas comptées ici.">
            <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              <table className="w-full min-w-[520px] text-[13px]">
                <thead className="text-xs text-muted">
                  <tr className="border-b border-line">
                    <th className="py-2 pe-3 text-start font-medium">Source</th>
                    <th className="px-2 text-end font-medium">Commandes</th>
                    <th className="px-2 text-end font-medium">De nouveaux clients</th>
                    <th className="px-2 text-end font-medium">De clients fidèles</th>
                    <th className="ps-2 text-end font-medium">Clients différents</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line tabular-nums">
                  {growth.bySource.map((s) => (
                    <tr key={s.source}>
                      <td className="py-2 pe-3">{sourceLabel(s.source)}</td>
                      <td className="px-2 text-end">{s.orders}</td>
                      <td className="px-2 text-end">{s.fromNew} <span className="text-muted">{pct(ratio(s.fromNew, s.orders))}</span></td>
                      <td className="px-2 text-end">{s.fromReturning}</td>
                      <td className="ps-2 text-end">{s.customers}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {growth.backOffice > 0 && (
              <p className="mt-2 text-xs text-muted">
                {growth.backOffice > 1 ? `${growth.backOffice} clients de la période ont commandé d'abord par le back-office : sans source, ils ne sont pas` : "Un client de la période a commandé d'abord par le back-office : sans source, il n'est pas"} dans les tableaux.
              </p>
            )}
          </Card>

          <Card
            title="Valeur d'un client par source d'arrivée"
            hint={`Clients dont la première commande est sur la période, par la source de cette commande. Chaque horizon n'est mesuré que sur les clients arrivés depuis assez longtemps ; sous ${PAYBACK_MIN_CUSTOMERS} clients, il est indicatif.`}
          >
            {growth.cohorts.length === 0 ? (
              <p className="text-sm text-muted">Aucun nouveau client sur la période.</p>
            ) : (
              <>
                {!anyMeasured && (
                  <p className="mb-3 rounded-xl bg-cream px-3 py-2 text-sm text-ink-2">
                    Aucun client de la période n&apos;est arrivé il y a 30 jours ou plus : la valeur à 30, 60 et 90 jours n&apos;est pas encore mesurable. Choisissez une période plus longue (90 jours).
                  </p>
                )}
                <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                  <table className="w-full min-w-[640px] text-[13px]">
                    <thead className="text-xs text-muted">
                      <tr className="border-b border-line">
                        <th className="py-2 pe-3 text-start font-medium">Source</th>
                        <th className="px-2 text-end font-medium">Clients acquis</th>
                        <th className="px-2 text-end font-medium">Recommandent</th>
                        {LTV_DAYS.map((d) => (
                          <th key={d} className="px-2 text-end font-medium">CA livré par client à {d} j</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line tabular-nums">
                      {[...growth.cohorts, { source: "Total", ...growth.total }].map((c: Cohort) => (
                        <tr key={c.source} className={c.source === "Total" ? "font-semibold" : ""}>
                          <td className="py-2 pe-3">{c.source === "Total" ? "Toutes les sources" : sourceLabel(c.source)}</td>
                          <td className="px-2 text-end">{c.customers}</td>
                          <td className="px-2 py-1.5 text-end">
                            <span className="inline-flex flex-col items-end leading-tight">
                              <span>{pct(c.repeatRate)}</span>
                              <span className="text-[11px] font-normal text-muted">{c.repeaters} client{c.repeaters > 1 ? "s" : ""}</span>
                            </span>
                          </td>
                          {c.ltv.map((p) => (
                            <td key={p.days} className="px-2 py-1.5 text-end">
                              <span className="inline-flex flex-col items-end leading-tight">
                                <span>{money(p.perCustomer)}</span>
                                <span className="text-[11px] font-normal text-muted">{p.customers ? `${p.customers} client${p.customers > 1 ? "s" : ""} mesuré${p.customers > 1 ? "s" : ""}` : "pas encore"}</span>
                              </span>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Card>

          <Card title="Retour sur la publicité" hint="Dépense de la source sur la période divisée par ses nouveaux clients, puis ce que ces clients ont laissé. Marge estimée : commandes livrées × marge moyenne d'une livrée (refus compris).">
            <PaybackTable reads={reads.filter((x) => x.spend != null && x.spend > 0)} shopMargin={shopMargin} />
          </Card>
        </>
      )}
    </div>
  );
}

type Read = { cohort: Cohort; spend: number | null; marginBasis: string | null; pb: Payback };

function PaybackTable({ reads, shopMargin }: { reads: Read[]; shopMargin: number | null }) {
  if (reads.length === 0) {
    return (
      <p className="text-sm text-muted">
        Aucune source avec une dépense et de nouveaux clients sur la période. <Link href="/admin/depenses" className="underline">Saisissez la dépense</Link> ou <Link href="/admin/publicites/importer" className="underline">importez un export</Link>.
      </p>
    );
  }
  return (
    <>
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <table className="w-full min-w-[640px] text-[13px]">
          <thead className="text-xs text-muted">
            <tr className="border-b border-line">
              <th className="py-2 pe-3 text-start font-medium">Source</th>
              <th className="px-2 text-end font-medium">Dépense</th>
              <th className="px-2 text-end font-medium">Coût par nouveau client</th>
              {LTV_DAYS.map((d) => (
                <th key={d} className="px-2 text-end font-medium">Marge par client à {d} j</th>
              ))}
              <th className="ps-2 text-start font-medium">Rentabilisé</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line tabular-nums">
            {reads.map(({ cohort, spend, marginBasis, pb }) => (
              <tr key={cohort.source}>
                <td className="py-2 pe-3">
                  {sourceLabel(cohort.source)}
                  {marginBasis === "shop" && <span className="block text-[11px] text-muted">marge de la boutique</span>}
                </td>
                <td className="px-2 text-end">{money(spend)}</td>
                <td className="px-2 text-end">{money(pb.costPerCustomer)}</td>
                {pb.points.map((p) => (
                  <td key={p.days} className={`px-2 py-1.5 text-end ${p.enough ? "" : "text-muted"}`}>
                    <span className="inline-flex flex-col items-end leading-tight">
                      <span>{p.marginPerCustomer == null ? "—" : `environ ${formatTND(p.marginPerCustomer)}`}</span>
                      {p.ratio != null ? (
                        <span className="text-[11px] text-muted">{p.ratio.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} × le coût</span>
                      ) : p.customers === 0 ? (
                        <span className="text-[11px] text-muted">pas encore</span>
                      ) : null}
                    </span>
                  </td>
                ))}
                <td className="ps-2">
                  {pb.paidBackAt ? (
                    <Badge tone="ok">à {pb.paidBackAt} jours</Badge>
                  ) : pb.points.some((p) => p.enough) ? (
                    <Badge tone="warn">pas encore à {Math.max(...pb.points.filter((p) => p.enough).map((p) => p.days))} jours</Badge>
                  ) : (
                    <span className="text-xs text-muted">trop tôt pour le dire</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {shopMargin == null && <p className="mt-2 text-xs text-[#8a5a00]">Marge par livrée inconnue : renseignez le coût fournisseur des produits et les coûts du transporteur dans les <Link href="/admin/parametres" className="underline">Paramètres</Link>.</p>}
    </>
  );
}
