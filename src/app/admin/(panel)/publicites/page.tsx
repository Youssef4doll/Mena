import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";
import { formatTND } from "@/lib/money";
import { fmt } from "@/lib/viz";
import { adRows, dailyByRow } from "@/lib/ads/data";
import { advise, bottleneck, reference, type RowAdvice } from "@/lib/ads/advisor";
import type { Insight } from "@/lib/ads/types";
import { funnelSteps, kpis, kpiValue, totalRow } from "@/lib/ads/kpis";
import type { AdRow } from "@/lib/ads/types";
import { Badge, Card, Empty } from "@/components/admin/ui";
import { adRange, periodText, rangeQuery, withPeriod } from "./_ui/range";
import { adsBasics } from "./_ui/server";
import { change, coverage, kpiText, rowId, rowLabel, SEVERITIES, sourceLabel, STAGE_STEP, VERDICTS, FIX_LINKS } from "./_ui/format";
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

/**
 * Vue d'ensemble: the whole ad account for the period, read on the traffic
 * that came from an ad link (utm_campaign or a paid medium; orders typed in
 * the back office are left out by the data layer). The verdict, the tiles
 * against the previous period, what the advisor says to do first, a verdict
 * per campaign, and what is missing to compute the rest. Every number and
 * every sentence of advice comes from the engine.
 */
export default async function AdsOverview({ searchParams }: PageProps<"/admin/publicites">) {
  await requireAdmin();
  const r = adRange(await searchParams);
  const q = rangeQuery(r);
  const [paid, prevPaid, all, campaigns, daily, { costs, baseline, tracking }] = await Promise.all([
    adRows(r.from, r.to, "source", { paidOnly: true }),
    adRows(r.prevFrom, r.prevTo, "source", { paidOnly: true }),
    adRows(r.from, r.to, "source"),
    adRows(r.from, r.to, "campaign"),
    dailyByRow(r.from, r.to, "campaign"),
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
  const report = advise({ rows, costs, baseline, days: r.days, daily: byCampaign ? daily : undefined, tracking, coverage: coverage(all) });
  const account = report.total.advice;
  // The advisor's sentence about the whole account weighs every row (a winner that wears out is not
  // scaled); the summed row's own verdict does not, so the sentence leads and no account budget step is shown.
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
  else if (hasTiktok && !tracking.tiktokEvents) extra.push({ label: "Jeton de l'API Événements TikTok absent", href: FIX_LINKS.tracking.href, cta: "Ajouter le jeton" });

  const nothing = f.sessions === 0 && f.orders === 0 && spend == null;
  const hint = `Période ${periodText(r)}, comparée aux ${r.days} jours d'avant. Seulement le trafic venu d'un lien de publicité (utm_campaign ou medium payant) ; les commandes saisies dans l'admin n'y sont pas.`;

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

  const cpdSub = [
    k.projection?.projected && kpiValue(k, "projectedCpd") != null ? `projection ${kpiText(k, "projectedCpd")}` : null,
    k.breakEvenCpd != null ? `max ${kpiText(k, "breakEvenCpd")}` : null,
    k.cpaPlaced != null ? `CPA ${kpiText(k, "cpaPlaced")}` : null,
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-4">
      <AccountVerdict advice={account} headline={headline} rowsCount={rows.length} byCampaign={byCampaign} q={q} />

      <section aria-label="Chiffres clés" className="flex flex-col gap-2">
        <p className="text-xs text-muted">{hint}</p>
        <TileGrid>
          <Tile
            label="Dépense pub"
            value={spend == null ? "—" : formatTND(spend)}
            change={change(spend, prevTotal.platform.spend, "money", null)}
            sub={account.spendPerDay != null ? `${formatTND(account.spendPerDay)} / jour` : undefined}
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
            sub={`${f.delivered} livrée${f.delivered > 1 ? "s" : ""} · ${f.open} en cours`}
            help="Commandes passées depuis un lien de publicité, tous statuts."
          />
          <KpiTile k={k} prev={kp} kpi="costPerDelivered" period={q} sub={cpdSub.length ? cpdSub.join(" · ") : undefined} empty={spend != null ? "Aucune commande livrée pour l'instant." : undefined} />
          <KpiTile k={k} prev={kp} kpi="roasDelivered" period={q} sub={k.breakEvenRoas != null ? `minimum ${kpiText(k, "breakEvenRoas")}` : undefined} />
          <KpiTile k={k} prev={kp} kpi="poas" period={q} />
          <KpiTile k={k} prev={kp} kpi="contribution" period={q} sub={k.projection?.projected && k.projection.contribution != null ? `projection ${kpiText(k, "projectedContribution")}` : undefined} />
          <KpiTile k={k} prev={kp} kpi="orderRate" period={q} sub={`${fmt(f.sessions, "int")} visites`} empty="Aucune visite comptée." />
          <KpiTile k={k} prev={kp} kpi="confirmRate" period={q} sub={`${f.confirmed} sur ${k.decided} appelée${k.decided > 1 ? "s" : ""}`} empty="Aucune commande appelée." />
          <KpiTile k={k} prev={kp} kpi="deliveryRate" period={q} sub={`${f.delivered} livrée${f.delivered > 1 ? "s" : ""}, ${f.back} revenue${f.back > 1 ? "s" : ""}`} empty="Aucun colis arrivé au bout." />
          <KpiTile k={k} prev={kp} kpi="aov" period={q} sub={k.unitsPerOrder != null ? `${kpiText(k, "unitsPerOrder")} article(s) par commande` : undefined} empty="Aucune commande." />
        </TileGrid>
        {k.projection?.projected && <p className="text-xs leading-relaxed text-muted">{k.projection.note}</p>}
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Card title="À faire d'abord" hint={`Ce que disent les chiffres, le plus urgent en haut. Analyse ${byCampaign ? "par campagne" : "par source"}.`}>
          <InsightList insights={insights} limit={6} period={q} empty="Rien à signaler sur la période." />
        </Card>
        <div className="flex min-w-0 flex-col gap-4">
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
                {formatTND(unassigned)} de dépense sans campagne : comptés dans les chiffres du haut, pas dans les campagnes.
              </p>
            )}
          </Card>
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
    </div>
  );
}

