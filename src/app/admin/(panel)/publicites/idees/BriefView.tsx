"use client";

import { formatTND } from "@/lib/money";
import { fmt } from "@/lib/viz";
import { copyWarnings, type Angle, type Brief, type BriefInput } from "@/lib/ads/brief";
import { Badge, btn } from "@/components/admin/ui";
import { TextPair } from "./Copy";

/**
 * The creative brief of one product, as buildBrief wrote it: what the
 * numbers say to fix, the angles best first with their texts ready to copy,
 * then the formats, shots, facts, rules, test plan and cost ceilings, folded
 * so the angles stay in view on a phone. Every text is checked again with
 * copyWarnings next to its copy button.
 */

const money = (v: number | null) => (v == null ? "—" : formatTND(v));
const FORMAT_LABEL = { video: "Vidéo 9:16", carousel: "Carrousel", static: "Image" } as const;

export function BriefView({ brief, input, onUseName }: { brief: Brief; input: BriefInput; onUseName: (name: string) => void }) {
  const warn = (text: string) => copyWarnings(text, input);
  const extraHooks = brief.hooks.filter((h) => h.angle == null);
  return (
    <div className="flex flex-col gap-4">
      {brief.missing.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-xl border border-[#f0d9a8] bg-[#fff8e8] px-3 py-2.5 text-sm text-[#8a5a00]">
          {brief.missing.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}

      {brief.focus.length > 0 && (
        <div>
          <h3 className="mb-2 text-[13px] font-semibold text-ink">Ce que les chiffres du produit demandent ({brief.days} jours)</h3>
          <ul className="grid gap-2 md:grid-cols-2">
            {brief.focus.map((f) => (
              <li key={f.key} className="rounded-xl border border-line px-3 py-2.5 text-sm">
                <p className="font-medium text-ink">{f.title}</p>
                <p className="text-ink-2">{f.evidence}</p>
                <p className="mt-1 text-ink"><span className="text-muted">À faire : </span>{f.action}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h3 className="mb-2 text-[13px] font-semibold text-ink">Angles à tourner, le plus prometteur d&apos;abord</h3>
        <div className="flex flex-col gap-2">
          {brief.angles.map((a, i) => (
            <AngleCard key={a.key} angle={a} rank={i + 1} open={i === 0} warn={warn} onUseName={onUseName} />
          ))}
        </div>
      </div>

      <Fold title="Autres accroches (3 premières secondes)">
        <ul className="flex flex-col gap-2">
          {extraHooks.map((h, i) => (
            <li key={i} className="grid gap-2 rounded-xl border border-line p-3 text-sm md:grid-cols-[1fr_2fr]">
              <p className="text-ink-2"><span className="block text-xs text-muted">À l&apos;image</span>{h.visual}</p>
              <TextPair title="Texte à l'écran" fr={h.text.fr} ar={h.text.ar} warn={warn} />
            </li>
          ))}
        </ul>
      </Fold>

      <Fold title="Formats">
        <div className="grid gap-3 md:grid-cols-3">
          {brief.formats.map((f) => (
            <div key={f.key} className="rounded-xl border border-line p-3 text-sm">
              <p className="font-medium text-ink">{f.label}</p>
              <p className="text-xs text-muted">{f.where}</p>
              <ol className="mt-2 list-decimal space-y-0.5 ps-5 text-ink-2">
                {f.structure.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
              <ul className="mt-2 space-y-0.5 text-xs text-muted">
                {f.tips.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Fold>

      <Fold title="Plans à tourner">
        <ul className="list-disc space-y-1 ps-5 text-sm text-ink-2">
          {brief.shots.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
        <ul className="mt-2 space-y-0.5 text-xs text-muted">
          {brief.assets.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </Fold>

      <Fold title="Bouton et appel à l'action">
        <p className="mb-2 text-sm text-ink-2">Bouton : {brief.cta.button}</p>
        <TextPair title="Dernière phrase" fr={brief.cta.text.fr} ar={brief.cta.text.ar} warn={warn} />
      </Fold>

      <Fold title="Faits que les textes peuvent utiliser">
        <p className="mb-2 text-xs text-muted">Tout ce qu&apos;une publicité dit vient de cette liste : rien d&apos;autre.</p>
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table className="w-full min-w-[480px] text-[13px]">
            <tbody className="divide-y divide-line">
              {brief.facts.map((f, i) => (
                <tr key={i}>
                  <th scope="row" className="py-1.5 pe-3 text-start align-top font-normal text-muted">{f.label}</th>
                  <td className="py-1.5 pe-3 align-top text-ink">{f.fr}</td>
                  <td dir="rtl" lang="ar" className="py-1.5 align-top text-ink">{f.ar ?? <span className="text-muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Fold>

      <Fold title="Règles à respecter">
        <ul className="list-disc space-y-1 ps-5 text-sm text-ink-2">
          {brief.compliance.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </Fold>

      <Fold title="Plan de test">
        <ol className="list-decimal space-y-1 ps-5 text-sm text-ink-2">
          {brief.tests.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ol>
      </Fold>

      <Fold title="Plafonds de coût (estimation)">
        <p className="mb-2 text-xs text-muted">
          Avec la confirmation ({fmt(brief.ceilings.confirmRate, "pct")}) et la livraison ({fmt(brief.ceilings.deliveryRate, "pct")}) de ce produit, rapprochées de celles de la boutique. Détail par offre dans l&apos;onglet Seuils.
        </p>
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table className="w-full min-w-[420px] text-[13px]">
            <thead className="text-xs text-muted">
              <tr className="border-b border-line">
                <th className="py-1.5 pe-3 text-start font-medium">Offre</th>
                <th className="px-2 text-end font-medium">Marge par livrée</th>
                <th className="px-2 text-end font-medium">Coût max par livrée</th>
                <th className="ps-2 text-end font-medium">CPA max</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line tabular-nums">
              {brief.ceilings.rows.map((r) => (
                <tr key={r.key}>
                  <td className="py-1.5 pe-3">{r.label}</td>
                  <td className={`px-2 text-end ${r.margin != null && r.margin <= 0 ? "text-clay" : ""}`}>{money(r.margin)}</td>
                  <td className="px-2 text-end">{money(r.maxCostPerDelivered)}</td>
                  <td className="ps-2 text-end">{money(r.maxCpa)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {brief.ceilings.missing.length > 0 && <p className="mt-2 text-xs text-[#8a5a00]">Il manque : {brief.ceilings.missing.join(", ")}.</p>}
      </Fold>
    </div>
  );
}

function Fold({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-xl border border-line">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 text-sm font-medium text-ink [&::-webkit-details-marker]:hidden">
        {title}
        <span aria-hidden className="text-muted transition-transform group-open:rotate-180">▾</span>
      </summary>
      <div className="px-3 pb-3">{children}</div>
    </details>
  );
}

function AngleCard({ angle: a, rank, open, warn, onUseName }: { angle: Angle; rank: number; open: boolean; warn: (t: string) => string[]; onUseName: (name: string) => void }) {
  return (
    <details open={open} className="group rounded-xl border border-line bg-white">
      <summary className="flex min-h-12 cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 [&::-webkit-details-marker]:hidden">
        <span className="text-sm font-medium text-ink">
          {rank}. {a.title}
        </span>
        <Badge tone="info">{FORMAT_LABEL[a.format]}</Badge>
        {a.boost && <Badge tone="ok">prioritaire</Badge>}
        <span aria-hidden className="ms-auto text-muted transition-transform group-open:rotate-180">▾</span>
      </summary>
      <div className="flex flex-col gap-3 border-t border-line p-3 text-sm">
        <p className="text-ink-2">{a.why}</p>
        {a.boost && <p className="text-olive">{a.boost}</p>}
        <p className="text-ink-2"><span className="block text-xs text-muted">À filmer</span>{a.show}</p>
        <div className="grid gap-2 md:grid-cols-[1fr_2fr]">
          <p className="text-ink-2"><span className="block text-xs text-muted">Accroche, à l&apos;image</span>{a.hook.visual}</p>
          <TextPair title="Accroche à l'écran" fr={a.hook.text.fr} ar={a.hook.text.ar} warn={warn} />
        </div>
        <TextPair title="Texte principal (Meta)" fr={a.primary.fr} ar={a.primary.ar} warn={warn} />
        <TextPair title="Titre (Meta)" fr={a.headline.fr} ar={a.headline.ar} warn={warn} />
        <TextPair title="Texte TikTok" fr={a.caption.fr} ar={a.caption.ar} warn={warn} />
        {a.caution && <p className="text-[#8a5a00]">Attention : {a.caution}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <OneTextName name={a.adName} />
          <button type="button" className={btn.ghost} onClick={() => onUseName(a.adName)}>
            Utiliser ce nom dans le lien
          </button>
        </div>
      </div>
    </details>
  );
}

/** The ad's name for Ads Manager and its utm_content, in a box easy to read on a phone. */
function OneTextName({ name }: { name: string }) {
  return (
    <span className="min-w-0 rounded-lg bg-sand px-2 py-1 font-mono text-[13px] text-ink">
      <span className="me-1 font-sans text-xs text-muted">Nom de la publicité</span>
      {name}
    </span>
  );
}

