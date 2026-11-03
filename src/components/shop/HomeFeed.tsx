"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { dict, href, type Lang } from "@/i18n";
import type { ProductCard } from "@/lib/catalog";
import { personalize } from "@/lib/home-feed";
import { readViewed } from "@/lib/client/recent";
import { ProductGrid, ProductRow } from "./ProductCard";
import { IconChevron } from "./Icons";

type Item = { card: ProductCard; category: string | null };

const STEP = 10;
const noop = () => () => {};
const viewedKey = () => readViewed().join(",");

/** What this browser opened, read once the page is live (empty on the server: everyone gets the same first page). */
function useSeen() {
  const key = useSyncExternalStore(noop, viewedKey, () => "");
  return useMemo(() => (key ? key.split(",") : []), [key]);
}

/**
 * Near the top of the home page, for a visitor who came before: what they
 * opened last ("Vus récemment") and more of the categories they looked at
 * ("Pour vous"), without what they already saw. Nothing on a first visit.
 */
export function HomeForYou({ feed, lang }: { feed: Item[]; lang: Lang }) {
  const t = dict(lang);
  const seen = useSeen();
  const recent = useMemo(() => seen.map((id) => feed.find((f) => f.card.id === id)?.card).filter((c): c is ProductCard => Boolean(c)).slice(0, 10), [seen, feed]);
  const forYou = useMemo(() => {
    const cats = new Set(seen.map((id) => feed.find((f) => f.card.id === id)?.category).filter(Boolean));
    return personalize(feed, seen).filter((f) => f.category && cats.has(f.category) && !seen.includes(f.card.id)).map((f) => f.card).slice(0, 10);
  }, [feed, seen]);
  return (
    <>
      {forYou.length >= 4 && (
        <Shelf title={t.home.forYou}>
          <ProductRow products={forYou} lang={lang} list="home_for_you" />
        </Shelf>
      )}
      {recent.length >= 2 && (
        <Shelf title={t.home.recent}>
          <ProductRow products={recent} lang={lang} compact list="home_recent" />
        </Shelf>
      )}
    </>
  );
}

/**
 * At the end of the home page, the whole shop in its ranked order (the
 * categories looked at a little higher), ten more each time the reader nears
 * the end, then a way to the full shop.
 */
export function HomeMore({ feed, lang }: { feed: Item[]; lang: Lang }) {
  const t = dict(lang);
  const seen = useSeen();
  const ordered = useMemo(() => personalize(feed, seen), [feed, seen]);
  const [shown, setShown] = useState(STEP);
  const end = useRef<HTMLDivElement>(null);
  const more = shown < ordered.length;
  useEffect(() => {
    const el = end.current;
    if (!el || !more || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((e) => {
      if (e.some((x) => x.isIntersecting)) setShown((n) => n + STEP);
    }, { rootMargin: "600px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [more, shown]);
  if (!ordered.length) return null;
  return (
    <Shelf title={t.home.more}>
      <ProductGrid products={ordered.slice(0, shown).map((f) => f.card)} lang={lang} list="home_feed" />
      <div ref={end} className="mt-8 flex justify-center">
        {more ? (
          <button type="button" onClick={() => setShown((n) => n + STEP)} className="min-h-12 rounded-full border border-ink/60 bg-white px-6 text-[16px] font-bold text-ink hover:bg-sand">
            {t.home.loadMore}
          </button>
        ) : (
          <Link href={href(lang, "/boutique")} className="flex min-h-12 items-center gap-1 rounded-full bg-ink px-6 text-[16px] font-bold text-white">
            {t.home.allShop}
            <IconChevron className="h-5 w-5" />
          </Link>
        )}
      </div>
    </Shelf>
  );
}

function Shelf({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mx-auto mt-12 max-w-6xl px-4 md:mt-16">
      <h2 className="mb-4 text-[22px] font-bold leading-tight text-ink md:text-[26px]">{title}</h2>
      {children}
    </section>
  );
}
