"use client";

import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { parseTND, toInputTND } from "@/lib/money";
import { input } from "@/components/admin/ui";
import { quickUpdate, type QuickPatch } from "./list-actions";

/** A cell tells its row what went wrong (null: nothing), so the message has room to be read. */
export type Report = (error: string | null) => void;

/**
 * Saves one field of one product from the list. The new value shows at once;
 * if the shop refuses it, the stored value comes back with the reason. The
 * action's response re-renders the list, so the value shown after it is the
 * database's own.
 */
function useQuickSave<T>(id: string, value: T, report: Report) {
  const [shown, setShown] = useOptimistic(value);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(0);
  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(0), 2000);
    return () => clearTimeout(t);
  }, [saved]);
  const save = (next: T, patch: QuickPatch) =>
    start(async () => {
      setShown(next);
      setSaved(0);
      try {
        const r = await quickUpdate(id, patch);
        report(r.ok ? null : r.error);
        if (r.ok) setSaved(Date.now());
      } catch (e) {
        unstable_rethrow(e);
        // The answer was lost, not necessarily the change: only a new reading of the page can tell.
        report("Pas de réponse : vérifiez la connexion, puis rechargez la page pour voir ce qui est enregistré.");
      }
    });
  return { shown, pending, saved: saved > 0, save };
}

/** The small title over a cell, with its state: saving, saved. */
function Head({ text, pending, saved }: { text: string; pending: boolean; saved: boolean }) {
  return (
    <span className="flex h-4 items-center gap-1 whitespace-nowrap text-[11px] text-muted">
      {text}
      {pending ? <span aria-hidden>…</span> : saved ? <span className="font-medium text-olive" role="status">Enregistré</span> : null}
    </span>
  );
}

/**
 * A number typed in the row: saved on Enter or when leaving the field,
 * put back on Escape. Nothing is sent when the value did not change, nor when
 * nothing was typed: a field only visited never writes back what it showed
 * (a stock below 0 from old data, a value changed meanwhile in another tab).
 */
function NumberCell({ id, label, value, width, format, read, patch, report, mode }: {
  id: string;
  label: string;
  value: number;
  width: string;
  format: (v: number) => string;
  /** The typed text as the stored number, or an error to show. */
  read: (text: string) => number | { error: string };
  patch: (v: number) => QuickPatch;
  report: Report;
  mode: "decimal" | "numeric";
}) {
  const q = useQuickSave(id, value, report);
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);
  const commit = () => {
    const text = draft;
    setDraft(null);
    if (text === null) return report(null);
    const v = read(text);
    if (typeof v !== "number") return report(v.error);
    if (v === q.shown) return report(null);
    q.save(v, patch(v));
  };
  return (
    <label className={`flex shrink-0 flex-col gap-1 ${width}`}>
      <Head text={label} pending={q.pending} saved={q.saved} />
      <input
        aria-label={label}
        inputMode={mode}
        enterKeyHint="done"
        autoComplete="off"
        value={draft ?? format(q.shown)}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setDraft(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          } else if (e.key === "Escape") {
            cancelled.current = true;
            setDraft(null);
            report(null);
            e.currentTarget.blur();
          }
        }}
        onBlur={() => {
          if (cancelled.current) {
            cancelled.current = false;
            return;
          }
          commit();
        }}
        className={`${input} px-2.5 tabular-nums`}
      />
    </label>
  );
}

/** The selling price, in dinars as the editor writes it ("59.900"). */
export function PriceCell({ id, price, report }: { id: string; price: number; report: Report }) {
  return (
    <NumberCell
      id={id}
      label="Prix (DT)"
      value={price}
      width="w-24"
      mode="decimal"
      format={toInputTND}
      read={(t) => {
        const v = parseTND(t);
        return v != null && v > 0 && v <= 100_000_000 ? v : { error: "Prix invalide : plus de 0 et 100 000 DT au plus, par ex. 59,900." };
      }}
      patch={(v) => ({ price: v })}
      report={report}
    />
  );
}

/** The count of a product whose stock the shop keeps itself (without options). */
export function StockCell({ id, qty, report }: { id: string; qty: number; report: Report }) {
  return (
    <NumberCell
      id={id}
      label="Stock"
      value={qty}
      width="w-[4.5rem]"
      mode="numeric"
      format={String}
      read={(t) => {
        const s = t.trim();
        return /^\d{1,7}$/.test(s) && Number(s) <= 1_000_000 ? Number(s) : { error: "Stock invalide : un nombre entier, 0 ou plus." };
      }}
      patch={(v) => ({ stockQty: v })}
      report={report}
    />
  );
}

/** An on/off field of the product: online, in the shop's selection, available at the supplier. */
export function SwitchCell({ id, field, label, value, report, className = "" }: { id: string; field: "active" | "featured" | "available"; label: string; value: boolean; report: Report; className?: string }) {
  const q = useQuickSave(id, value, report);
  return (
    <span className={`flex shrink-0 flex-col gap-1 ${className}`}>
      <Head text={label} pending={q.pending} saved={q.saved} />
      <button
        type="button"
        role="switch"
        aria-checked={q.shown}
        aria-label={label}
        onClick={() => q.save(!q.shown, { [field]: !q.shown })}
        className="flex h-10 items-center"
      >
        <span className={`relative h-6 w-11 rounded-full transition ${q.shown ? "bg-olive" : "bg-sand-2"}`}>
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${q.shown ? "start-[22px]" : "start-0.5"}`} />
        </span>
      </button>
    </span>
  );
}

/** Where the product is shelved in the shop. */
export function CategoryCell({ id, categoryId, categories, report }: { id: string; categoryId: string | null; categories: { id: string; name: string }[]; report: Report }) {
  const q = useQuickSave(id, categoryId, report);
  return (
    <label className="flex min-w-0 basis-full flex-col gap-1 sm:basis-auto sm:w-44">
      <Head text="Catégorie" pending={q.pending} saved={q.saved} />
      <select
        aria-label="Catégorie"
        value={q.shown ?? ""}
        onChange={(e) => {
          const v = e.currentTarget.value || null;
          q.save(v, { categoryId: v });
        }}
        className={`${input} px-2`}
      >
        <option value="">Sans catégorie</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  );
}
