import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";
import { formatTND } from "@/lib/money";
import { fmt } from "@/lib/viz";
import { breakdowns, callDelay, type BreakdownRow } from "@/lib/ads/data";
import { callDelayInsight, hourBlocks, readSegments, segmentInsights, sortInsights, AD_WINNER_PROB, SEGMENT_MIN_ORDERS, SEGMENT_MIN_PARCELS, type SegmentRead, type SegmentRow } from "@/lib/ads/advisor";
import { plural } from "@/lib/ads/kpis";
import { probBestRate, wilson } from "@/lib/ads/stats";
import type { CallDelayRow } from "@/lib/ads/types";
import { Badge, Card, Empty } from "@/components/admin/ui";
import { ColumnChart, TableView } from "@/components/admin/charts";
import { adRange, periodText, rangeQuery, withPeriod } from "../_ui/range";
import { InsightList } from "../_ui/Insight";

export const metadata = { title: "Audience · Publicités" };

/**
 * "Audience": who confirms and who refuses, by governorate, device, hour and
 * weekday of the order, with the advisor's reading (readSegments: Wilson
 * intervals, a segment is flagged only when it is significantly worse or
 * better than the rest), when customers pick up the confirmation call, and
 * how the delay before the first call goes with confirmation (callDelay).
 * Site orders only (back-office orders left out by the data layer); the
 * "Publicités" filter keeps the orders that came from an ad link.
 */

const pct = (v: number | null | undefined) => fmt(v, "pct");
/** A probability without false certainty, as the advisor writes it: never "0 %" or "100 %". */
const chance = (p: number) => (p > 0.99 ? "plus de 99 %" : p < 0.01 ? "moins de 1 %" : pct(p));
/** "71–96 %": the interval in whole points, short enough for a table cell. */
const span = (ci: { low: number; high: number }) => `${Math.round(ci.low * 100)}–${Math.round(ci.high * 100)} %`;
const WEEKDAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const DEVICES: Record<string, string> = { mobile: "Téléphone", desktop: "Ordinateur", tablet: "Tablette", inconnu: "Inconnu" };
/** Calls an hour needs before its pick-up rate is compared with the others. */
const CALL_MIN = 10;
/** Orders than visits counted on a line: part of the visits was not counted, so the share is not a performance. */
const OVER_NOTE = "« Plus de 100 % » : plus de commandes que de visites comptées sur la ligne ; une partie des visites n'est donc pas comptée (bloqueur de publicité, visites d'avant la mesure).";

function str(v: string | string[] | undefined) {
  return typeof v === "string" ? v : undefined;
}

/** The engine's segment row from the data layer's breakdown: label is the raw key (hour "9", weekday "1", device "mobile"). */
const segments = (rows: BreakdownRow[]): SegmentRow[] => rows.map((r) => ({ label: r.key, orders: r.orders, confirmed: r.confirmed, delivered: r.delivered, back: r.back, pending: r.pending }));

