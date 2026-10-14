import Link from "next/link";
import type { ProductCard as Card } from "@/lib/catalog";
import { dict, href, pick, type Lang } from "@/i18n";
import { discountPct } from "@/lib/offer-display";
import { formatTND } from "@/lib/money";
import { Img } from "./Img";
import { QuickBuy } from "./QuickBuy";
import { IconGift, IconStar, IconTruck } from "./Icons";

/**
 * A product in a list, calm and honest: the picture in a light frame, the
 * name, the price right under it, at most one fact in colour (the shop's
 * best pack, free delivery, or a really low stock), the stars and orders of
 * real customers in one quiet line, and the button that orders it on the
 * spot. The picture, name and price open the product page. Cards of a row
 * share their rows (subgrid), so prices line up without empty space.
 */
export function ProductCard({ p, lang, priority = false, className = "", compact = false }: { p: Card; lang: Lang; priority?: boolean; className?: string; compact?: boolean }) {
  const t = dict(lang);
  const name = pick(lang, p.name, p.nameAr);
  const out = p.stock.kind === "out";
  const pct = out ? 0 : discountPct(p.price, p.compareAt);
  const struck = !out && p.compareAt != null && p.compareAt > p.price ? p.compareAt : null;
  const tag =
    out || compact
      ? null
      : p.deal
        ? { cls: "text-deal", icon: <IconGift className="mt-0.5 h-4 w-4 shrink-0" />, text: pick(lang, p.deal.label, p.deal.labelAr) }
        : p.freeDelivery
          ? { cls: "text-olive", icon: <IconTruck className="mt-0.5 h-4 w-4 shrink-0" />, text: t.buy.freeDelivery }
          : p.stock.kind === "low"
            ? { cls: "text-clay", icon: null, text: t.product.low(p.stock.qty) }
            : null;
  const sold = compact ? null : p.sold;
  return (
    <div className={`group row-span-4 grid grid-rows-subgrid content-start gap-y-0 ${className}`}>
      <Link href={href(lang, `/produit/${p.slug}`)} className="row-span-3 grid grid-rows-subgrid gap-y-0 rounded-2xl" prefetch={false}>
        <div className="relative aspect-square overflow-hidden rounded-2xl border border-line bg-white">
          <Img image={p.images[0] ?? null} alt={p.images[0]?.alt ?? name} sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw" priority={priority} className={`transition duration-500 group-hover:scale-[1.03] ${out ? "opacity-60 grayscale" : ""}`} />
          {(out || pct > 0) && (
            <span className={`absolute start-2.5 top-2.5 rounded-full px-2.5 text-[14px] font-bold leading-7 text-white ${out ? "bg-ink/85" : "bg-deal"}`}>
              {out ? t.product.out : <span className="ltr-nums">−{pct}%</span>}
            </span>
          )}
        </div>
        <h3 className="mt-2.5 line-clamp-2 text-[16px] font-normal leading-snug text-ink underline-offset-2 group-hover:underline">{name}</h3>
        <div className="mt-1 flex flex-col items-start gap-1">
          <span className="relative flex flex-wrap items-baseline gap-x-1.5">
            {(p.packOf || p.priceFrom) && <span className="text-[15px] text-muted">{p.packOf ? t.product.pack(p.packOf) : t.product.from}</span>}
            <span className="whitespace-nowrap text-[20px] font-bold leading-tight text-ink price-nums ltr-nums">{formatTND(p.price, lang)}</span>
            {struck != null && (
              <>
                <span className="sr-only">{t.buy.instead(formatTND(struck, lang))}</span>
                <s aria-hidden className="whitespace-nowrap text-[15px] text-muted price-nums ltr-nums">{formatTND(struck, lang)}</s>
              </>
            )}
          </span>
          {tag && (
            <span className={`inline-flex items-start gap-1 text-[15px] font-bold leading-snug ${tag.cls}`}>
              {tag.icon}
              {tag.text}
            </span>
          )}
          {(p.rating || sold) && (
            <span className="flex flex-wrap items-center gap-x-1.5 text-[15px] text-muted">
              {p.rating && (
                <span className="inline-flex items-center gap-1">
                  <IconStar className="h-4 w-4 text-[#b07a1e]" />
                  <span className="font-bold text-ink-2 ltr-nums">{p.rating.avg.toFixed(1)}</span>
                  <span className="sr-only">/5</span>
                  <span className="ltr-nums">({p.rating.count})</span>
                </span>
              )}
              {p.rating && sold && <span aria-hidden>·</span>}
              {sold && (
                <span>
                  <span className="ltr-nums">+{sold}</span> {t.product.soldShort}
                </span>
              )}
            </span>
          )}
        </div>
      </Link>
      {!out && !compact ? (
        <div className="mt-3">
          <QuickBuy slug={p.slug} productId={p.id} lang={lang} />
        </div>
      ) : (
        <span aria-hidden />
      )}
    </div>
  );
}

export function ProductGrid({ products, lang, priorityFirst = 0 }: { products: Card[]; lang: Lang; priorityFirst?: number }) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 lg:gap-x-5 lg:gap-y-10">
      {products.map((p, i) => (
        <ProductCard key={p.id} p={p} lang={lang} priority={i < priorityFirst} />
      ))}
    </div>
  );
}

/**
 * A shelf: swiped sideways on a phone; laid out in full on a computer, where
 * a mouse wheel cannot scroll sideways. `compact`: pictures, names and prices
 * only, for the suggestions under a product page.
 */
export function ProductRow({ products, lang, compact = false }: { products: Card[]; lang: Lang; compact?: boolean }) {
  // On a computer, only full rows of four; a phone still swipes through all of them.
  const keep = products.length >= 8 ? 8 : products.length >= 4 ? 4 : products.length;
  return (
    <div className="-mx-4 grid auto-cols-[46%] grid-flow-col grid-rows-[repeat(4,auto)] gap-x-3 overflow-x-auto scroll-px-4 px-4 pb-2 snap-x no-scrollbar sm:auto-cols-[30%] md:mx-0 md:auto-cols-auto md:grid-flow-row md:grid-cols-4 md:grid-rows-none md:gap-x-5 md:gap-y-10 md:overflow-visible md:px-0 md:pb-0">
      {products.map((p, i) => (
        <ProductCard key={p.id} p={p} lang={lang} compact={compact} className={`snap-start ${i >= keep ? "md:hidden" : ""}`} />
      ))}
    </div>
  );
}
