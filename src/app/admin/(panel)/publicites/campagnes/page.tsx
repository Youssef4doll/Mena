import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";
import { adRows, dailyByRow } from "@/lib/ads/data";
import { advise } from "@/lib/ads/advisor";
import { rowKey } from "@/lib/ads/match";
import type { AdRow } from "@/lib/ads/types";
import { Card } from "@/components/admin/ui";
import { adRange, periodText, rangeQuery, withPeriod } from "../_ui/range";
import { adsBasics } from "../_ui/server";
import { VERDICTS } from "../_ui/format";
import { InsightList } from "../_ui/Insight";
import { CampaignTable, type CampaignItem, type Line } from "./CampaignTable";

export const metadata = { title: "Campagnes · Publicités" };

/** Row-level advice shown above the table; the overview has the account's. */
const TOP_INSIGHTS = 4;

/**
 * Campagnes: every campaign of the period with its verdict and every KPI,
 * sortable; a campaign unfolds into why the verdict, its funnel, all its
 * figures, and its ads (utm_content) with their own verdicts. Campaigns and
 * ads are each advised as one level (advise() compares a row with the rest
 * of its level).
 */
export default async function CampaignsPage({ searchParams }: PageProps<"/admin/publicites/campagnes">) {
  await requireAdmin();
  const r = adRange(await searchParams);
  const q = rangeQuery(r);
  // Ad links only, as on the overview: a link tagged utm_medium=social or email (a bio, a post) is not an ad.
  const paid = { paidOnly: true };
  const [campaigns, ads, dCampaigns, dAds, { costs, baseline, tracking }] = await Promise.all([
    adRows(r.from, r.to, "campaign", paid),
    adRows(r.from, r.to, "ad", paid),
    dailyByRow(r.from, r.to, "campaign", paid),
    dailyByRow(r.from, r.to, "ad", paid),
    adsBasics(r.to),
  ]);
  const report = advise({ rows: campaigns, costs, baseline, days: r.days, daily: dCampaigns, tracking });
  const adReport = advise({ rows: ads, costs, baseline, days: r.days, daily: dAds, tracking });

  const adsOf = new Map<string, Line[]>();
  ads.forEach((row, i) => {
    const parent = rowKey("campaign", row.source, row.campaign);
    adsOf.set(parent, [...(adsOf.get(parent) ?? []), { row, advice: adReport.rows[i] }]);
  });
  const known = new Set(campaigns.map((c) => c.key));
  const loose = ads.filter((a: AdRow) => !known.has(rowKey("campaign", a.source, a.campaign))).length;
  const items: CampaignItem[] = campaigns.map((row, i) => ({ row, advice: report.rows[i], ads: adsOf.get(row.key) ?? [] }));

  const counts = Object.entries(VERDICTS)
    .map(([v, meta]) => ({ v, meta, n: report.rows.filter((a) => a.verdict === v).length }))
    .filter((x) => x.n > 0)
    .sort((a, b) => a.meta.rank - b.meta.rank);
  const rowInsights = report.insights.filter((i) => i.key != null).slice(0, TOP_INSIGHTS);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted">
        Période {periodText(r)}. Une ligne par campagne (le nom utm_campaign de ses liens de publicité) ; la flèche déplie le détail et ses publicités (utm_content). Les liens marqués utm_medium=social ou email (bio, publication) et les commandes saisies dans l&apos;admin n&apos;y sont pas.
      </p>

      {counts.length > 0 && (
        <ul className="flex flex-wrap gap-2 text-[13px]" aria-label="Verdicts">
          {counts.map((x) => (
            <li key={x.v} className="flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5" title={x.meta.hint}>
              <span className="text-ink-2">{x.meta.label}</span>
              <span className="font-semibold tabular-nums text-ink">{x.n}</span>
            </li>
          ))}
        </ul>
      )}

      {rowInsights.length > 0 && (
        <Card title="À retenir sur les campagnes" hint="Le plus urgent en haut. Le reste est dans le détail de chaque ligne.">
          <InsightList insights={rowInsights} limit={2} period={q} />
        </Card>
      )}

      <Card title="Campagnes" hint={campaigns.length > 0 ? "Triez en touchant un titre de colonne. « — » : chiffre impossible à calculer ; dépliez la ligne pour voir ce qui manque." : undefined}>
        <CampaignTable
          items={items}
          total={campaigns.length > 1 ? { row: report.total.row, advice: report.total.advice } : null}
          period={q}
          empty="Aucune campagne sur la période : aucune visite ni commande avec utm_campaign, et aucune dépense saisie par campagne."
        />
        {campaigns.length === 0 && (
          <p className="mt-2 flex flex-wrap gap-x-4 text-[13px]">
            <Link href={withPeriod("/admin/publicites/idees#liens", q)} className="inline-flex min-h-10 items-center font-medium text-sea underline">
              Créer un lien avec ses UTM
            </Link>
            <Link href="/admin/publicites/importer" className="inline-flex min-h-10 items-center font-medium text-sea underline">
              Importer un export Meta ou TikTok
            </Link>
          </p>
        )}
        {loose > 0 && (
          <p className="mt-3 text-xs text-muted">
            {loose} publicité{loose > 1 ? "s" : ""} sans campagne connue : voir{" "}
            <Link href={withPeriod("/admin/publicites/creatives", q)} className="underline">
              Créatives
            </Link>
            .
          </p>
        )}
      </Card>
    </div>
  );
}
