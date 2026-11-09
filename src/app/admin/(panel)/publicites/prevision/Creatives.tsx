"use client";

import { useState, useTransition } from "react";
import { SCORE_LABELS, VERDICT_LABELS, readReviewReply, reviewRequest, type CreativeBrief, type CreativeReview, type ReviewResult, type ScoreKey } from "@/lib/ads/forecast-prompt";
import type { BriefInput } from "@/lib/ads/brief";
import { prepareAd, photoData, type PreparedAd } from "@/lib/client/ad-media";
import { Badge, btn, input as inputCls, label } from "@/components/admin/ui";
import { CopyButton } from "../idees/Copy";
import { reviewAds } from "./actions";

/**
 * The real ads of the plan: a picture or a video each (a video becomes still
 * frames in the browser), its texts and its ad name as in Ads Manager, the
 * ad set it goes in. Claude reads them all at once, next to the product's
 * photos: with the key on the server, or through claude.ai (the request is
 * copied, the pictures downloaded and attached, the reply pasted back).
 */

export type AdItem = { id: string; file: string; prepared: PreparedAd; adName: string; primaryText: string; headline: string; adSet: string };
export type AdSetItem = { id: string; name: string; daily: string };

const MAX_ADS = 8;
const TONE = { launch: "ok", fix: "warn", skip: "danger" } as const;
const PLACEMENT = { reels: "Reels", stories: "Stories", feed: "Fil" } as const;

export const briefOf = (a: AdItem, sets: AdSetItem[]): CreativeBrief => ({ id: a.id, kind: a.prepared.kind, seconds: a.prepared.seconds, ratio: a.prepared.ratio, primaryText: a.primaryText, headline: a.headline, adSet: sets.find((s) => s.id === a.adSet)?.name ?? "" });

