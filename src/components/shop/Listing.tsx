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
    <div className="mx-auto max-w-6xl px-4 pb-6 pt-6 md:pt-8">
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between md:gap-6">
        <div className="flex items-baseline justify-between gap-3 md:justify-start">
          <h1 className="text-[26px] font-bold leading-tight md:text-[32px]">{title}</h1>
          {products.length > 0 && <p className="shrink-0 text-[15px] text-muted">{t.category.count(products.length)}</p>}
        </div>
        {products.length > 1 && (
          <nav className="-mx-4 flex scroll-px-4 gap-2 overflow-x-auto px-4 no-scrollbar md:mx-0 md:px-0" aria-label={t.category.sort}>
            {SORTS.map((s) => (
              <Link
                key={s}
                href={href(lang, s === "new" ? path : `${path}?tri=${s}`)}
                scroll={false}
                className={`inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-[15px] transition ${s === sort ? "border-sea bg-sea-soft/60 font-bold text-sea-2 ring-1 ring-sea" : "border-field bg-white text-ink hover:border-sea/60"}`}
                aria-current={s === sort ? "page" : undefined}
              >
                {t.category.sorts[s]}
              </Link>
            ))}
          </nav>
        )}
      </div>
      {products.length === 0 ? (
        <div className="flex flex-col items-center gap-5 py-16 text-center">
          <p className="max-w-xs text-[17px] text-ink-2">{emptyText}</p>
          {path !== "/boutique" && (
            <Link href={href(lang, "/boutique")} className="inline-flex min-h-12 items-center rounded-full border border-ink/60 bg-white px-6 text-[17px] font-bold text-ink hover:bg-sand">
              {t.home.shopNow}
            </Link>
          )}
        </div>
      ) : (
        <ProductGrid products={products} lang={lang} priorityFirst={4} />
      )}
    </div>
  );
}
