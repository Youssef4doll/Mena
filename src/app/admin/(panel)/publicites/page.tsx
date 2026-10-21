import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";
import { formatTND } from "@/lib/money";
import { fmt } from "@/lib/viz";
import { adRows, callDelay, dailyByRow } from "@/lib/ads/data";
import { advise, bottleneck, reference, type RowAdvice } from "@/lib/ads/advisor";
import { funnelSteps, kpis, kpiValue, plural, totalRow } from "@/lib/ads/kpis";
import { STALE_PENDING_HOURS, type AdRow, type Insight } from "@/lib/ads/types";
import { Badge, Card, Empty } from "@/components/admin/ui";
import { adRange, periodText, rangeQuery, withPeriod } from "./_ui/range";
import { adsBasics } from "./_ui/server";
import { change, coverage, fixHref, kpiText, rowId, rowLabel, SEVERITIES, sourceLabel, STAGE_STEP, VERDICTS, FIX_LINKS } from "./_ui/format";
import { KpiTile, Tile, TileGrid } from "./_ui/Kpi";
import { Budget, VerdictBadge } from "./_ui/Verdict";
import { FunnelBars } from "./_ui/Funnel";
import { InsightList } from "./_ui/Insight";
import { MissingList, type ExtraMissing } from "./_ui/Missing";

export const metadata = { title: "Publicités" };

/**
 * When campaigns carry at least this share of the spend, the account is read
 * campaign by campaign; under it, most of the spend was typed per source and
 * a campaign's cost cannot be told, so the advice is per source.
 */
const CAMPAIGN_SHARE = 0.9;
/** Campaigns listed on the overview; the Campagnes tab has them all. */
const LIST_MAX = 8;

const META = new Set(["facebook", "instagram"]);

/** Verdicts that ask for action keep their order (cut, broken measure, fix); the others are ranked together, by spend. */
const urgency = (a: RowAdvice) => Math.min(VERDICTS[a.verdict].rank, VERDICTS.wait.rank);

/** Insights in full at the top; the rest fold under them, so the tiles stay near on a phone. */
const TOP_ACTIONS = 3;

/**
 * Vue d'ensemble: the whole ad account for the period, read on the traffic
 * that came from an ad link (utm_campaign or a paid medium; orders typed in
 * the back office are left out by the data layer). The verdict, what the
 * advisor says to do first and a verdict per campaign come first, then the
 * tiles against the previous period, the funnel and what is missing to
 * compute the rest. Every number and every sentence of advice comes from the
 * engine.
 */