export function Creatives(props: {
  input: BriefInput;
  photos: string[];
  ads: AdItem[];
  sets: AdSetItem[];
  aiReady: boolean;
  review: ReviewResult | null;
  suggestName: (n: number) => string;
  onAds: (ads: AdItem[]) => void;
  onReview: (r: ReviewResult | null, mode: "api" | "manual") => void;
  onGroup: (grouping: string[][]) => void;
}) {
  const { input, photos, ads, sets, aiReady, review } = props;
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [reply, setReply] = useState("");
  const [pictures, setPictures] = useState<{ name: string; url: string }[] | null>(null);
  const byId = new Map((review?.creatives ?? []).map((c) => [c.id, c]));

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    setAdding(true);
    const next = [...ads];
    try {
      for (const file of Array.from(files)) {
        if (next.length >= MAX_ADS) {
          setError(`${MAX_ADS} publicités au plus à la fois.`);
          break;
        }
        const used = new Set(next.map((a) => a.id));
        let n = 1;
        while (used.has(`C${n}`)) n++;
        const id = `C${n}`;
        const prepared = await prepareAd(file, id);
        next.push({ id, file: file.name, prepared, adName: props.suggestName(n), primaryText: "", headline: "", adSet: sets[0]?.id ?? "" });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fichier illisible.");
    } finally {
      setAdding(false);
      props.onAds(next);
      setPictures(null);
    }
  }

  const edit = (id: string, patch: Partial<AdItem>) => props.onAds(ads.map((a) => (a.id === id ? { ...a, ...patch } : a)));

  async function references(): Promise<string[]> {
    const out: string[] = [];
    for (const [i, m] of photos.entries()) {
      const d = await photoData(`/api/img/${m}/640`, `Photo ${i + 1}`);
      if (d) out.push(d);
    }
    return out;
  }

  function readWithClaude() {
    start(async () => {
      setError(null);
      try {
        const refs = await references();
        const r = await reviewAds(input.product.id, ads.map((a) => briefOf(a, sets)), refs, ads.map((a) => a.prepared.sheet));
        if (!r.ok) return setError(r.error);
        props.onReview(r.review, "api");
      } catch {
        setError("Envoi impossible : vérifiez la connexion, ou envoyez moins de publicités.");
      }
    });
  }

  async function preparePictures() {
    const refs = await references();
    setPictures([...refs.map((url, i) => ({ name: `photo-${i + 1}.jpg`, url })), ...ads.map((a) => ({ name: `${a.id}.jpg`, url: a.prepared.sheet }))]);
  }

  function readReply() {
    const r = readReviewReply(reply, ads.map((a) => a.id));
    if (!r) return setError("Réponse illisible : collez toute la réponse de claude.ai, avec ses accolades { }.");
    setError(null);
    setReply("");
    props.onReview(r, "manual");
  }

  return (
    <div className="flex flex-col gap-3">
      <label className={`${btn.ghost} w-fit cursor-pointer`}>
        {adding ? "Préparation des images…" : "Ajouter des publicités (images ou vidéos)"}
        <input type="file" accept="image/*,video/*" multiple className="sr-only" disabled={adding} onChange={(e) => (add(e.currentTarget.files), (e.currentTarget.value = ""))} />
      </label>
      <p className="text-xs text-muted">Les fichiers restent dans ce navigateur : seules des images réduites (une planche d&apos;images fixes par vidéo) partent vers Claude.</p>

      {ads.map((a) => {
        const r = byId.get(a.id);
        return (
          <article key={a.id} className="rounded-2xl border border-line p-3" data-testid="forecast-ad">
            <div className="flex flex-col gap-3 sm:flex-row">
              {/* eslint-disable-next-line @next/next/no-img-element -- a data URL made in the browser */}
              <img src={a.prepared.thumb} alt={`Aperçu de ${a.id}`} className="h-40 w-auto self-start rounded-lg border border-line object-contain" />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <p className="flex flex-wrap items-center gap-2 text-sm">
                  <strong className="text-ink">{a.id}</strong>
                  <span className="truncate text-muted">{a.file}</span>
                  <Badge>
                    {a.prepared.kind === "video" ? `Vidéo${a.prepared.seconds ? ` ${Math.round(a.prepared.seconds)} s` : ""}` : "Image"} · {a.prepared.ratio}
                  </Badge>
                  {r && <Badge tone={TONE[r.verdict]}>{VERDICT_LABELS[r.verdict]}</Badge>}
                  <button type="button" className="ms-auto flex h-10 items-center text-[13px] text-clay underline" onClick={() => props.onAds(ads.filter((x) => x.id !== a.id))}>
                    Retirer
                  </button>
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className={label}>
                    Nom de la publicité (comme dans le gestionnaire)
                    <input className={inputCls} value={a.adName} onChange={(e) => edit(a.id, { adName: e.target.value })} />
                  </label>
                  <label className={label}>
                    Ensemble de publicités
                    <select className={inputCls} value={a.adSet} onChange={(e) => edit(a.id, { adSet: e.target.value })}>
                      {sets.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={label}>
                    Titre
                    <input className={inputCls} value={a.headline} onChange={(e) => edit(a.id, { headline: e.target.value })} />
                  </label>
                  <label className={`${label} sm:col-span-2`}>
                    Texte principal
                    <textarea className={`${inputCls} h-20 py-2`} value={a.primaryText} onChange={(e) => edit(a.id, { primaryText: e.target.value })} />
                  </label>
                </div>
              </div>
            </div>
            {r && <ReviewView r={r} />}
          </article>
        );
      })}

      {ads.length > 0 && (
        <div className="flex flex-col gap-2 rounded-xl border border-line bg-cream/40 p-3">
          {aiReady && (
            <button type="button" className={`${btn.sea} w-fit`} disabled={busy || adding} onClick={readWithClaude}>
              {busy ? "Claude regarde les publicités… (environ 1 minute)" : review ? "Relire avec Claude" : "Faire lire les publicités par Claude"}
            </button>
          )}
          <details open={!aiReady}>
            <summary className="flex min-h-10 cursor-pointer items-center text-sm font-medium text-ink">{aiReady ? "Ou par claude.ai (copier, coller)" : "Faire lire par claude.ai"}</summary>
            <ol className="mt-2 flex list-decimal flex-col gap-2 ps-5 text-sm text-ink-2">
              <li>
                <span className="flex flex-wrap items-center gap-2">
                Préparez les images, téléchargez-les et joignez-les dans claude.ai dans cet ordre.
                {!pictures && (
                  <button type="button" className={btn.ghost} onClick={preparePictures}>
                    Préparer les images
                  </button>
                )}
                {pictures && (
                  <span className="flex flex-wrap gap-2">
                    {pictures.map((p) => (
                      <a key={p.name} href={p.url} download={p.name} className={btn.ghost}>
                        {p.name}
                      </a>
                    ))}
                  </span>
                )}
              </span>
              </li>
              <li>
                <span className="flex flex-wrap items-center gap-2">
                Copiez la demande et collez-la avec les images. <CopyButton text={reviewRequest(input, ads.map((a) => briefOf(a, sets)), photos.length)} label="Copier la demande" />
              </span>
              </li>
              <li>
                Collez ici toute sa réponse :
                <textarea aria-label="Réponse de claude.ai (publicités)" value={reply} onChange={(e) => setReply(e.target.value)} className={`${inputCls} mt-1 h-28 py-2 font-mono text-xs`} />
              </li>
            </ol>
            <button type="button" className={`${btn.ghost} mt-2`} disabled={!reply.trim()} onClick={readReply}>
              Lire la réponse
            </button>
          </details>
        </div>
      )}

      {error && <p role="alert" className="text-sm text-danger">{error}</p>}

      {review && (review.summary || review.grouping.length > 0) && (
        <div className="rounded-xl border border-line p-3 text-sm">
          {review.summary && <p className="whitespace-pre-line text-ink">{review.summary}</p>}
          {review.grouping.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-ink-2">
              <span>
                Regroupement conseillé : {review.grouping.map((g) => g.join(" + ")).join(" | ")}
                {review.groupingWhy ? `. ${review.groupingWhy}` : ""}
              </span>
              <button type="button" className={btn.ghost} onClick={() => props.onGroup(review.grouping)}>
                Appliquer ce regroupement
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ReviewView({ r }: { r: CreativeReview }) {
  const factor = (x: number) => `×${x.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 2 })}`;
  return (
    <div className="mt-3 border-t border-line pt-3 text-sm">
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-ink">
        <span>
          Clics : <strong className="tabular-nums">{factor(r.ctrFactor)}</strong>
        </span>
        <span>
          Commandes : <strong className="tabular-nums">{factor(r.convFactor)}</strong>
        </span>
        <span className="text-muted">Certitude : {{ high: "forte", medium: "moyenne", low: "faible" }[r.confidence]}</span>
        {r.angle && <span className="text-muted">Angle : {r.angle}</span>}
        {r.placements.length > 0 && <span className="text-muted">Pour : {r.placements.map((p) => PLACEMENT[p]).join(", ")}</span>}
      </p>
      <ul className="mt-2 grid gap-1 sm:grid-cols-2">
        {(Object.keys(SCORE_LABELS) as ScoreKey[]).map((k) => (
          <li key={k} className="flex gap-2">
            <span className={`w-9 shrink-0 tabular-nums ${r.scores[k].score <= 2 ? "text-clay" : r.scores[k].score >= 4 ? "text-olive" : "text-ink"}`}>{r.scores[k].score}/5</span>
            <span className="min-w-0">
              <span className="font-medium text-ink">{SCORE_LABELS[k]}</span> <span className="text-ink-2">{r.scores[k].why}</span>
            </span>
          </li>
        ))}
      </ul>
      {r.fixes.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-medium text-ink">À corriger</p>
          <ul className="list-disc ps-5 text-ink-2">
            {r.fixes.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      )}
      {r.risks.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-medium text-clay">Risques</p>
          <ul className="list-disc ps-5 text-ink-2">
            {r.risks.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
