import Link from "next/link";
import { href, pick, type Lang } from "@/i18n";
import type { ProductCard } from "@/lib/catalog";
import { formatTND } from "@/lib/money";
import { Img } from "./Img";

/**
 * Amazon's home cards: a white box, a title, four products in a 2 × 2 grid
 * (picture, name, price), and a link to see them all. Only real shelves of
 * the shop (a category's best, packs that save, small prices, what is new),
 * each with at least four products; on a phone they scroll sideways.
 */
export type Quad = { key: string; title: string; link: { href: string; label: string }; products: ProductCard[] };

/** The tiles' widths: a quarter of a card on a computer, about 40 % of a phone's screen. */
const TILE_SIZES = "(min-width: 1024px) 130px, (min-width: 768px) 15vw, 38vw";

export function QuadCard({ q, lang, eager = false, list }: { q: Quad; lang: Lang; eager?: boolean; list: string }) {
  return (
    <section className="flex w-[80%] shrink-0 snap-start flex-col rounded-2xl border border-line bg-white p-4 shadow-[0_6px_20px_-16px_rgb(0_0_0/.5)] sm:w-[46%] md:w-auto" aria-labelledby={`quad-${q.key}`}>
      <h2 id={`quad-${q.key}`} className="line-clamp-2 text-[19px] font-bold leading-snug text-ink md:text-[20px]">
        {q.title}
      </h2>
      <ul className="mt-3 grid flex-1 grid-cols-2 gap-x-3 gap-y-3">
        {q.products.slice(0, 4).map((p) => (
          <li key={p.id} className="min-w-0">
            <Link href={href(lang, `/produit/${p.slug}`)} className="group block" data-list={list}>
              <span className="relative block aspect-square overflow-hidden rounded-xl bg-sand">
                <Img image={p.images[0] ?? null} alt="" sizes={TILE_SIZES} priority={eager} className="transition duration-500 group-hover:scale-[1.04]" />
              </span>
              <span className="mt-1.5 block truncate text-[14px] leading-tight text-ink-2" dir="auto">
                {pick(lang, p.name, p.nameAr)}
              </span>
              <span className="block text-[15px] font-bold text-ink price-nums ltr-nums">{formatTND(p.price, lang)}</span>
            </Link>
          </li>
        ))}
      </ul>
      <Link href={q.link.href} className="mt-3 flex min-h-10 items-center text-[15px] font-bold text-sea-2 underline-offset-4 hover:underline">
        {q.link.label}
      </Link>
    </section>
  );
}