/**
 * The account in one box: the advisor's sentence about it when the money can
 * be judged (with its evidence and what to do), else the account's verdict
 * and its reasons (waiting for data, a broken measure, no margin).
 */
function AccountVerdict({ advice, headline, rowsCount, byCampaign, q }: { advice: RowAdvice; headline: Insight | null; rowsCount: number; byCampaign: boolean; q: string }) {
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
        {rowsCount > 0 && (
          <p className="mt-2 text-xs text-muted">
            Le budget se règle {level} par {level} : voir le verdict de chacune plus bas
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
              <div className="min-w-0">
                {linked ? (
                  <Link href={withPeriod(`/admin/publicites/campagnes#${rowId(row.key)}`, q)} className="block truncate text-[13px] font-medium text-ink hover:underline">
                    {name}
                  </Link>
                ) : (
                  <p className="truncate text-[13px] font-medium text-ink">{name}</p>
                )}
                <p className="text-xs text-muted">
                  {row.campaign ? `${sourceLabel(row.source)} · ` : ""}
                  {row.platform.spend != null ? `${formatTND(row.platform.spend)} dépensés` : "dépense inconnue"}
                  {a.judgedCpd != null && ` · ${formatTND(a.judgedCpd)} par livrée${projected ? " (projection)" : ""}`}
                  {a.target != null && ` · max ${formatTND(a.target)}`}
                </p>
              </div>
              <div className="flex shrink-0 items-start gap-3 text-[13px]">
                <Budget change={a.budgetChange} />
                <VerdictBadge verdict={a.verdict} />
              </div>
            </li>
          );
        })}
      </ul>
      {list.length > shown.length && <p className="pt-2 text-xs text-muted">Et {list.length - shown.length} autre(s) dans Campagnes.</p>}
    </>
  );
}
