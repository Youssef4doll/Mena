import Link from "next/link";
import type { ProductCard as Card } from "@/lib/catalog";
import { dict, href, pick, type Lang } from "@/i18n";
import { discountPct } from "@/lib/offer-display";
import { Img } from "./Img";
import { QuickBuy } from "./QuickBuy";
import { Price } from "./Price";
import { Stars } from "./Stars";

/**
 * A product in a list: a white card, a large picture, the name in plain
 * reading size, the price, and one clear button that orders it on the spot.
 * The picture, name and price open the product page.
 */
export function ProductCard({ p, lang, priority = false }: { p: Card; lang: Lang; priority?: boolean }) {
  const t = dict(lang);
  const name = pick(lang, p.name, p.nameAr);
  const out = p.stock.kind === "out";
  const pct = out ? 0 : discountPct(p.price, p.compareAt);
  return (
    <div className="group flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-white transition hover:shadow-soft">
      <Link href={href(lang, `/produit/${p.slug}`)} className="flex flex-1 flex-col rounded-t-2xl [--focus-offset:-3px]" prefetch={false}>
        <div className="relative aspect-square overflow-hidden bg-sand">
          <Img image={p.images[0] ?? null} alt={p.images[0]?.alt ?? name} sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw" priority={priority} className={`transition duration-500 group-hover:scale-[1.02] ${out ? "opacity-60 grayscale" : ""}`} />
          <div className="absolute start-2 top-2 flex flex-col items-start gap-1">
            {out && <span className="rounded-full bg-ink/80 px-2.5 py-1 text-[14px] font-bold text-white">{t.product.out}</span>}
            {pct > 0 && <span className="rounded-full bg-olive px-2.5 py-1 text-[14px] font-bold text-white ltr-nums">−{pct}%</span>}
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-1.5 p-3 pb-2">
          {/* Two lines kept for the name, so prices line up across a row. */}
          <h3 className="line-clamp-2 min-h-[2.75em] text-[16px] font-normal leading-snug text-ink">{name}</h3>
          <div className="pt-0.5">
            <Price value={p.price} compareAt={p.compareAt} lang={lang} size="md" from={p.packOf ? t.product.pack(p.packOf) : p.priceFrom ? t.product.from : undefined} />
          </div>
          {p.rating && (
            <span className="flex items-center gap-1 text-[14px] text-muted">
              <Stars value={p.rating.avg} size={14} />
              <span className="ltr-nums">({p.rating.count})</span>
            </span>
          )}
          {p.stock.kind === "low" && <span className="text-[14px] font-bold text-clay">{t.product.low(p.stock.qty)}</span>}
        </div>
      </Link>
      {!out && (
        <div className="@container px-2.5 pb-3">
          <QuickBuy slug={p.slug} productId={p.id} lang={lang} />
        </div>
      )}
    </div>
  );
}

export function ProductGrid({ products, lang, priorityFirst = 0 }: { products: Card[]; lang: Lang; priorityFirst?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-4">
      {products.map((p, i) => (
        <ProductCard key={p.id} p={p} lang={lang} priority={i < priorityFirst} />
      ))}
    </div>
  );
}

/**
 * A shelf: swiped sideways on a phone, like Amazon's; laid out in full on a
 * computer, where a mouse wheel cannot scroll sideways.
 */
export function ProductRow({ products, lang }: { products: Card[]; lang: Lang }) {
  // On a computer, only full rows of four; a phone still swipes through all of them.
  const keep = products.length >= 8 ? 8 : products.length >= 4 ? 4 : products.length;
  return (
    <div className="-mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 no-scrollbar md:mx-0 md:grid md:scroll-px-0 md:grid-cols-4 md:overflow-visible md:px-0 md:pb-0">
      {products.map((p, i) => (
        <div key={p.id} className={`w-[46%] shrink-0 snap-start sm:w-[30%] md:w-auto ${i >= keep ? "md:hidden" : ""}`}>
          <ProductCard p={p} lang={lang} />
        </div>
      ))}
    </div>
  );
}
