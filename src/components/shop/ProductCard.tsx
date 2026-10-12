import Link from "next/link";
import type { ProductCard as Card } from "@/lib/catalog";
import { dict, href, pick, type Lang } from "@/i18n";
import { Img } from "./Img";
import { Price } from "./Price";
import { Stars } from "./Stars";

export function ProductCard({ p, lang, priority = false }: { p: Card; lang: Lang; priority?: boolean }) {
  const t = dict(lang);
  const name = pick(lang, p.name, p.nameAr);
  const out = p.stock.kind === "out";
  return (
    <Link href={href(lang, `/produit/${p.slug}`)} className="group flex flex-col gap-2.5" prefetch={false}>
      <div className="relative aspect-[4/5] overflow-hidden rounded-card bg-sand">
        <Img image={p.images[0] ?? null} alt={p.images[0]?.alt ?? name} sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw" priority={priority} className={`transition duration-500 group-hover:scale-[1.03] ${out ? "opacity-60 grayscale" : ""}`} />
        {p.images[1] && (
          <div className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 max-md:hidden">
            <Img image={p.images[1]} alt="" sizes="25vw" />
          </div>
        )}
        <div className="absolute start-2 top-2 flex flex-col items-start gap-1">
          {out && <span className="rounded-full bg-ink/80 px-2 py-0.5 text-[11px] font-medium text-white">{t.product.out}</span>}
          {!out && p.compareAt && (
            <span className="rounded-full bg-clay px-2 py-0.5 text-[11px] font-semibold text-white ltr-nums">−{Math.round((1 - p.price / p.compareAt) * 100)}%</span>
          )}
          {p.stock.kind === "low" && <span className="rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-medium text-clay">{t.product.low(p.stock.qty)}</span>}
        </div>
      </div>
      <div className="flex flex-col gap-1 px-0.5">
        <h3 className="line-clamp-2 text-[14px] leading-snug text-ink-2">{name}</h3>
        {p.rating && (
          <span className="flex items-center gap-1 text-[11px] text-muted">
            <Stars value={p.rating.avg} size={11} />
            <span className="ltr-nums">({p.rating.count})</span>
          </span>
        )}
        <Price value={p.price} compareAt={p.compareAt} lang={lang} size="sm" from={p.priceFrom ? t.product.from : undefined} />
      </div>
    </Link>
  );
}

export function ProductGrid({ products, lang, priorityFirst = 0 }: { products: Card[]; lang: Lang; priorityFirst?: number }) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 lg:gap-x-5">
      {products.map((p, i) => (
        <ProductCard key={p.id} p={p} lang={lang} priority={i < priorityFirst} />
      ))}
    </div>
  );
}
