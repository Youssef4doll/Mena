import Link from "next/link";
import { dict, href, type Lang } from "@/i18n";
import type { ProductCard, SortKey } from "@/lib/catalog";
import { ProductGrid } from "./ProductCard";

export const SORTS: SortKey[] = ["new", "popular", "price_asc", "price_desc"];

export function parseSort(v: unknown): SortKey {
  return SORTS.includes(v as SortKey) ? (v as SortKey) : "new";
}

export function Listing({ lang, title, path, sort, products, emptyText }: { lang: Lang; title: string; path: string; sort: SortKey; products: ProductCard[]; emptyText: string }) {
  const t = dict(lang);
  return (
    <div className="mx-auto max-w-6xl px-4 pt-6">
      <div className="mb-4 flex flex-col gap-1">
        <h1 className="text-[34px] leading-tight">{title}</h1>
        <p className="text-sm text-muted">{t.category.count(products.length)}</p>
      </div>
      <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 no-scrollbar" role="tablist" aria-label={t.category.sort}>
        {SORTS.map((s) => (
          <Link
            key={s}
            href={href(lang, s === "new" ? path : `${path}?tri=${s}`)}
            scroll={false}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[15px] ${s === sort ? "border-sea bg-sea text-white" : "border-line bg-white text-ink-2"}`}
            aria-selected={s === sort}
            role="tab"
          >
            {t.category.sorts[s]}
          </Link>
        ))}
      </div>
      {products.length === 0 ? <p className="py-16 text-center text-muted">{emptyText}</p> : <ProductGrid products={products} lang={lang} priorityFirst={4} />}
    </div>
  );
}
