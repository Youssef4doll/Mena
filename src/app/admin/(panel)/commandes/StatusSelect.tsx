"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { OrderStatus } from "@prisma/client";
import { STATUS_LABELS, TRANSITIONS } from "@/lib/order-status";
import { STATUS_TONE } from "@/components/admin/ui";
import { setStatus } from "./actions";

/**
 * The order's status, changed from the list like a cell of a spreadsheet.
 * It looks exactly like the status badge; a tap opens a small menu of the
 * moves the order can make, each in its own colour (the server checks again).
 * Our own menu rather than the phone's list, so the colours show everywhere.
 */
export function StatusSelect({ id, status }: { id: string; status: OrderStatus }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const root = useRef<HTMLSpanElement>(null);
  const next = TRANSITIONS[status];

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  function choose(to: OrderStatus) {
    let refusalReason: string | undefined;
    if (to === "REFUSED") {
      const r = prompt("Motif du refus (facultatif) :");
      if (r === null) return;
      refusalReason = r;
    }
    setOpen(false);
    setError(null);
    start(async () => {
      const r = await setStatus(id, to, { refusalReason });
      if (!r.ok) setError(r.error);
    });
  }

  return (
    <span ref={root} className="relative flex shrink-0 flex-col items-end gap-0.5">
      <button
        type="button"
        disabled={pending || next.length === 0}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Statut : ${STATUS_LABELS[status]}${next.length ? ", changer" : ""}`}
        className={`inline-flex min-h-8 items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-medium transition disabled:cursor-default ${next.length ? "cursor-pointer hover:brightness-95" : ""} ${pending ? "opacity-60" : ""} ${STATUS_TONE[status]}`}
      >
        {STATUS_LABELS[status]}
      </button>
      {open && (
        <span role="menu" className="absolute end-0 top-full z-20 mt-1 flex min-w-44 flex-col items-stretch gap-1 rounded-2xl border border-line bg-white p-1.5 shadow-[0_12px_30px_-12px_rgb(15_23_42/.35)]">
          {next.map((s) => (
            <button key={s} type="button" role="menuitem" onClick={() => choose(s)} className="flex min-h-9 items-center rounded-xl px-1.5 text-start hover:bg-cream">
              <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-medium ${STATUS_TONE[s]}`}>{STATUS_LABELS[s]}</span>
            </button>
          ))}
        </span>
      )}
      {pending && <span className="text-[11px] text-muted">Enregistrement…</span>}
      {error && <span className="text-[11px] text-danger">{error}</span>}
    </span>
  );
}
