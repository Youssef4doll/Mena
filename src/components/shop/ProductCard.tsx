import Link from "next/link";
import type { ProductCard as Card } from "@/lib/catalog";
import { dict, href, pick, type Lang } from "@/i18n";
import { discountPct } from "@/lib/offer-display";
import { formatTND } from "@/lib/money";
import { Img } from "./Img";
import { QuickBuy } from "./QuickBuy";
import { Stars } from "./Stars";
import { IconFire, IconGift, IconTruck } from "./Icons";

/**
 * A product in a list, built to be noticed and chosen at a glance — with
 * facts only: the real saving in red, delivery included when it is, the
 * shop's best pack, the stars and the orders of real customers, the stock
 * when it is really low. Then one strong button that orders it on the spot.
 * The picture, name and price open the product page.
 */
export function ProductCard({ p, lang, priority = false }: { p: Card; lang: Lang; priority?: boolean }) {
  const t = dict(lang);
  const name = pick(lang, p.name, p.nameAr);
  const out = p.stock.kind === "out";
  const pct = out ? 0 : discountPct(p.price, p.compareAt);
  const struck = !out && p.compareAt != null && p.compareAt > p.price ? p.compareAt : null;
  return (
    <div className="group flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-white transition hover:border-sand-2 hover:shadow-lift">
      <Link href={href(lang, `/produit/${p.slug}`)} className="flex flex-1 flex-col rounded-t-2xl [--focus-offset:-3px]" prefetch={false}>
        <div className="relative aspect-square overflow-hidden bg-white">
          <Img image={p.images[0] ?? null} alt={p.images[0]?.alt ?? name} sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw" priority={priority} className={`transition duration-500 group-hover:scale-[1.03] ${out ? "opacity-60 grayscale" : ""}`} />
          <div className="absolute start-2 top-2 flex flex-col items-start gap-1">
            {out && <span className="rounded-lg bg-ink/85 px-2.5 py-1 text-[14px] font-bold text-white">{t.product.out}</span>}
            {pct > 0 && (
              <span className="rounded-lg bg-deal px-2 py-1 text-[15px] font-bold leading-none text-white shadow-soft">
                <span className="ltr-nums">−{pct}%</span>
              </span>
            )}
          </div>
          {!out && p.freeDelivery && (
            <span className="absolute bottom-2 start-2 inline-flex items-center gap-1 rounded-lg bg-white/95 px-2 py-1 text-[14px] font-bold leading-tight text-olive shadow-soft">
              <IconTruck className="h-4 w-4 shrink-0" />
              {t.buy.freeDelivery}
            </span>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-1 p-3 pb-2">
          {/* Two lines kept for the name, so prices line up across a row. */}
          <h3 className="line-clamp-2 min-h-[2.75em] text-[16px] font-normal leading-snug text-ink">{name}</h3>
          {p.rating && (
            <span className="flex items-center gap-1 text-[14px] text-muted">
              <Stars value={p.rating.avg} size={15} />
              <span className="ltr-nums">({p.rating.count})</span>
            </span>
          )}
          <span className="relative flex flex-wrap items-baseline gap-x-1.5">
            {(p.packOf || p.priceFrom) && <span className="text-[14px] text-muted">{p.packOf ? t.product.pack(p.packOf) : t.product.from}</span>}
            <span className="whitespace-nowrap text-[20px] font-bold leading-tight text-ink price-nums ltr-nums">{formatTND(p.price, lang)}</span>
            {struck != null && (
              <>
                <span className="sr-only">{t.buy.instead(formatTND(struck, lang))}</span>
                <span aria-hidden className="whitespace-nowrap text-[14px] text-muted line-through price-nums ltr-nums">{formatTND(struck, lang)}</span>
              </>
            )}
          </span>
          {!out && p.deal && (
            <span className="mt-0.5 inline-flex items-start gap-1 self-start rounded-md bg-deal-soft px-2 py-1 text-[14px] font-bold leading-snug text-deal">
              <IconGift className="mt-px h-4 w-4 shrink-0" />
              {pick(lang, p.deal.label, p.deal.labelAr)}
            </span>
          )}
          {p.sold && (
            <span className="flex items-center gap-1 text-[14px] text-ink-2">
              <IconFire className="h-4 w-4 shrink-0 text-clay" />
              <span className="font-bold ltr-nums">+{p.sold}</span> {t.product.soldShort}
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
