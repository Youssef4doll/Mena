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
        <h1 className="text-[28px] font-bold leading-tight md:text-[34px]">{title}</h1>
        <p className="text-[16px] text-muted">{t.category.count(products.length)}</p>
      </div>
      <nav className="-mx-4 mb-5 flex scroll-px-4 gap-2 overflow-x-auto px-4 no-scrollbar" aria-label={t.category.sort}>
        {SORTS.map((s) => (
          <Link
            key={s}
            href={href(lang, s === "new" ? path : `${path}?tri=${s}`)}
            scroll={false}
            className={`inline-flex min-h-11 shrink-0 items-center rounded-full border-2 px-4 text-[16px] ${s === sort ? "border-sea bg-sea font-bold text-white" : "border-field bg-white text-ink hover:border-sea/60"}`}
            aria-current={s === sort ? "page" : undefined}
          >
            {t.category.sorts[s]}
          </Link>
        ))}
      </nav>
      {products.length === 0 ? (
        <div className="mx-auto flex max-w-sm flex-col items-center gap-4 rounded-2xl border border-line bg-white px-6 py-10 text-center">
          <p className="text-[17px] text-ink-2">{emptyText}</p>
          <Link href={href(lang, "/boutique")} className="inline-flex min-h-12 items-center rounded-xl border-2 border-field bg-white px-5 text-[17px] font-bold text-ink hover:bg-sand">
            {t.home.shopNow}
          </Link>
        </div>
      ) : (
        <ProductGrid products={products} lang={lang} priorityFirst={4} />
      )}
    </div>
  );
}
