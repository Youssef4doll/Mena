"use client";

import { useState, useTransition } from "react";
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
 * The search and the category. Both go into the address (a link to share, the
 * back button works) and start again at page 1; the category applies as soon
 * as it is chosen. Without JavaScript the form still sends "?q=&c=".
 */
export function ListFilters({ params, categories }: { params: ListParams; categories: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const go = (change: Partial<ListParams>) => start(() => router.push(listHref(params, { ...change, page: 1 })));
  return (
    <form
      action="/admin/produits"
      aria-busy={pending}
      className="mb-4 flex flex-wrap gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        go({ q: String(new FormData(e.currentTarget).get("q") ?? "").trim() });
      }}
    >
      {params.f !== "all" && <input type="hidden" name="f" value={params.f} />}
      <input
        key={`q:${params.q}`}
        name="q"
        type="search"
        defaultValue={params.q}
        placeholder="Nom, nom arabe, réf., mot-clé"
        aria-label="Chercher un produit"
        className={`${input} w-auto min-w-0 flex-[1_1_16rem]`}
      />
      <select
        key={`c:${params.c}`}
        name="c"
        defaultValue={params.c}
        // A search typed but not sent yet is kept with the new category.
        onChange={(e) => go({ c: e.currentTarget.value, q: String(new FormData(e.currentTarget.form ?? undefined).get("q") ?? "").trim() })}
        aria-label="Catégorie"
        className={`${input} w-auto min-w-0 flex-[1_1_10rem] px-2 sm:flex-[0_1_14rem]`}
      >
        <option value="">Toutes les catégories</option>
        <option value={NO_CATEGORY}>Sans catégorie</option>
        {/* A link to a category deleted since: said as such, not shown as "every category". */}
        {params.c && params.c !== NO_CATEGORY && !categories.some((c) => c.id === params.c) && <option value={params.c}>Catégorie supprimée</option>}
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <button className={`${btn.primary} shrink-0`} disabled={pending}>
        {pending ? "Recherche…" : "Chercher"}
      </button>
    </form>
  );
}

/** Put inside a link: a dot that pulses while the next page is read (the link was not loaded ahead). */
export function PendingHint() {
  const { pending } = useLinkStatus();
  return <span aria-hidden className={`h-1.5 w-1.5 rounded-full bg-current transition-opacity ${pending ? "opacity-60 motion-safe:animate-pulse" : "opacity-0"}`} />;
}
