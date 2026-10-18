"use client";

import { useState, useTransition } from "react";
import type { OrderStatus } from "@prisma/client";
import { STATUS_LABELS, TRANSITIONS } from "@/lib/order-status";
import { setStatus } from "./actions";
import { STATUS_TONE } from "@/components/admin/ui";

/**
 * The order's status, changed from the list like a cell of a spreadsheet:
 * only the moves the order can make are offered (the server checks again).
 */
export function StatusSelect({ id, status }: { id: string; status: OrderStatus }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const next = TRANSITIONS[status];
  return (
    <span className="flex flex-col items-end gap-0.5">
      <select
        aria-label="Statut"
        value={status}
        disabled={pending || next.length === 0}
        onChange={(e) => {
          const to = e.target.value as OrderStatus;
          let refusalReason: string | undefined;
          if (to === "REFUSED") {
            const r = prompt("Motif du refus (facultatif) :");
            if (r === null) return;
            refusalReason = r;
          }
          setError(null);
          start(async () => {
            const r = await setStatus(id, to, { refusalReason });
            if (!r.ok) setError(r.error);
          });
        }}
        className={`h-8 max-w-[170px] cursor-pointer rounded-full border-0 px-3 text-[12px] font-medium disabled:cursor-default disabled:opacity-100 ${STATUS_TONE[status]}`}
      >
        <option value={status} className="bg-white text-ink">{STATUS_LABELS[status]}</option>
        {next.map((s) => (
          <option key={s} value={s} className="bg-white text-ink">→ {STATUS_LABELS[s]}</option>
        ))}
      </select>
      {pending && <span className="text-[11px] text-muted">Enregistrement…</span>}
      {error && <span className="text-[11px] text-danger">{error}</span>}
    </span>
  );
}
