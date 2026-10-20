import Link from "next/link";
import { Badge } from "@/components/admin/ui";
import type { Insight } from "@/lib/ads/types";
import { FIX_LINKS, fixHref, SEVERITIES } from "./format";

/**
 * The advisor's insights (src/lib/ads/advisor.ts), as cards.
 *
 *   <InsightCard insight={i} period={q} />
 *     Severity, title, the evidence with its numbers, what to do, and a link
 *     to the page that fixes it when the insight has a `fix`.
 *   <InsightList insights={report.insights} limit={6} period={q} empty="…" />
 *     The first `limit` in order (advise() sorts them, critical first), the
 *     rest folded under "Voir les N autres".
 *
 * `period` is the period part of the address (rangeQuery(r)), kept on links
 * that stay in the ads section.
 */

export function InsightCard({ insight, period = "" }: { insight: Insight; period?: string }) {
  const s = SEVERITIES[insight.severity];
  return (
    <li className={`flex flex-col gap-1.5 rounded-xl border border-s-4 border-line ${s.edge} bg-white p-3`}>
      <div className="flex flex-wrap items-start gap-2">
        <Badge tone={s.tone}>{s.label}</Badge>
        <h3 className="min-w-0 flex-1 text-[14px] font-semibold leading-snug text-ink">{insight.title}</h3>
      </div>
      <p className="text-[13px] leading-relaxed text-ink-2">{insight.evidence}</p>
      <p className="text-[13px] leading-relaxed text-ink">
        <span className="font-medium">À faire : </span>
        {insight.action}
      </p>
      {insight.fix && (
        <Link href={fixHref(insight.fix, period)} className="inline-flex min-h-10 items-center self-start text-[13px] font-medium text-sea underline">
          {FIX_LINKS[insight.fix].label}
        </Link>
      )}
    </li>
  );
}

export function InsightList({ insights, limit = 6, period = "", empty }: { insights: Insight[]; limit?: number; period?: string; empty?: string }) {
  if (insights.length === 0) return empty ? <p className="text-sm text-muted">{empty}</p> : null;
  const first = insights.slice(0, limit);
  const rest = insights.slice(limit);
  const key = (i: Insight, n: number) => `${i.key ?? "compte"}-${n}-${i.title}`;
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {first.map((i, n) => (
          <InsightCard key={key(i, n)} insight={i} period={period} />
        ))}
      </ul>
      {rest.length > 0 && (
        <details>
          <summary className="flex min-h-10 cursor-pointer items-center text-[13px] font-medium text-sea">Voir {rest.length === 1 ? "l'autre" : `les ${rest.length} autres`}</summary>
          <ul className="mt-1 flex flex-col gap-2">
            {rest.map((i, n) => (
              <InsightCard key={key(i, n + limit)} insight={i} period={period} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
