"use client";

import { buildAdLink, MACROS, suggestCampaign, type AdPlatform } from "@/lib/ads/utm";
import type { Lang } from "@/i18n/lang";
import { input, label } from "@/components/admin/ui";
import { CopyButton } from "./Copy";

/**
 * The link to paste in the ad: the product page with the utm_* the shop
 * reads, the platform's macros by default (Meta and TikTok then write the
 * real campaign and ad names at each click, so the imported spend finds its
 * visits), and buildAdLink's checks on any name typed by hand.
 */

export type LinkState = { platform: AdPlatform; lang: Lang; source: string; campaign: string; adSet: string; ad: string };

const PLATFORMS: { key: AdPlatform; label: string }[] = [
  { key: "meta", label: "Meta" },
  { key: "tiktok", label: "TikTok" },
  { key: "other", label: "Autre" },
];
const LEVEL_TONE = { error: "text-danger", warning: "text-[#8a5a00]", info: "text-ink-2" } as const;

export function LinkBuilder({ state, onChange, site, slug, today, known }: { state: LinkState; onChange: (s: LinkState) => void; site: string; slug: string; today: string; known: { campaigns: string[]; ads: string[] } }) {
  const link = buildAdLink({ site, slug, lang: state.lang, platform: state.platform, source: state.source, campaign: state.campaign, adSet: state.adSet, ad: state.ad, known });
  const set = (patch: Partial<LinkState>) => onChange({ ...state, ...patch });
  const macro = state.platform === "other" ? null : MACROS[state.platform];
  const base = link.url.split("?")[0];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-4">
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-[13px] font-medium text-ink-2">Plateforme</legend>
          <div className="flex gap-1.5">
            {PLATFORMS.map((p) => (
              <button key={p.key} type="button" aria-pressed={state.platform === p.key} onClick={() => set({ platform: p.key })} className={`h-10 rounded-full border px-4 text-[13px] ${state.platform === p.key ? "border-ink bg-ink text-white" : "border-line bg-white text-ink-2"}`}>
                {p.label}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-[13px] font-medium text-ink-2">Langue de la page</legend>
          <div className="flex gap-1.5">
            {(["ar", "fr"] as const).map((l) => (
              <button key={l} type="button" aria-pressed={state.lang === l} onClick={() => set({ lang: l })} className={`h-10 rounded-full border px-4 text-[13px] ${state.lang === l ? "border-ink bg-ink text-white" : "border-line bg-white text-ink-2"}`}>
                {l === "ar" ? "Arabe" : "Français"}
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {state.platform === "other" && (
          <label className={label}>
            Source
            <input value={state.source} onChange={(e) => set({ source: e.target.value })} placeholder="snapchat, influenceur…" className={input} />
          </label>
        )}
        <div className="flex flex-col gap-1">
          <label className={label}>
            Campagne
            <input value={state.campaign} onChange={(e) => set({ campaign: e.target.value })} placeholder={macro ? `vide : ${macro.campaign}` : "nom de la campagne"} className={input} />
          </label>
          <button type="button" onClick={() => set({ campaign: suggestCampaign(slug, today) })} className="flex min-h-10 items-center self-start text-xs text-sea underline underline-offset-4">
            Proposer « {suggestCampaign(slug, today)} »
          </button>
        </div>
        <label className={label}>
          Ensemble de publicités
          <input value={state.adSet} onChange={(e) => set({ adSet: e.target.value })} placeholder={macro ? `vide : ${macro.adSet}` : "facultatif"} className={input} />
        </label>
        <label className={label}>
          Publicité
          <input value={state.ad} onChange={(e) => set({ ad: e.target.value })} placeholder={macro ? `vide : ${macro.ad}` : "nom de la publicité"} className={input} />
        </label>
      </div>

      {link.checks.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm">
          {link.checks.map((c, i) => (
            <li key={i} className={LEVEL_TONE[c.level]}>
              {c.level === "error" ? "Bloquant : " : c.level === "warning" ? "Attention : " : ""}
              {c.message}
            </li>
          ))}
        </ul>
      )}

      {link.ok && (
        <div className="grid gap-3 lg:grid-cols-2">
          {state.platform === "meta" ? (
            <>
              <Out title="Champ « Site web » de la publicité" text={base} />
              <Out title="Champ « Paramètres d'URL »" text={link.params} />
            </>
          ) : (
            <>
              <Out title={state.platform === "tiktok" ? "Champ « URL de destination »" : "Adresse complète"} text={link.url} />
              <Out title="Paramètres seuls" text={link.params} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Out({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-xl border border-line bg-cream/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted">{title}</span>
        <CopyButton text={text} />
      </div>
      <code className="break-all font-mono text-[13px] text-ink">{text}</code>
    </div>
  );
}
