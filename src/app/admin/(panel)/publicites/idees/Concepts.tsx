"use client";

import { useMemo, useState, useTransition } from "react";
import { DEFAULT_IDEAS, MAX_IDEAS, MIN_IDEAS, conceptWarnings, ideaCount, ideasRequest, readIdeasReply, type IdeaConcept } from "@/lib/ads/ideas-prompt";
import type { BriefInput } from "@/lib/ads/brief";
import { generateAdIdeas } from "../ideas-actions";
import { Badge, btn, input as inputCls } from "@/components/admin/ui";
import { CopyButton, TextPair } from "./Copy";

/**
 * New ad concepts for the product. Without an API key the owner copies the
 * request (ideasRequest) into claude.ai and pastes the JSON reply back
 * (readIdeasReply checks it in the browser); with one, "Générer" asks the
 * server. Either way each concept comes with the rules its texts break.
 * Nothing is saved.
 */

const ANGLE_LABEL: Record<IdeaConcept["angle"], string> = {
  demo: "Démonstration",
  problem: "Problème et solution",
  beforeAfter: "Avant / après",
  testimonial: "Témoignage",
  offer: "Offre",
  unboxing: "Déballage",
  gift: "Cadeau",
  other: "Autre",
};
const FORMAT_LABEL: Record<IdeaConcept["format"], string> = { video: "Vidéo 9:16", carousel: "Carrousel", static: "Image" };

export function Concepts({ input, aiReady, onUseName }: { input: BriefInput; aiReady: boolean; onUseName: (name: string) => void }) {
  const [count, setCount] = useState(DEFAULT_IDEAS);
  const [reply, setReply] = useState("");
  const [bad, setBad] = useState(false);
  const [concepts, setConcepts] = useState<{ list: IdeaConcept[]; warnings: string[][]; from: "claude" | "api" } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generating, start] = useTransition();

  const request = useMemo(() => ideasRequest(input, count), [input, count]);

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
        Nombre d&apos;idées
        <select value={count} onChange={(e) => setCount(ideaCount(e.target.value))} className={inputCls.replace("w-full", "w-24")}>
          {Array.from({ length: MAX_IDEAS - MIN_IDEAS + 1 }, (_, i) => MIN_IDEAS + i).map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </label>

      {aiReady && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className={btn.sea}
            disabled={generating}
            onClick={() =>
              start(async () => {
                setError(null);
                try {
                  const r = await generateAdIdeas(input.product.id, count);
                  if (r.ok) setConcepts({ list: r.concepts, warnings: r.warnings, from: "api" });
                  else setError(r.error);
                } catch {
                  setError("Génération impossible : vérifiez la connexion, puis réessayez.");
                }
              })
            }
          >
            {generating ? "Écriture des idées… (jusqu'à une minute)" : `Générer ${count} idée${count > 1 ? "s" : ""}`}
          </button>
          <span className="text-xs text-muted">ou sans clé, avec claude.ai :</span>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}

      <ol className="flex flex-col gap-3 text-sm text-ink-2">
        <li className="flex flex-wrap items-center gap-2">
          <span>1.</span>
          <CopyButton text={request} label="Copier la demande pour claude.ai" className={btn.sea} />
          <span className="text-xs text-muted">{request.length.toLocaleString("fr-FR")} caractères : les faits du produit, ses chiffres et les règles.</span>
        </li>
        <li>
          2. Ouvrez <a href="https://claude.ai/new" target="_blank" rel="noopener" className="text-sea underline underline-offset-4">claude.ai</a>, collez la demande et envoyez-la.
        </li>
        <li className="flex flex-col gap-2">
          <span>3. Copiez toute la réponse (le bloc JSON) et collez-la ici :</span>
          <textarea
            aria-label="Réponse de claude.ai"
            dir="auto"
            value={reply}
            onChange={(e) => {
              setReply(e.target.value);
              setBad(false);
            }}
            className={`${inputCls} h-28 py-2 font-mono text-xs`}
            spellCheck={false}
          />
          {bad && <p role="alert" className="text-danger">Réponse illisible : copiez toute la réponse, du premier « {"{"} » au dernier « {"}"} ».</p>}
          <button
            type="button"
            className={`${btn.primary} self-start`}
            disabled={!reply.trim()}
            onClick={() => {
              const list = readIdeasReply(reply, input, count);
              if (!list) return setBad(true);
              setConcepts({ list, warnings: list.map((c) => conceptWarnings(c, input)), from: "claude" });
              setReply("");
            }}
          >
            Lire la réponse
          </button>
        </li>
      </ol>

      {concepts && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink-2">
            {concepts.list.length} idée{concepts.list.length > 1 ? "s" : ""}, {concepts.from === "api" ? "générées" : "lues dans la réponse"}. Rien n&apos;est enregistré : copiez ce que vous gardez.
          </p>
          {concepts.list.map((c, i) => (
            <ConceptCard key={`${c.adName}-${i}`} concept={c} warnings={concepts.warnings[i] ?? []} onUseName={onUseName} />
          ))}
        </div>
      )}
    </div>
  );
}

