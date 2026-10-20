import Link from "next/link";
import type { Input } from "@/lib/ads/kpis";
import { FIX_LINKS, fixHref, MISSING_GROUPS, missingItems } from "./format";

/**
 * What the owner has not given yet, and where to give it. A missing input
 * leaves figures at "—"; these say why and link to the fix.
 *
 *   <MissingList inputs={k.missing} extra={[{ label, href, cta }]} period={q} />
 *     Grouped by what each input unlocks (MISSING_GROUPS), each line with its
 *     link. `extra` adds lines that are not KPI inputs (a pixel, a token).
 *     Renders `done` (or nothing) when there is nothing to list.
 *   <MissingNote inputs={whyMissing(k, "poas")} period={q} />
 *     One sentence for a row or a figure: "Manque : … Corriger".
 */

export type ExtraMissing = { label: string; href: string; cta: string };

export function MissingList({ inputs, extra = [], period = "", done }: { inputs: Input[]; extra?: ExtraMissing[]; period?: string; done?: string }) {
  const items = missingItems(inputs);
  if (items.length === 0 && extra.length === 0) return done ? <p className="text-sm text-muted">{done}</p> : null;
  const groups = MISSING_GROUPS.map((g) => ({ title: g.title, items: items.filter((i) => g.inputs.includes(i.input)) })).filter((g) => g.items.length > 0);
  return (
    <div className="flex flex-col gap-3 text-[13px]">
      {groups.map((g) => (
        <div key={g.title}>
          <p className="text-xs font-medium text-muted">{g.title}</p>
          <ul className="mt-1 divide-y divide-line">
            {g.items.map((i) => (
              <li key={i.input} className="flex flex-wrap items-center justify-between gap-x-3">
                <span className="py-2 text-ink-2">{i.label.charAt(0).toUpperCase() + i.label.slice(1)}</span>
                {i.fix ? (
                  <Link href={fixHref(i.fix, period)} className="inline-flex min-h-10 items-center font-medium text-sea underline">
                    {FIX_LINKS[i.fix].label}
                  </Link>
                ) : (
                  <span className="py-2 text-xs text-muted">viendra avec les premières commandes terminées</span>
                )}
              </li>
            ))}
            {g.items.some((i) => i.input === "spend") && (
              <li className="flex flex-wrap items-center justify-between gap-x-3">
                <span className="py-2 text-xs text-muted">Ou à la main, jour par jour</span>
                <Link href={FIX_LINKS.spend.href} className="inline-flex min-h-10 items-center font-medium text-sea underline">
                  {FIX_LINKS.spend.label}
                </Link>
              </li>
            )}
          </ul>
        </div>
      ))}
      {extra.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted">Suivi des publicités</p>
          <ul className="mt-1 divide-y divide-line">
            {extra.map((x) => (
              <li key={x.label} className="flex flex-wrap items-center justify-between gap-x-3">
                <span className="py-2 text-ink-2">{x.label}</span>
                <Link href={x.href} className="inline-flex min-h-10 items-center font-medium text-sea underline">
                  {x.cta}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function MissingNote({ inputs, period = "" }: { inputs: Input[]; period?: string }) {
  const items = missingItems(inputs);
  if (items.length === 0) return null;
  const fix = items.find((i) => i.fix)?.fix;
  return (
    <p className="text-xs leading-snug text-[#8a5a00]">
      Manque : {items.map((i) => i.label).join(", ")}.
      {fix && (
        <>
          {" "}
          <Link href={fixHref(fix, period)} className="underline">
            {FIX_LINKS[fix].label}
          </Link>
        </>
      )}
    </p>
  );
}
