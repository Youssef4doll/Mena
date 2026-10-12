"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Live } from "@/lib/analytics";
import { VIZ, fmt } from "@/lib/viz";

/** The last five minutes, refreshed every 15 seconds while the tab is visible. Keeps its frame while reloading. */
export function LivePanel({ initial }: { initial: Live }) {
  const [d, setD] = useState(initial);
  const [stale, setStale] = useState(false);
  useEffect(() => {
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      setStale(true);
      try {
        const r = await fetch("/admin/analytics/live", { cache: "no-store" });
        if (r.ok) setD(await r.json());
      } finally {
        setStale(false);
      }
    };
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, []);
  const max = Math.max(1, ...d.minutes.map((m) => m.visitors));
  return (
    <section className={`rounded-2xl border border-line bg-white p-4 transition-opacity sm:p-5 ${stale ? "opacity-70" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-xs text-muted">
            <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: VIZ.good }} /><span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: VIZ.good }} /></span>
            En ce moment · 5 dernières minutes
          </p>
          <p className="mt-1 text-[44px] font-semibold leading-none text-ink">{d.visitors}</p>
          <p className="mt-1 text-sm text-ink-2">visiteur{d.visitors > 1 ? "s" : ""} · {d.forms} formulaire(s) commencé(s) · {d.phones} numéro(s) saisi(s)</p>
        </div>
        <div className="min-w-[200px] flex-1">
          <div className="flex h-14 items-end gap-[2px]" role="img" aria-label="Visiteurs par minute, 30 dernières minutes">
            {d.minutes.map((m) => (
              <span key={m.ago} title={`il y a ${m.ago} min : ${m.visitors}`} className="flex-1 rounded-t-[2px]" style={{ height: `${Math.max(m.visitors ? 6 : 2, (m.visitors / max) * 100)}%`, background: m.visitors ? VIZ.s1 : VIZ.grid }} />
            ))}
          </div>
          <p className="mt-1 flex justify-between text-[11px] text-muted"><span>−30 min</span><span>maintenant</span></p>
        </div>
      </div>
      <div className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
        <div>
          <p className="mb-1 text-xs text-muted">Pages vues</p>
          {d.pages.length === 0 ? <p className="text-muted">—</p> : d.pages.map((p) => <p key={p.path} className="flex justify-between gap-2"><span className="truncate">{p.path}</span><span className="tabular-nums">{p.visitors}</span></p>)}
        </div>
        <div>
          <p className="mb-1 text-xs text-muted">Sources</p>
          {d.sources.length === 0 ? <p className="text-muted">—</p> : d.sources.map((s) => <p key={s.source} className="flex justify-between gap-2"><span>{s.source}</span><span className="tabular-nums">{s.visitors}</span></p>)}
        </div>
        <div>
          <p className="mb-1 text-xs text-muted">Commandes des 30 dernières minutes</p>
          {d.orders.length === 0 ? <p className="text-muted">Aucune</p> : d.orders.map((o) => (
            <p key={o.ref} className="flex justify-between gap-2"><Link href={`/admin/commandes?q=${o.ref}&statut=ALL`} className="font-mono underline">{o.ref}</Link><span className="tabular-nums">{fmt(o.total, "tnd")}</span></p>
          ))}
        </div>
      </div>
    </section>
  );
}
