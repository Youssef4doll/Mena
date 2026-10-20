import { Badge } from "@/components/admin/ui";
import type { Advice } from "@/lib/ads/types";
import { AD_VERDICTS, budgetText, CONFIDENCE, VERDICTS } from "./format";

/**
 * The advisor's verdict for a row, written the same way on every tab.
 *
 *   <VerdictBadge verdict="scale" confidence="medium" ad? />   badge, and the confidence under it when given; `ad`: an ad's wording (AD_VERDICTS)
 *   <Budget change={20} perDay="12,000 DT" prefix />        "Budget +20 %" and the current spend per day under it;
 *                                                         nothing when the advisor gives no budget change
 *
 * The badge's title carries the one-line meaning of the verdict (VERDICTS[v].hint).
 */

export function VerdictBadge({ verdict, confidence, ad = false }: { verdict: Advice["verdict"]; confidence?: Advice["confidence"] | null; ad?: boolean }) {
  const v = { ...VERDICTS[verdict], ...(ad ? AD_VERDICTS[verdict] : undefined) };
  return (
    <span className="inline-flex flex-col items-start gap-0.5" title={v.hint}>
      <Badge tone={v.tone}>{v.label}</Badge>
      {confidence && <span className="whitespace-nowrap text-[11px] text-muted">{CONFIDENCE[confidence]}</span>}
    </span>
  );
}

export function Budget({ change, perDay, prefix = false }: { change: number | null | undefined; perDay?: string | null; prefix?: boolean }) {
  if (change == null) return null;
  const word = budgetText(change);
  const text = prefix && change > -100 ? `Budget ${change === 0 ? word.toLowerCase() : word}` : word;
  const tone = change === 0 ? "text-ink-2" : change > 0 ? "text-olive" : "text-clay";
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <span className={`whitespace-nowrap font-medium ${tone}`}>{text}</span>
      {perDay && <span className="whitespace-nowrap text-[11px] text-muted">dépense {perDay} / jour</span>}
    </span>
  );
}
