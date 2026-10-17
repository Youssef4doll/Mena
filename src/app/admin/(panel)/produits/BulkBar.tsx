"use client";

import { useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { btn } from "@/components/admin/ui";
import { bulkDelete, bulkUpdate, type BulkPatchInput } from "./list-actions";

const chip = "inline-flex h-10 shrink-0 items-center justify-center rounded-full border border-line bg-white px-3 text-[13px] font-medium text-ink disabled:opacity-50";

const ACTIONS: { label: string; patch: BulkPatchInput }[] = [
  { label: "Mettre en ligne", patch: { active: true } },
  { label: "Mettre hors ligne", patch: { active: false } },
  { label: "Ajouter à la sélection", patch: { featured: true } },
  { label: "Retirer de la sélection", patch: { featured: false } },
  { label: "Disponible", patch: { available: true } },
  { label: "Indisponible", patch: { available: false } },
];

export type Note = { ok: boolean; text: string };

/**
 * The bar under the list while products are ticked: one change for all of
 * them, in one statement. Kept at the bottom of the screen, in thumb reach,
 * and says what the database did ("12 produits mis en ligne").
 */
export function BulkBar({ ids, categories, note, onNote, onClear }: {
  ids: string[];
  categories: { id: string; name: string }[];
  note: Note | null;
  onNote: (n: Note | null) => void;
  onClear: () => void;
}) {
  const [pending, start] = useTransition();
  const [catOpen, setCatOpen] = useState(false);
  const [cat, setCat] = useState("");
  const n = ids.length;

  const run = (fn: () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>) =>
    start(async () => {
      try {
        const r = await fn();
        onNote(r.ok ? { ok: true, text: r.message ?? "Fait." } : { ok: false, text: r.error });
        if (r.ok) {
          onClear();
          setCatOpen(false);
        }
      } catch (e) {
        unstable_rethrow(e);
        // The answer was lost, not necessarily the change: only a new reading of the page can tell.
        onNote({ ok: false, text: "Pas de réponse : vérifiez la connexion, puis rechargez la page pour voir ce qui a changé." });
      }
    });

  if (n === 0 && !note) return null;
  return (
    <div role="region" aria-label="Actions sur les produits choisis" className="sticky bottom-3 z-20 mt-3 rounded-2xl border border-line bg-white/95 p-3 shadow-lg backdrop-blur">
      {n > 0 && (
        <>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium tabular-nums">{n > 1 ? `${n} produits choisis` : "1 produit choisi"}</span>
            <button type="button" onClick={onClear} disabled={pending} className="inline-flex h-10 shrink-0 items-center px-1 text-sm text-muted underline underline-offset-4">
              Tout décocher
            </button>
          </div>
          {/* One line that scrolls on a phone, so the list stays visible above it. */}
          <div className="-mx-3 mt-2 flex gap-2 overflow-x-auto px-3 no-scrollbar sm:mx-0 sm:flex-wrap sm:px-0">
            {ACTIONS.map((a) => (
              <button key={a.label} type="button" disabled={pending} className={chip} onClick={() => run(() => bulkUpdate(ids, a.patch))}>
                {a.label}
              </button>
            ))}
            <button type="button" disabled={pending} aria-expanded={catOpen} className={`${chip} ${catOpen ? "border-ink" : ""}`} onClick={() => setCatOpen(!catOpen)}>
              Catégorie…
            </button>
            <button
              type="button"
              disabled={pending}
              className={`${chip} border-clay/40 text-clay`}
              onClick={() => confirm(n > 1 ? `Supprimer ces ${n} produits ? Les commandes passées restent intactes.` : "Supprimer ce produit ? Les commandes passées restent intactes.") && run(() => bulkDelete(ids))}
            >
              Supprimer
            </button>
          </div>
          {catOpen && (
            <div className="mt-2 flex gap-2">
              <select value={cat} onChange={(e) => setCat(e.currentTarget.value)} aria-label="Catégorie à donner" className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-white px-2 text-sm outline-none focus:border-sea">
                <option value="">Sans catégorie</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button type="button" disabled={pending} className={btn.primary} onClick={() => run(() => bulkUpdate(ids, { categoryId: cat || null }))}>
                Appliquer
              </button>
            </div>
          )}
        </>
      )}
      {(pending || note) && (
        <div className={`flex items-center gap-2 text-sm ${n > 0 ? "mt-2" : ""}`}>
          <p role="status" className={`min-w-0 flex-1 ${pending ? "text-muted" : note?.ok ? "text-olive" : "text-clay"}`}>
            {pending ? "Enregistrement…" : note?.text}
          </p>
          {!pending && note && (
            <button type="button" onClick={() => onNote(null)} className="inline-flex h-10 shrink-0 items-center px-1 text-sm text-muted underline underline-offset-4">
              Fermer
            </button>
          )}
        </div>
      )}
    </div>
  );
}
