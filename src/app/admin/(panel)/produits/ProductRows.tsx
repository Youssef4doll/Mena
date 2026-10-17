"use client";

import { useState } from "react";
import type { StockState } from "@/lib/catalog";
import { Badge } from "@/components/admin/ui";
import { IntentLink } from "./IntentLink";
import { CategoryCell, PriceCell, StockCell, SwitchCell } from "./QuickEdit";
import { BulkBar, type Note } from "./BulkBar";

/** One product as the list shows it: plain values, worked out on the server. */
export type ProductRow = {
  id: string;
  name: string;
  image: string | null;
  price: number;
  /** Offers set the prices the customer pays: the price is then changed in the product. */
  offers: number;
  margin: number | null;
  categoryId: string | null;
  supplier: string | null;
  active: boolean;
  featured: boolean;
  isDemo: boolean;
  stockMode: "TRACKED" | "SUPPLIER";
  stockQty: number;
  available: boolean;
  variants: number;
  /** Units left over every option, as the shop counts them. */
  variantStock: number;
  stock: StockState;
  views: number;
  sold: number;
};

type Category = { id: string; name: string };

/**
 * The products of one page, each editable in place, with a tick box for the
 * bulk actions. The ticks are kept here: a re-render after a save keeps them,
 * a new page or filter starts without any.
 */
export function ProductRows({ rows, categories }: { rows: ProductRow[]; categories: Category[] }) {
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [note, setNote] = useState<Note | null>(null);
  // A product deleted meanwhile is no longer ticked.
  const ids = rows.filter((r) => picked.has(r.id)).map((r) => r.id);
  const all = ids.length === rows.length && rows.length > 0;

  const toggle = (id: string, on: boolean) => {
    setNote(null);
    setPicked((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  return (
    <div>
      <label className="mb-2 flex h-10 w-fit items-center gap-2.5 px-3 text-sm text-ink-2 sm:px-4">
        <input
          type="checkbox"
          checked={all}
          ref={(el) => {
            if (el) el.indeterminate = ids.length > 0 && !all;
          }}
          onChange={(e) => {
            setNote(null);
            setPicked(e.currentTarget.checked ? new Set(rows.map((r) => r.id)) : new Set());
          }}
          className="h-[18px] w-[18px] accent-ink"
        />
        Tout sélectionner sur la page
      </label>
      <ul className="divide-y divide-line rounded-2xl border border-line bg-white">
        {rows.map((p) => (
          <Row key={p.id} p={p} categories={categories} picked={picked.has(p.id)} onPick={(on) => toggle(p.id, on)} />
        ))}
      </ul>
      <BulkBar ids={ids} categories={categories} note={note} onNote={setNote} onClear={() => setPicked(new Set())} />
    </div>
  );
}

/**
 * A product's line: its picture and name open the editor (loaded ahead on
 * intent), the cells under it change one field each. On a phone the cells
 * sit under the name; on a wide screen (from 1280 px, so the name keeps
 * room beside the menu), on the right.
 */
function Row({ p, categories, picked, onPick }: { p: ProductRow; categories: Category[]; picked: boolean; onPick: (on: boolean) => void }) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const reportFor = (cell: string) => (error: string | null) =>
    setErrors((e) => {
      if ((e[cell] ?? null) === error) return e;
      const next = { ...e };
      if (error) next[cell] = error;
      else delete next[cell];
      return next;
    });
  const href = `/admin/produits/${p.id}`;
  const st = p.stock;
  const messages = Object.values(errors);

  return (
    <li className={`flex flex-col gap-2 px-3 py-3 sm:px-4 xl:flex-row xl:items-center xl:gap-4 ${picked ? "bg-sea-soft/50" : ""}`}>
      <div className="flex min-w-0 flex-1 items-start gap-2">
        <label className="-ms-2 flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center">
          <input type="checkbox" checked={picked} onChange={(e) => onPick(e.currentTarget.checked)} aria-label={`Choisir ${p.name}`} className="h-[18px] w-[18px] accent-ink" />
        </label>
        <IntentLink href={href} className="flex min-w-0 flex-1 items-start gap-3">
          <span className="relative h-14 w-12 shrink-0 overflow-hidden rounded-lg bg-sand">
            {p.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/img/${p.image}/128`} alt="" loading="lazy" className="h-full w-full object-cover" />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{p.name}</span>
            {(p.margin != null || p.supplier) && (
              <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                {p.margin != null && <span>marge {Math.round(p.margin * 100)} %</span>}
                {p.supplier && <span>{p.margin != null ? "· " : ""}{p.supplier}</span>}
              </span>
            )}
            <span className="mt-1 flex flex-wrap gap-1">
              {st.kind === "out" ? <Badge tone="danger">Épuisé</Badge> : st.kind === "low" ? <Badge tone="warn">Stock {st.qty}</Badge> : <Badge tone="ok">{p.stockMode === "TRACKED" ? "En stock" : "Dispo fournisseur"}</Badge>}
              {p.featured && <Badge tone="info">Sélection</Badge>}
              {p.isDemo && <Badge>Démo</Badge>}
              <Badge>{p.views} vues · {p.sold} vendus</Badge>
              {p.views >= 30 && p.sold === 0 && <Badge tone="warn">Vu sans être acheté</Badge>}
            </span>
          </span>
        </IntentLink>
      </div>

      <div className="flex flex-wrap items-start gap-2 xl:w-[31rem] xl:shrink-0 xl:justify-end xl:gap-3">
        {p.offers > 0 ? (
          <span className="flex w-24 shrink-0 flex-col gap-1">
            <span className="flex h-4 items-center text-[11px] text-muted">Prix</span>
            <IntentLink href={href} className="flex h-10 items-center text-xs text-sea underline underline-offset-4">
              dans les offres
            </IntentLink>
          </span>
        ) : (
          <PriceCell id={p.id} price={p.price} report={reportFor("price")} />
        )}
        {p.stockMode === "SUPPLIER" ? (
          <SwitchCell id={p.id} field="available" label="Dispo" value={p.available} report={reportFor("available")} className="w-[4.5rem]" />
        ) : p.variants === 0 ? (
          <StockCell id={p.id} qty={p.stockQty} report={reportFor("stock")} />
        ) : (
          <span className="flex w-[4.5rem] shrink-0 flex-col gap-1">
            <span className="flex h-4 items-center text-[11px] text-muted">Stock</span>
            <IntentLink href={href} aria-label={`Stock total des variantes : ${p.variantStock}, à changer dans la fiche`} className="flex h-10 items-center text-sm tabular-nums text-sea underline underline-offset-4">
              {p.variantStock}
            </IntentLink>
          </span>
        )}
        <SwitchCell id={p.id} field="active" label="En ligne" value={p.active} report={reportFor("active")} />
        <SwitchCell id={p.id} field="featured" label="Sélection" value={p.featured} report={reportFor("featured")} />
        <CategoryCell id={p.id} categoryId={p.categoryId} categories={categories} report={reportFor("category")} />
        {messages.length > 0 && (
          <p role="alert" className="basis-full text-xs text-clay xl:text-end">
            {messages.join(" ")}
          </p>
        )}
      </div>
    </li>
  );
}
