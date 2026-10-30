"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLinkStatus } from "next/link";
import { deleteDemo } from "./actions";
import { btn, input } from "@/components/admin/ui";
import { NO_CATEGORY, listHref, type ListParams } from "./list-params";

export function DemoBanner({ count }: { count: number }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e8d49a] bg-[#fff8e6] px-4 py-3 text-sm">
      {/* The count is every demo product, online or not: the list can take them offline. */}
      <span>{msg ?? (count > 1 ? `${count} produits de démonstration sont dans le catalogue. Supprimez-les avant d'ouvrir la boutique.` : "1 produit de démonstration est dans le catalogue. Supprimez-le avant d'ouvrir la boutique.")}</span>
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

/**
 * The search and the category. The list follows the search as it is typed
 * (a short pause after the last key), and a category is one tap on its chip,
 * with its number of products. Both go into the address (a link to share,
 * the back button works) and start again at page 1. Without JavaScript the
 * form still sends "?q=&c=".
 */
export function ListFilters({ params, categories }: { params: ListParams; categories: { id: string; name: string; count: number }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(params.q);
  // The searches sent while typing: their answers must not put back older text in the box.
  const [sent, setSent] = useState<string[]>([]);
  const [shown, setShown] = useState(params.q);
  if (params.q !== shown) {
    setShown(params.q);
    if (!sent.includes(params.q)) setQ(params.q);
  }
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const go = (change: Partial<ListParams>) => start(() => router.replace(listHref(params, { ...change, page: 1 }), { scroll: false }));
  const search = (value: string, wait: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const v = value.trim();
      if (v === params.q) return;
      setSent((x) => [...x.slice(-30), v]);
      go({ q: v });
    }, wait);
  };
  const chip = (value: string, text: string, count?: number) => (
    <button
      key={value || "all"}
      type="button"
      onClick={() => go({ c: value, q: q.trim() })}
      aria-pressed={params.c === value}
      className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] ${params.c === value ? "border-sea bg-sea text-white" : "border-line bg-white text-ink-2 hover:border-sea/50"}`}
    >
      {text}
      {count != null && <span className={`text-[11px] tabular-nums ${params.c === value ? "text-white/75" : "text-muted"}`}>{count}</span>}
    </button>
  );
  return (
    <form
      action="/admin/produits"
      aria-busy={pending}
      className="mb-4 flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        search(q, 0);
      }}
    >
      {params.f !== "all" && <input type="hidden" name="f" value={params.f} />}
      {params.c && <input type="hidden" name="c" value={params.c} />}
      <div className="relative">
        <input
          name="q"
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            search(e.target.value, 300);
          }}
          placeholder="Chercher : nom, nom arabe, réf., mot-clé"
          aria-label="Chercher un produit"
          autoComplete="off"
          className={`${input} h-11 pe-10 text-[15px]`}
        />
        <span aria-hidden className={`pointer-events-none absolute end-3 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-sea transition-opacity ${pending ? "opacity-70 motion-safe:animate-pulse" : "opacity-0"}`} />
      </div>
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 no-scrollbar lg:mx-0 lg:flex-wrap lg:px-0" role="group" aria-label="Catégorie">
        {chip("", "Toutes les catégories")}
        {categories.map((c) => chip(c.id, c.name, c.count))}
        {chip(NO_CATEGORY, "Sans catégorie")}
        {/* A link to a category deleted since: said as such, not shown as "every category". */}
        {params.c && params.c !== NO_CATEGORY && !categories.some((c) => c.id === params.c) && chip(params.c, "Catégorie supprimée")}
      </div>
      <noscript>
        <button className={btn.primary}>Chercher</button>
      </noscript>
    </form>
  );
}

/** Put inside a link: a dot that pulses while the next page is read (the link was not loaded ahead). */
export function PendingHint() {
  const { pending } = useLinkStatus();
  return <span aria-hidden className={`h-1.5 w-1.5 rounded-full bg-current transition-opacity ${pending ? "opacity-60 motion-safe:animate-pulse" : "opacity-0"}`} />;
}