function ConceptCard({ concept: c, warnings, onUseName }: { concept: IdeaConcept; warnings: string[]; onUseName: (name: string) => void }) {
  return (
    <article className="flex flex-col gap-3 rounded-xl border border-line bg-white p-3 text-sm">
      <header className="flex flex-wrap items-center gap-2">
        <h4 className="font-medium text-ink">{c.title}</h4>
        <Badge tone="info">{ANGLE_LABEL[c.angle]}</Badge>
        <Badge>{FORMAT_LABEL[c.format]}</Badge>
      </header>
      {warnings.length > 0 && (
        <ul className="rounded-lg bg-[#fff8e8] px-3 py-2 text-xs text-[#8a5a00]">
          {warnings.map((w) => (
            <li key={w}>À revoir avant usage : {w}</li>
          ))}
        </ul>
      )}
      {c.why && <p className="text-ink-2"><span className="block text-xs text-muted">Pourquoi</span>{c.why}</p>}
      <div className="grid gap-2 md:grid-cols-[1fr_2fr]">
        <p className="text-ink-2"><span className="block text-xs text-muted">Accroche, à l&apos;image</span>{c.hookVisual}</p>
        <TextPair title="Accroche à l'écran" fr={c.hookTextFr} ar={c.hookTextAr} />
      </div>
      {c.beats.length > 0 && (
        <div className="-mx-3 overflow-x-auto px-3">
          <table className="w-full min-w-[560px] text-[13px]">
            <thead className="text-xs text-muted">
              <tr className="border-b border-line">
                <th className="py-1.5 pe-2 text-start font-medium">Temps</th>
                <th className="px-2 text-start font-medium">Plan</th>
                <th className="px-2 text-start font-medium">Texte à l&apos;écran</th>
                <th className="ps-2 text-start font-medium">Voix (derja)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line align-top">
              {c.beats.map((b, i) => (
                <tr key={i}>
                  <td className="whitespace-nowrap py-1.5 pe-2 tabular-nums text-muted">{b.time}</td>
                  <td className="px-2 py-1.5 text-ink-2">{b.shot}</td>
                  <td className="px-2 py-1.5">
                    <span dir="rtl" lang="ar" className="block text-ink">{b.onScreenAr}</span>
                    <span className="block text-ink-2">{b.onScreenFr}</span>
                  </td>
                  <td dir="rtl" lang="ar" className="ps-2 py-1.5 text-ink">{b.voiceAr}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <TextPair title="Texte principal" fr={c.primaryTextFr} ar={c.primaryTextAr} />
      <TextPair title="Titre" fr={c.headlineFr} ar={c.headlineAr} />
      <p className="text-ink-2"><span className="text-xs text-muted">Bouton : </span>{c.cta}</p>
      {c.measure && <p className="text-ink-2"><span className="block text-xs text-muted">À mesurer</span>{c.measure}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-lg bg-sand px-2 py-1 font-mono text-[13px] text-ink">
          <span className="me-1 font-sans text-xs text-muted">Nom de la publicité</span>
          {c.adName}
        </span>
        <button type="button" className={btn.ghost} onClick={() => onUseName(c.adName)}>
          Utiliser ce nom dans le lien
        </button>
      </div>
    </article>
  );
}