export default async function AudiencePage({ searchParams }: PageProps<"/admin/publicites/audience">) {
  await requireAdmin();
  const sp = await searchParams;
  const r = adRange(sp);
  const q = rangeQuery(r);
  const paidOnly = str(sp.trafic) === "pub";
  const [b, delays] = await Promise.all([breakdowns(r.from, r.to, paidOnly ? { paidOnly: true } : undefined), callDelay(r.from, r.to, { paidOnly })]);

  const gov = segments(b.governorate);
  const dev = segments(b.device);
  const hours = segments(b.hour);
  const days = segments(b.weekday);
  const late = callDelayInsight(delays);
  const insights = sortInsights([...segmentInsights("governorate", gov), ...segmentInsights("device", dev), ...segmentInsights("hour", hours), ...segmentInsights("weekday", days), ...(late ? [late] : [])]);
  const orders = b.governorate.reduce((s, g) => s + g.orders, 0);

  const qs = (trafic: string | null) => withPeriod(`/admin/publicites/audience${trafic ? `?trafic=${trafic}` : ""}`, q);
  const sessionsOf = (rows: BreakdownRow[]) => new Map(rows.map((x) => [x.key, x.sessions]));

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-sm text-ink-2">
        Qui confirme et qui refuse, selon le gouvernorat, l&apos;appareil, l&apos;heure et le jour de la commande. Une ligne n&apos;est signalée que si l&apos;écart avec le reste est net, pas un hasard. Sous chaque taux : sa fourchette probable (95 %) et le nombre sur lequel il est lu.
      </p>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Commandes comptées">
        <Link href={qs(null)} className={`flex h-10 items-center rounded-full border px-4 text-[13px] ${!paidOnly ? "border-ink bg-ink text-white" : "border-line bg-white text-ink-2"}`}>
          Toutes les commandes du site
        </Link>
        <Link href={qs("pub")} className={`flex h-10 items-center rounded-full border px-4 text-[13px] ${paidOnly ? "border-ink bg-ink text-white" : "border-line bg-white text-ink-2"}`}>
          Venues d&apos;une publicité
        </Link>
        <span className="text-xs text-muted">{orders} commande{orders > 1 ? "s" : ""} · {periodText(r)}</span>
      </div>

      {orders === 0 ? (
        <Empty>{paidOnly ? "Aucune commande venue d'un lien de publicité sur la période. Les liens doivent porter utm_campaign : voir l'onglet Idées." : "Aucune commande sur la période."}</Empty>
      ) : (
        <>
          <Card title="À retenir" hint={`Un écart n'est lu qu'à partir de ${SEGMENT_MIN_ORDERS} commandes appelées ou ${SEGMENT_MIN_PARCELS} colis arrivés au bout.`}>
            <InsightList insights={insights} period={q} empty="Aucun écart net sur la période. Avec plus de commandes, les différences deviennent lisibles." />
          </Card>

          <Card title="Gouvernorats" hint="Gouvernorat de livraison. Le refus compte les colis refusés ou retournés sur les colis arrivés au bout.">
            <SegmentTable rows={readSegments(gov)} name="Gouvernorat" revenue={new Map(b.governorate.map((g) => [g.key, g.revenueDelivered]))} />
          </Card>

          <div className="grid gap-4 2xl:grid-cols-2">
            <Card title="Appareils" hint="Appareil utilisé pour commander.">
              <SegmentTable rows={readSegments(dev)} name="Appareil" label={(l) => DEVICES[l] ?? l} sessions={sessionsOf(b.device)} />
            </Card>
            <Card title="Jours de la semaine" hint="Jour de la commande, heure de Tunis.">
              <SegmentTable rows={readSegments(days)} name="Jour" label={(l) => WEEKDAYS[Number(l) - 1] ?? l} sessions={sessionsOf(b.weekday)} />
            </Card>
          </div>

          <Card title="Heures de commande" hint="Heure de Tunis. Les heures sont lues par blocs de 4 : une heure seule a rarement assez de commandes.">
            <ColumnChart points={b.hour.map((h) => ({ x: `${h.key} h`, y: h.orders }))} unit="int" name="Commandes" days={false} highlightMax />
            <TableView head={["Heure", "Visites", "Commandes", "Confirmées", "Livrées", "Revenues"]} rows={b.hour.map((h) => [`${h.key} h`, h.sessions ?? "—", h.orders, h.confirmed, h.delivered, h.back])} />
            <div className="mt-4">
              <SegmentTable rows={readSegments(hourBlocks(hours))} name="Créneau" />
            </div>
          </Card>

          <CallHours calls={b.callHours} />

          <CallDelay rows={delays} />
        </>
      )}
    </div>
  );
}

/** A rate with its 95 % interval and, when `unit` is given (singular, plural), the count it rests on; "—" when nothing is decided yet. */
function Rate({ rate, ci, n, unit }: { rate: number | null; ci: { low: number; high: number } | null; n: number; unit?: [string, string] }) {
  if (rate == null) return <span className="text-muted">—</span>;
  return (
    <span className="inline-flex flex-col items-end whitespace-nowrap leading-tight">
      <span>{pct(rate)}</span>
      {ci && <span className="text-[11px] text-muted">{span(ci)}</span>}
      {unit && <span className="text-[11px] text-muted">{plural(n, ...unit)}</span>}
    </span>
  );
}