export default async function AdsOverview({ searchParams }: PageProps<"/admin/publicites">) {
  await requireAdmin();
  const r = adRange(await searchParams);
  const q = rangeQuery(r);
  const [paid, prevPaid, all, campaigns, daily, calls, { costs, baseline, tracking }] = await Promise.all([
    adRows(r.from, r.to, "source", { paidOnly: true }),
    adRows(r.prevFrom, r.prevTo, "source", { paidOnly: true }),
    adRows(r.from, r.to, "source"),
    adRows(r.from, r.to, "campaign"),
    dailyByRow(r.from, r.to, "campaign"),
    callDelay(r.from, r.to),
    adsBasics(r.to),
  ]);

  const total = totalRow(paid);
  const k = kpis(total, costs, baseline);
  const prevTotal = totalRow(prevPaid);
  const kp = kpis(prevTotal, costs, baseline);
  const f = total.funnel;
  const spend = total.platform.spend;
  const campaignSpend = totalRow(campaigns).platform.spend ?? 0;
  const byCampaign = campaigns.length > 0 && (!spend || campaignSpend >= CAMPAIGN_SHARE * spend);
  const rows = byCampaign ? campaigns : paid.filter((x) => x.source !== "direct" || x.platform.spend != null);
  // The source rows give the account's spend as the tile counts it (spend typed without a campaign included).
  const report = advise({ rows, costs, baseline, days: r.days, daily: byCampaign ? daily : undefined, tracking, coverage: coverage(all), sources: paid, callDelay: calls });
  const account = report.total.advice;
  // The advisor's sentence about the whole account is read off the account's verdict and names the lines
  // to act on; it leads, and no account budget step is shown: budgets are set line by line.
  const headline = report.insights.find((i) => i.key == null && i.title.startsWith("Le compte ")) ?? null;
  const insights = headline ? report.insights.filter((i) => i !== headline) : report.insights;
  const weak = bottleneck(total, reference(null, baseline));
  const unassigned = byCampaign && spend ? spend - campaignSpend : 0;

  const extra: ExtraMissing[] = [];
  const hasMeta = paid.some((x) => META.has(x.source));
  const hasTiktok = paid.some((x) => x.source === "tiktok");
  if (hasMeta && !tracking.metaPixel) extra.push({ label: "Pixel Meta absent", href: FIX_LINKS.tracking.href, cta: "Ajouter le pixel" });
  else if (hasMeta && !tracking.metaCapi) extra.push({ label: "Jeton de l'API Conversions Meta absent", href: FIX_LINKS.tracking.href, cta: "Ajouter le jeton" });
  if (hasTiktok && !tracking.tiktokPixel) extra.push({ label: "Pixel TikTok absent", href: FIX_LINKS.tracking.href, cta: "Ajouter le pixel" });
  else if (hasTiktok && !tracking.tiktokEvents) extra.push({ label: "Jeton Events API TikTok absent", href: FIX_LINKS.tracking.href, cta: "Ajouter le jeton" });

  const nothing = f.sessions === 0 && f.orders === 0 && spend == null;
  const hint = `Période ${periodText(r)}, comparée aux ${r.days} jours d'avant. Seulement les visites et les commandes venues d'un lien de publicité (avec ses UTM) ; les commandes saisies dans l'admin n'y sont pas.`;
  // The verdict reads the rows it judges; the tiles read all the ad traffic. When the two differ
  // (spend typed without a campaign), the box says so, or its figures would seem to contradict the tiles.
  const judged = report.total.row;
  const scope =
    rows.length > 0 && ((judged.platform.spend ?? 0) !== (spend ?? 0) || judged.funnel.orders !== f.orders)
      ? `Ce verdict lit les ${byCampaign ? "campagnes" : "sources"} une à une (${judged.platform.spend != null ? `${formatTND(judged.platform.spend)}, ` : ""}${plural(judged.funnel.orders, "commande", "commandes")}) ; les chiffres plus bas comptent tout le trafic venu des publicités (${spend != null ? `${formatTND(spend)}, ` : ""}${plural(f.orders, "commande", "commandes")}).`
      : null;

  if (nothing) {
    return (
      <div className="flex flex-col gap-4">
        <Empty>
          Aucune visite venue d&apos;une publicité et aucune dépense {periodText(r)}. Ajoutez les UTM à vos liens de publicité, puis saisissez ou importez les dépenses : les chiffres apparaissent ici.
        </Empty>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Pour commencer">
            <ul className="flex flex-col text-[13px]">
              <li><Link href={withPeriod("/admin/publicites/idees", q)} className="flex min-h-10 items-center text-sea underline">Créer un lien de publicité avec ses UTM</Link></li>
              <li><Link href="/admin/publicites/importer" className="flex min-h-10 items-center text-sea underline">Importer un export Meta ou TikTok</Link></li>
              <li><Link href="/admin/depenses" className="flex min-h-10 items-center text-sea underline">Saisir une dépense à la main</Link></li>
            </ul>
          </Card>
          <Card title="Ce qui manque">
            <MissingList inputs={k.missing} extra={extra} period={q} done="Tout ce qu'il faut est renseigné." />
          </Card>
        </div>
      </div>
    );
  }

  // Orders left out of the projection (waiting too long for a call, no measured rate for them) make its
  // deliveries a minimum: the projected cost is then at most that, the projected result at least that.
  const floor = k.projection?.floor ?? false;
  const cpdSub = [
    k.projection?.projected && kpiValue(k, "projectedCpd") != null ? `projection ${floor ? "au plus " : ""}${kpiText(k, "projectedCpd")}` : null,
    k.breakEvenCpd != null ? `maximum ${kpiText(k, "breakEvenCpd")}` : null,
    k.cpaPlaced != null ? `${kpiText(k, "cpaPlaced")} par commande passée` : null,
  ].filter(Boolean);
  const units = kpiValue(k, "unitsPerOrder");
  const stale = f.pendingStale ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <AccountVerdict advice={account} headline={headline} rowsCount={rows.length} byCampaign={byCampaign} scope={scope} q={q} />

      {/* What to do comes before the figures: on a phone the ten tiles would push it two screens down. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Card title="À faire d'abord" hint={`Ce que disent les chiffres, le plus urgent en haut. Analyse ${byCampaign ? "par campagne" : "par source"}.`}>
          <InsightList insights={insights} limit={TOP_ACTIONS} period={q} empty="Rien à signaler sur la période." />
        </Card>
        <Card
          title={byCampaign ? "Verdict par campagne" : "Verdict par source"}
          hint={byCampaign ? "Les plus urgentes en haut." : "La dépense est saisie par source : les campagnes ne peuvent pas être jugées une à une. Importez l'export de la plateforme pour le détail."}
          aside={
            byCampaign && (
              <Link href={withPeriod("/admin/publicites/campagnes", q)} className="inline-flex min-h-10 items-center text-[13px] font-medium text-sea underline">
                Tout voir
              </Link>
            )
          }
        >
          <VerdictList rows={rows} advice={report.rows} q={q} linked={byCampaign} />
          {unassigned > 0 && (
            <p className="mt-3 text-xs text-muted">
              {formatTND(unassigned)} de dépense sans campagne : comptés dans les chiffres plus bas, pas dans les campagnes.
            </p>
          )}
        </Card>
      </div>

      <section aria-label="Chiffres clés" className="flex flex-col gap-2">
        <p className="text-xs text-muted">{hint}</p>
        <TileGrid>
          <Tile
            label="Dépense pub"
            value={spend == null ? "—" : formatTND(spend)}
            change={change(spend, prevTotal.platform.spend, "money", null)}
            sub={spend != null ? `${formatTND(Math.round(spend / r.days))} / jour` : undefined}
            help="Ce qui a été payé aux plateformes sur la période, saisi ou importé."
            missing={
              spend == null && (
                <>
                  Aucune dépense saisie ni importée.{" "}
                  <Link href="/admin/publicites/importer" className="underline">Importer</Link>
                </>
              )
            }
          />
          <Tile
            label="Commandes"
            value={fmt(f.orders, "int")}
            change={change(f.orders, prevTotal.funnel.orders, "number", "higher")}
            sub={
              <>
                {plural(f.delivered, "livrée", "livrées")} · {f.open} en cours
                {stale > 0 && <span className="block text-[#8a5a00]">dont {stale} en attente d&apos;appel depuis plus de {STALE_PENDING_HOURS} h</span>}
              </>
            }
            help="Commandes passées depuis un lien de publicité, tous statuts."
          />
          <KpiTile k={k} prev={kp} kpi="costPerDelivered" period={q} sub={cpdSub.length ? cpdSub.join(" · ") : undefined} empty={spend != null ? "Aucune commande livrée pour l'instant." : undefined} />
          <KpiTile k={k} prev={kp} kpi="roasDelivered" period={q} sub={k.breakEvenRoas != null ? `minimum ${kpiText(k, "breakEvenRoas")}` : undefined} />
          <KpiTile k={k} prev={kp} kpi="poas" period={q} />
          <KpiTile k={k} prev={kp} kpi="contribution" period={q} sub={k.projection?.projected && k.projection.contribution != null ? `projection ${floor && (k.marginPerDelivered ?? 0) > 0 ? "au moins " : ""}${kpiText(k, "projectedContribution")}` : undefined} />
          <KpiTile k={k} prev={kp} kpi="orderRate" period={q} sub={plural(f.sessions, "visite", "visites")} empty="Aucune visite comptée." />
          <KpiTile
            k={k}
            prev={kp}
            kpi="confirmRate"
            period={q}
            sub={
              <>
                {f.confirmed} sur {plural(k.decided, "appelée", "appelées")}
                {k.lateCancelled > 0 && <span className="block">dont {plural(k.lateCancelled, "annulée", "annulées")} après confirmation</span>}
              </>
            }
            empty="Aucune commande appelée."
          />
          <KpiTile k={k} prev={kp} kpi="deliveryRate" period={q} sub={`${f.delivered} livrée${f.delivered > 1 ? "s" : ""}, ${f.back} revenue${f.back > 1 ? "s" : ""}`} empty="Aucun colis arrivé au bout." />
          <KpiTile k={k} prev={kp} kpi="aov" period={q} sub={units != null ? `${kpiText(k, "unitsPerOrder")} article${units >= 2 ? "s" : ""} par commande` : undefined} empty="Aucune commande." />
        </TileGrid>
        {k.projection?.projected && <p className="text-xs leading-relaxed text-muted">{k.projection.note}</p>}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Entonnoir" hint="Pourcentage et barre : la part de l'étape d'avant qui passe à celle-ci.">
          <FunnelBars steps={funnelSteps(total)} weak={weak ? STAGE_STEP[weak.stage] : null} />
          {weak && (
            <p className="mt-3 text-[13px] leading-relaxed text-ink-2">
              <span className="font-medium text-ink">{weak.title}.</span> {weak.evidence}
            </p>
          )}
        </Card>
        <Card title="Ce qui manque" hint="Sans ces chiffres, certaines cases restent vides.">
          <MissingList inputs={k.missing} extra={extra} period={q} done="Tout ce qu'il faut est renseigné." />
        </Card>
      </div>
    </div>
  );
}

/**
 * The account in one box: the advisor's sentence about it when the money can
 * be judged (with its evidence, what to do and the page where it is done),
 * else the account's verdict
 * and its reasons (waiting for data, a broken measure, no margin). `scope`
 * says when it reads less than the tiles do.
 */
function AccountVerdict({ advice, headline, rowsCount, byCampaign, scope, q }: { advice: RowAdvice; headline: Insight | null; rowsCount: number; byCampaign: boolean; scope: string | null; q: string }) {
  const level = byCampaign ? "campagne" : "source";
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-4 sm:flex-row sm:items-start sm:gap-5 sm:p-5">
      <div className="flex shrink-0 flex-row items-center gap-3 sm:w-40 sm:flex-col sm:items-start sm:gap-2">
        <p className="text-xs text-muted">Le compte</p>
        {headline ? <Badge tone={SEVERITIES[headline.severity].tone}>{SEVERITIES[headline.severity].label}</Badge> : <VerdictBadge verdict={advice.verdict} />}
      </div>
      <div className="min-w-0 flex-1">
        {headline ? (
          <>
            <p className="text-[15px] font-semibold text-ink">{headline.title}</p>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{headline.evidence}</p>
            <p className="mt-1 text-[13px] leading-relaxed text-ink">
              <span className="font-medium">À faire : </span>
              {headline.action}
            </p>
            {headline.fix && (
              <Link href={fixHref(headline.fix, q)} className="inline-flex min-h-10 items-center text-[13px] font-medium text-sea underline">
                {FIX_LINKS[headline.fix].label}
              </Link>
            )}
          </>
        ) : (
          <>
            <p className="text-[15px] font-semibold text-ink">{VERDICTS[advice.verdict].hint}</p>
            <ul className="mt-1.5 flex flex-col gap-1 text-[13px] leading-relaxed text-ink-2">
              {advice.reasons.slice(0, 4).map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </>
        )}
        {scope && <p className="mt-2 text-xs text-muted">{scope}</p>}
        {rowsCount > 0 && (
          <p className="mt-2 text-xs text-muted">
            Le budget se règle {level} par {level} : voir le verdict de chacune juste en dessous
            {byCampaign && (
              <>
                {" "}et dans <Link href={withPeriod("/admin/publicites/campagnes", q)} className="underline">Campagnes</Link>
              </>
            )}
            .
          </p>
        )}
      </div>
    </section>
  );
}

/** What needs action first (cut, broken measure, fix), then the rest by spend: name, verdict, budget step and the cost per delivered order it was judged on. */
function VerdictList({ rows, advice, q, linked }: { rows: AdRow[]; advice: RowAdvice[]; q: string; linked: boolean }) {
  if (rows.length === 0) return <p className="text-sm text-muted">Aucune ligne sur la période.</p>;
  const list = rows
    .map((row, i) => ({ row, a: advice[i] }))
    .sort((x, y) => urgency(x.a) - urgency(y.a) || (y.row.platform.spend ?? -1) - (x.row.platform.spend ?? -1));
  const shown = list.slice(0, LIST_MAX);
  return (
    <>
      <ul className="divide-y divide-line">
        {shown.map(({ row, a }) => {
          const name = rowLabel(row);
          const projected = a.kpis.projection?.projected;
          return (
            <li key={row.key} className="flex items-start justify-between gap-3 py-2.5">
              {/* The name and its figures are one tap target; a long campaign name wraps rather than losing its end, where names usually differ. */}
              {linked ? (
                <Link href={withPeriod(`/admin/publicites/campagnes#${rowId(row.key)}`, q)} className="group block min-h-10 min-w-0">
                  <span className="block break-words text-[13px] font-medium text-ink group-hover:underline">{name}</span>
                  <Figures row={row} a={a} projected={projected} />
                </Link>
              ) : (
                <div className="min-w-0">
                  <p className="break-words text-[13px] font-medium text-ink">{name}</p>
                  <Figures row={row} a={a} projected={projected} />
                </div>
              )}
              <div className="flex shrink-0 flex-col items-end gap-1 text-[13px]">
                <VerdictBadge verdict={a.verdict} />
                <Budget change={a.budgetChange} prefix />
              </div>
            </li>
          );
        })}
      </ul>
      {list.length > shown.length && <p className="pt-2 text-xs text-muted">{list.length - shown.length > 1 ? `Et ${list.length - shown.length} autres` : "Et 1 autre"} dans Campagnes.</p>}
    </>
  );
}

/** A verdict line's figures: where it comes from, what it spent, the cost per delivered order it was judged on, and its ceiling. */
function Figures({ row, a, projected }: { row: AdRow; a: RowAdvice; projected: boolean | undefined }) {
  return (
    <span className="block text-xs text-muted">
      {row.campaign ? `${sourceLabel(row.source)} · ` : ""}
      {row.platform.spend != null ? `${formatTND(row.platform.spend)} dépensés` : "dépense inconnue"}
      {a.judgedCpd != null && ` · ${formatTND(a.judgedCpd)} par livrée${projected ? " (projection)" : ""}`}
      {a.target != null && ` · maximum ${formatTND(a.target)}`}
    </span>
  );
}
