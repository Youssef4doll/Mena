"use client";

import { useState, useTransition } from "react";
import type { OrderStatus } from "@prisma/client";
import { STATUS_LABELS, TRANSITIONS } from "@/lib/order-status";
import { setStatus } from "./actions";

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
        className="h-9 max-w-[170px] rounded-full border border-line bg-white px-3 text-[13px] font-medium disabled:opacity-60"
      >
        <option value={status}>{STATUS_LABELS[status]}</option>
        {next.map((s) => (
          <option key={s} value={s}>→ {STATUS_LABELS[s]}</option>
        ))}
      </select>
      {pending && <span className="text-[11px] text-muted">Enregistrement…</span>}
      {error && <span className="text-[11px] text-danger">{error}</span>}
    </span>
  );
}
