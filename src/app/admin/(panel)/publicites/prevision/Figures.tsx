"use client";

import { useRef, useState, useTransition } from "react";
import { BENCH_LABELS, MARKET_LABELS, benchRequest, pickRanges, type Benchmark, type BenchMetric } from "@/lib/ads/forecast-prompt";
import type { BenchStore } from "@/lib/ads/forecast-data";
import { Badge, btn, input as inputCls } from "@/components/admin/ui";
import { CopyButton } from "../idees/Copy";
import { pasteFigures, searchFigures, tickFigures } from "./actions";
import { dtFine, num, pct } from "./fmt";

/**
 * The public figures: found by Claude on the web (with the key) or pasted
 * from claude.ai, each with its page and its sentence. A figure counts in
 * the forecast only once ticked; with the key, the pages Claude really read
 * start ticked, a pasted reply starts with nothing ticked.
 */

const MONEY: BenchMetric[] = ["cpm", "cpc"];
const value = (b: Benchmark) => {
  const f = MONEY.includes(b.metric) ? dtFine : b.metric === "learningEvents" ? num : pct;
  return b.low === b.high ? f(b.low) : `${f(b.low)} à ${f(b.high)}`;
};

export function Figures({ store, aiReady, onChange }: { store: BenchStore | null; aiReady: boolean; onChange: (s: BenchStore) => void }) {
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  // Ticks are saved one after the other, so the last one tapped is the one kept.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const items = store?.items ?? [];
  const picked = pickRanges(items);

  const run = (f: () => Promise<{ ok: true; store: BenchStore } | { ok: false; error: string }>) =>
    start(async () => {
      setError(null);
      try {
        const r = await f();
        if (!r.ok) return setError(r.error);
        onChange(r.store);
        setReply("");
      } catch {
        setError("Impossible pour le moment : vérifiez la connexion, puis réessayez.");
      }
    });

  // Ticked at once on the page; the server keeps it, and the box goes back if it could not.
  const toggle = (id: string) => {
    if (!store) return;
    const before = store;
    const next = { ...store, items: store.items.map((b) => (b.id === id ? { ...b, used: !b.used } : b)) };
    onChange(next);
    setError(null);
    queue.current = queue.current.then(async () => {
      try {
        const r = await tickFigures(next.items.filter((b) => b.used).map((b) => b.id));
        if (!r.ok) {
          onChange(before);
          setError(r.error);
        }
      } catch {
        onChange(before);
        setError("Choix non enregistré : vérifiez la connexion, puis réessayez.");
      }
    });
  };

  return (
    <div className="flex flex-col gap-3" aria-busy={busy}>
      <div className="flex flex-wrap items-center gap-2">
        {aiReady && (
          <button type="button" className={btn.sea} disabled={busy} onClick={() => run(searchFigures)}>
            {busy ? "Recherche… (1 à 3 minutes)" : items.length ? "Chercher à nouveau sur le web" : "Chercher sur le web"}
          </button>
        )}
        {store && (
          <span className="text-xs text-muted">
            {store.mode === "api" ? "Cherchés par Claude" : "Collés depuis claude.ai"} le {new Date(store.updatedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })} · {items.filter((b) => b.used).length} sur {items.length} utilisés
          </span>
        )}
      </div>

      <details className="rounded-xl border border-line px-3 py-2" open={!aiReady && !items.length}>
        <summary className="flex min-h-10 cursor-pointer items-center text-sm font-medium text-ink">{aiReady ? "Ou par claude.ai (copier, coller)" : "Chercher avec claude.ai"}</summary>
        <ol className="mt-2 flex list-decimal flex-col gap-2 ps-5 text-sm text-ink-2">
          <li>
                <span className="flex flex-wrap items-center gap-2">
            Copiez la demande et collez-la dans claude.ai, recherche web activée. <CopyButton text={benchRequest()} label="Copier la demande" />
          </span>
              </li>
          <li>
            Collez ici toute sa réponse :
            <textarea aria-label="Réponse de claude.ai (chiffres publics)" value={reply} onChange={(e) => setReply(e.target.value)} className={`${inputCls} mt-1 h-28 py-2 font-mono text-xs`} />
          </li>
        </ol>
        <button type="button" className={`${btn.ghost} mt-2`} disabled={busy || !reply.trim()} onClick={() => run(() => pasteFigures(reply))}>
          Lire la réponse
        </button>
      </details>

      {error && <p role="alert" className="text-sm text-danger">{error}</p>}

      {items.length > 0 && (
        <ul className="flex flex-col divide-y divide-line rounded-xl border border-line">
          {items.map((b) => {
            const inUse = picked[b.metric]?.sources.some((s) => s.id === b.id);
            return (
              <li key={b.id} className="flex items-start gap-3 px-3 py-2.5 text-sm">
                <input type="checkbox" checked={b.used} onChange={() => toggle(b.id)} aria-label={`Utiliser : ${BENCH_LABELS[b.metric]}, ${value(b)}`} className="mt-1 h-5 w-5 shrink-0 accent-sea" />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-medium text-ink">{BENCH_LABELS[b.metric]}</span>
                    <span className="tabular-nums text-ink">{value(b)}</span>
                    <Badge tone="neutral">
                      {MARKET_LABELS[b.market]}
                      {b.period ? `, ${b.period}` : ""}
                    </Badge>
                    {b.checked ? <Badge tone="ok">Page lue par Claude</Badge> : <Badge tone="warn">À vérifier : ouvrez la page</Badge>}
                    {b.used && !inUse && <Badge tone="neutral">Un marché plus proche est utilisé</Badge>}
                  </p>
                  <a href={b.url} target="_blank" rel="noreferrer noopener" className="block truncate text-[13px] text-sea underline underline-offset-2">
                    {b.title || b.url}
                  </a>
                  {b.quote && <p className="mt-0.5 text-xs text-muted">« {b.quote} »</p>}
                  {b.converted && <p className="mt-0.5 text-xs text-muted">Converti : {b.converted}</p>}
                  {b.note && <p className="mt-0.5 text-xs text-[#8a5a00]">{b.note}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {store && !items.length && <p className="text-sm text-muted">Aucun chiffre sûr trouvé. La prévision s&apos;appuie alors sur vos seuls chiffres.</p>}
    </div>
  );
}