/**
 * The advisor's flag, short enough to sit under the segment's name: on a phone the rate columns
 * scroll away, the flag must not. Only a clear gap is flagged (readSegments), so the words stay plain.
 */
const FLAGS = {
  confirm: { worse: "Confirme moins", better: "Confirme mieux" },
  delivery: { worse: "Refuse plus", better: "Refuse moins" },
} as const;

function Flag({ flag, what }: { flag: SegmentRead["confirmFlag"]; what: keyof typeof FLAGS }) {
  if (flag == null) return null;
  return <Badge tone={flag === "worse" ? "danger" : "ok"}>{FLAGS[what][flag]}</Badge>;
}

function SegmentTable({ rows, name, label = (l) => l, sessions, revenue }: { rows: SegmentRead[]; name: string; label?: (l: string) => string; sessions?: Map<string, number | null>; revenue?: Map<string, number> }) {
  if (rows.every((x) => x.orders === 0)) return <p className="text-sm text-muted">Aucune commande.</p>;
  const visitsOf = (x: SegmentRead) => sessions?.get(x.label) ?? null;
  // More orders than visits on a line: the visits are not all counted (see OVER_NOTE).
  const beyond = (x: SegmentRead) => {
    const visits = visitsOf(x) ?? 0;
    return visits > 0 && x.orders > visits;
  };
  return (
    <div>
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <table className="w-full min-w-[560px] text-[13px]">
          <thead className="text-xs text-muted">
            <tr className="border-b border-line">
              <th className="py-2 pe-3 text-start font-medium">{name}</th>
              {sessions && <th className="px-2 text-end font-medium">Visites</th>}
              {sessions && <th className="px-2 text-end font-medium">Commandes / visite</th>}
              <th className="px-2 text-end font-medium">Commandes</th>
              <th className="px-2 text-end font-medium">Confirmation</th>
              <th className="px-2 text-end font-medium">Livraison</th>
              <th className="px-2 text-end font-medium">Refus</th>
              {revenue && <th className="ps-2 text-end font-medium">CA livré</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-line tabular-nums">
            {rows.map((x) => {
              const called = Math.max(0, x.orders - (x.pending ?? 0));
              const parcels = x.delivered + x.back;
              const visits = visitsOf(x);
              const conv = visits ? wilson(x.orders, visits) : null;
              return (
                <tr key={x.label} className={x.orders === 0 ? "text-muted" : ""}>
                  <td className="py-2 pe-3">
                    <span className="block whitespace-nowrap">{label(x.label)}</span>
                    {(x.confirmFlag || x.deliveryFlag) && (
                      <span className="mt-1 flex flex-col items-start gap-1">
                        <Flag flag={x.confirmFlag} what="confirm" />
                        <Flag flag={x.deliveryFlag} what="delivery" />
                      </span>
                    )}
                  </td>
                  {sessions && <td className="px-2 text-end">{visits == null ? "—" : fmt(visits, "int")}</td>}
                  {sessions && <td className="px-2 text-end">{beyond(x) ? <span className="whitespace-nowrap text-[#8a5a00]">plus de 100 %</span> : conv ? pct(conv.rate) : "—"}</td>}
                  <td className="px-2 text-end">{x.orders}</td>
                  <td className="px-2 py-1.5 text-end"><Rate rate={x.confirmRate} ci={x.confirmCi} n={called} unit={["appelée", "appelées"]} /></td>
                  <td className="px-2 py-1.5 text-end"><Rate rate={x.deliveryRate} ci={x.deliveryCi} n={parcels} unit={["colis", "colis"]} /></td>
                  <td className="px-2 text-end">{pct(x.refusalRate)}</td>
                  {revenue && <td className="whitespace-nowrap ps-2 text-end">{formatTND(revenue.get(x.label) ?? 0)}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.some(beyond) && <p className="mt-2 text-xs leading-relaxed text-[#8a5a00]">{OVER_NOTE}</p>}
    </div>
  );
}

/**
 * Confirmation calls by hour: how often the customer picks up, and the chance
 * that each hour is the best one to call (Beta posteriors, probBestRate).
 * Hours with fewer than CALL_MIN calls are listed but not compared.
 */
function CallHours({ calls }: { calls: { hour: number; calls: number; reached: number; confirmed: number }[] }) {
  const made = calls.filter((c) => c.calls > 0);
  const total = made.reduce((s, c) => s + c.calls, 0);
  const compared = made.filter((c) => c.calls >= CALL_MIN);
  const probs = probBestRate(compared.map((c) => ({ successes: c.reached, n: c.calls })));
  const prob = new Map(compared.map((c, i) => [c.hour, probs[i]]));
  const winner = compared.find((c) => (prob.get(c.hour) ?? 0) >= AD_WINNER_PROB);
  return (
    <Card title="Heures d'appel" hint="Appels de confirmation passés sur la période, par heure de Tunis : la part où le client a répondu (confirmé, annulé ou « rappeler »).">
      {made.length === 0 ? (
        <p className="text-sm text-muted">Aucun appel enregistré sur la période. Notez les appels dans chaque commande pour voir quand les clients répondent.</p>
      ) : (
        <>
          <p className="mb-3 text-sm text-ink-2">
            {winner
              ? `Les clients répondent le plus à ${winner.hour} h : appelez d'abord à cette heure.`
              : compared.length >= 2
                ? "Aucune heure ne se détache nettement pour l'instant."
                : `Pas encore assez d'appels pour comparer les heures (${CALL_MIN} par heure au moins).`}{" "}
            <span className="text-muted">{total} appel{total > 1 ? "s" : ""}.</span>
          </p>
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <table className="w-full min-w-[480px] text-[13px]">
              <thead className="text-xs text-muted">
                <tr className="border-b border-line">
                  <th className="py-2 pe-3 text-start font-medium">Heure</th>
                  <th className="px-2 text-end font-medium">Appels</th>
                  <th className="px-2 text-end font-medium">Client joint</th>
                  <th className="px-2 text-end font-medium">Confirmées</th>
                  <th className="ps-2 text-end font-medium">Chance d&apos;être la meilleure heure</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line tabular-nums">
                {made.map((c) => {
                  const w = wilson(c.reached, c.calls);
                  const p = prob.get(c.hour);
                  return (
                    <tr key={c.hour}>
                      <td className="py-2 pe-3">{c.hour} h</td>
                      <td className="px-2 text-end">{c.calls}</td>
                      <td className="px-2 py-1.5 text-end"><Rate rate={w?.rate ?? null} ci={w} n={c.calls} unit={["appel", "appels"]} /></td>
                      <td className="px-2 text-end">{c.confirmed}</td>
                      <td className="ps-2 text-end">{p == null ? <span className="text-muted">trop peu d&apos;appels</span> : chance(p)}</td>
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

/**
 * Confirmation by how long the first call took (callDelay): the orders no
 * longer pending, in delay buckets, with the confirmation rate and its 95 %
 * interval. The comparison itself is the advisor's (callDelayInsight), in
 * "À retenir".
 */
function CallDelay({ rows }: { rows: CallDelayRow[] }) {
  const orders = rows.reduce((s, x) => s + x.orders, 0);
  return (
    <Card title="Délai du premier appel" hint="Temps entre la commande et son premier appel noté, sur les commandes qui ne sont plus en attente.">
      {orders === 0 ? (
        <p className="text-sm text-muted">Aucune commande traitée sur la période.</p>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table className="w-full min-w-[420px] text-[13px]">
            <thead className="text-xs text-muted">
              <tr className="border-b border-line">
                <th className="py-2 pe-3 text-start font-medium">Premier appel</th>
                <th className="px-2 text-end font-medium">Commandes</th>
                <th className="px-2 text-end font-medium">Confirmées</th>
                <th className="ps-2 text-end font-medium">Confirmation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line tabular-nums">
              {rows.map((x) => {
                const w = wilson(x.confirmed, x.orders);
                return (
                  <tr key={x.bucket} className={x.orders === 0 ? "text-muted" : ""}>
                    <td className="py-2 pe-3">{x.label.charAt(0).toUpperCase() + x.label.slice(1)}</td>
                    <td className="px-2 text-end">{x.orders}</td>
                    <td className="px-2 text-end">{x.confirmed}</td>
                    <td className="ps-2 py-1.5 text-end"><Rate rate={w?.rate ?? null} ci={w} n={x.orders} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
