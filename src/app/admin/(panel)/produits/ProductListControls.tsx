"use client";

import { useState, useTransition } from "react";
import { deleteDemo, toggleActive } from "./actions";
import { btn } from "@/components/admin/ui";

export function ActiveToggle({ id, active }: { id: string; active: boolean }) {
  const [on, setOn] = useState(active);
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={on ? "En ligne" : "Hors ligne"}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await toggleActive(id, !on);
          if (r.ok) setOn(!on);
        })
      }
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? "bg-olive" : "bg-sand-2"}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "start-[22px]" : "start-0.5"}`} />
    </button>
  );
}

export function DemoBanner({ count }: { count: number }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e8d49a] bg-[#fff8e6] px-4 py-3 text-sm">
      <span>{msg ?? `${count} produits de démonstration sont en ligne. Supprimez-les avant d'ouvrir la boutique.`}</span>
      {!msg && (
        <button
          type="button"
          disabled={pending}
          className={btn.danger}
          onClick={() => {
            if (!confirm("Supprimer tous les produits de démonstration ?")) return;
            start(async () => {
              const r = await deleteDemo();
              setMsg(r.ok ? r.message ?? "Supprimés." : r.error);
            });
          }}
        >
          Supprimer la démo
        </button>
      )}
    </div>
  );
}
