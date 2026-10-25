"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Img } from "./Img";
import { IconChevron } from "./Icons";

/** `label`: "Photo 2 sur 3", for screen readers and the dots. */
export type Banner = { imageId: string; alt: string; href: string | null; external: boolean; label: string };

const BOX = "relative block aspect-[16/7] w-full overflow-hidden rounded-2xl md:aspect-[21/6]";
const EVERY_MS = 5000;

/** One banner: its picture, and its link when it has one. The first one is the page's main picture, loaded first. */
function Slide({ b, first }: { b: Banner; first: boolean }) {
  const pic = <Img image={{ id: b.imageId, blur: null, width: 1600, height: 700 }} alt={b.alt} sizes="(min-width: 1152px) 1120px, 100vw" priority={first} />;
  if (!b.href) return <div className={BOX}>{pic}</div>;
  if (b.external)
    return (
      <a href={b.href} target="_blank" rel="noopener" className={BOX}>
        {pic}
      </a>
    );
  return (
    <Link href={b.href} className={BOX}>
      {pic}
    </Link>
  );
}

/**
 * The home page's banners. One: shown as it always was. Several: side by
 * side, swiped with a finger, with a dot for each; they move on by
 * themselves every few seconds until the visitor touches them (never with
 * "reduce motion", never while the page is hidden). On a computer, an arrow
 * on each side goes back and forth (a finger swipes: a phone or a tablet has none).
 */
export function HeroBanners({ banners, prev, next }: { banners: Banner[]; prev: string; next: string }) {
  const row = useRef<HTMLUListElement>(null);
  const [active, setActive] = useState(0);
  const activeRef = useRef(0);
  const touched = useRef(false);
  const many = banners.length > 1;

  // Which banner is in view, whatever the direction of the page.
  useEffect(() => {
    const ul = row.current;
    if (!many || !ul || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          activeRef.current = Number((e.target as HTMLElement).dataset.n);
          setActive(activeRef.current);
        }
      },
      { root: ul, threshold: 0.6 },
    );
    for (const li of Array.from(ul.children)) io.observe(li);
    return () => io.disconnect();
  }, [many]);

  /** Scrolls the row only (never the page) to banner n; right to left on an Arabic page. */
  function show(n: number) {
    const ul = row.current;
    const li = ul?.children[n] as HTMLElement | undefined;
    if (!ul || !li) return;
    const rtl = getComputedStyle(ul).direction === "rtl";
    ul.scrollTo({ left: rtl ? li.offsetLeft - (ul.clientWidth - li.offsetWidth) : li.offsetLeft, behavior: "smooth" });
  }

  useEffect(() => {
    if (!many || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => {
      if (!touched.current && !document.hidden) show((activeRef.current + 1) % banners.length);
    }, EVERY_MS);
    return () => clearInterval(id);
  }, [many, banners.length]);

  if (!many) return banners[0] ? <div className="mt-4"><Slide b={banners[0]} first /></div> : null;
  const stop = () => {
    touched.current = true;
  };
  return (
    <div className="mt-4" onPointerDown={stop} onFocus={stop} onWheel={stop}>
      <div className="group relative">
        <ul ref={row} className="relative flex snap-x snap-mandatory overflow-x-auto rounded-2xl no-scrollbar" aria-roledescription="carousel">
          {banners.map((b, i) => (
            <li key={`${b.imageId}-${i}`} data-n={i} className="w-full shrink-0 snap-start" aria-label={b.label}>
              <Slide b={b} first={i === 0} />
            </li>
          ))}
        </ul>
        {/* Round, from the last to the first and back. */}
        <Arrow label={prev} side="start" onClick={() => { stop(); show((activeRef.current - 1 + banners.length) % banners.length); }} />
        <Arrow label={next} side="end" onClick={() => { stop(); show((activeRef.current + 1) % banners.length); }} />
      </div>
      <div className="mt-2 flex justify-center gap-1">
        {banners.map((b, i) => (
          <button
            key={i}
            type="button"
            aria-label={b.label}
            aria-current={i === active}
            onClick={() => {
              stop();
              show(i);
            }}
            className="grid h-6 w-6 place-items-center"
          >
            <span className={`block h-2 rounded-full transition-all ${i === active ? "w-5 bg-ink" : "w-2 bg-ink/25"}`} />
          </button>
        ))}
      </div>
    </div>
  );
}

/** A computer's arrow over the banner's edge: wide screens without a touch screen only, brighter when the banner is pointed at. */
function Arrow({ label, side, onClick }: { label: string; side: "start" | "end"; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`absolute top-1/2 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-white/90 text-ink opacity-80 shadow-[0_4px_14px_-6px_rgb(0_0_0/.45)] transition hover:bg-white hover:opacity-100 focus-visible:opacity-100 group-hover:opacity-100 lg:flex lg:pointer-coarse:hidden ${side === "start" ? "start-3" : "end-3"}`}
    >
      <IconChevron className={`h-6 w-6 ${side === "start" ? "rotate-180" : ""}`} />
    </button>
  );
}
