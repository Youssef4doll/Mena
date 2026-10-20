"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { btn, input } from "@/components/admin/ui";
import { AD_PRESETS, DEFAULT_PRESET, periodQuery, withPeriod } from "./range";

/**
 * The tab bar and the period picker of the "Publicités" section, shared by
 * its eight tabs through the layout. A layout cannot read the address's
 * query, so this runs in the browser: the tabs carry the period along, and
 * the picker keeps the tab's own parameters (a metric, a campaign) while it
 * changes the period.
 *
 *   AD_TABS        the tabs, in order: key = path under /admin/publicites ("" for the overview)
 *   NO_PERIOD      tabs that do not depend on a period: the picker is hidden there
 *   <AdsNav />     wrap in <Suspense> (it reads the query); <AdsNavFallback /> is its static stand-in
 */

const BASE = "/admin/publicites";

export const AD_TABS = [
  { key: "", label: "Vue d'ensemble" },
  { key: "campagnes", label: "Campagnes" },
  { key: "creatives", label: "Créatives" },
  { key: "seuils", label: "Seuils" },
  { key: "audience", label: "Audience" },
  { key: "clients", label: "Clients" },
  { key: "idees", label: "Idées" },
  { key: "importer", label: "Importer" },
] as const;

/** The import reads a file, not a period. */
export const NO_PERIOD: string[] = ["importer"];

const PERIOD_KEYS = ["p", "from", "to"];

function tabOf(pathname: string): string {
  const rest = pathname.startsWith(BASE) ? pathname.slice(BASE.length).replace(/^\//, "") : "";
  return rest.split("/")[0] ?? "";
}

function TabBar({ current, period }: { current: string; period: string }) {
  return (
    <nav aria-label="Onglets publicités" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 no-scrollbar lg:mx-0 lg:flex-wrap lg:px-0">
      {AD_TABS.map((t) => {
        const href = t.key ? `${BASE}/${t.key}` : BASE;
        const active = t.key === current;
        return (
          <Link
            key={t.key}
            href={NO_PERIOD.includes(t.key) ? href : withPeriod(href, period)}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-10 shrink-0 items-center rounded-full border px-3.5 text-[13px] ${active ? "border-ink bg-ink text-white" : "border-line bg-white text-ink-2 hover:border-ink-2"}`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AdsNav() {
  const pathname = usePathname();
  const sp = useSearchParams();
  const current = tabOf(pathname);
  const period = periodQuery({ p: sp.get("p") ?? undefined, from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined });
  const p = sp.get("p");
  const active = p === "custom" && period.startsWith("p=custom") ? "custom" : AD_PRESETS.some((x) => x.key === p) ? p : DEFAULT_PRESET;
  // The tab's own parameters, kept when the period changes.
  const own = [...sp.entries()].filter(([k]) => !PERIOD_KEYS.includes(k));
  const href = (q: string) => {
    const all = [...own.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`), q].filter(Boolean).join("&");
    return all ? `${pathname}?${all}` : pathname;
  };

  return (
    <div className="flex flex-col gap-3">
      <TabBar current={current} period={period} />
      {!NO_PERIOD.includes(current) && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="hidden text-xs text-muted sm:inline">Période</span>
          {AD_PRESETS.map((x) => (
            <Link
              key={x.key}
              href={href(x.key === DEFAULT_PRESET ? "" : `p=${x.key}`)}
              aria-current={active === x.key ? "true" : undefined}
              aria-label={x.label}
              className={`flex min-h-10 min-w-10 items-center justify-center rounded-full border px-3 text-[13px] ${active === x.key ? "border-sea bg-sea-soft font-medium text-sea-2" : "border-line bg-white text-ink-2"}`}
            >
              <span className="sm:hidden" aria-hidden>{x.days} j</span>
              <span className="hidden sm:inline" aria-hidden>{x.label}</span>
            </Link>
          ))}
          <details className="group" open={active === "custom" || undefined}>
            <summary className={`flex min-h-10 cursor-pointer list-none items-center rounded-full border px-3 text-[13px] ${active === "custom" ? "border-sea bg-sea-soft font-medium text-sea-2" : "border-line bg-white text-ink-2"}`}>
              <span className="sm:hidden">Dates</span>
              <span className="hidden sm:inline">Autres dates</span>
            </summary>
            <form action={pathname} className="mt-2 flex flex-wrap items-center gap-1.5">
              {own.map(([k, v]) => (
                <input key={k} type="hidden" name={k} value={v} />
              ))}
              <input type="hidden" name="p" value="custom" />
              <input type="date" name="from" defaultValue={sp.get("from") ?? ""} className={`${input} w-[150px]`} aria-label="Du" required />
              <input type="date" name="to" defaultValue={sp.get("to") ?? ""} className={`${input} w-[150px]`} aria-label="Au (inclus)" required />
              <button className={btn.ghost}>Voir</button>
            </form>
          </details>
        </div>
      )}
    </div>
  );
}

/** Shown while the query is read: the tabs without the period, nothing that moves. */
export function AdsNavFallback() {
  return <TabBar current="" period="" />;
}
