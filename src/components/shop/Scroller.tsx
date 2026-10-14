"use client";

import { useEffect, useRef, useState } from "react";
import { IconChevron } from "./Icons";

/**
 * A row swiped sideways on a phone. From tablet width, two arrows also move it
 * by a screenful (mirrored in Arabic): a mouse cannot scroll sideways, and on a
 * tablet the arrow says there is more.
 */
export function Scroller({ children, prev, next }: { children: React.ReactNode; prev: string; next: string }) {
  const ref = useRef<HTMLDivElement>(null);
  // Which ends are reached, so an arrow that would do nothing is not shown (none before the first measure).
  const [edge, setEdge] = useState({ start: true, end: true });
  const measure = () => {
    const el = ref.current;
    if (!el) return;
    const x = Math.abs(el.scrollLeft);
    const start = x < 8;
    const end = x + el.clientWidth >= el.scrollWidth - 8;
    setEdge((e) => (e.start === start && e.end === end ? e : { start, end }));
  };
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const move = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    const rtl = getComputedStyle(el).direction === "rtl";
    el.scrollBy({ left: dir * (rtl ? -1 : 1) * el.clientWidth * 0.85, behavior: "smooth" });
  };
  const btn = "absolute top-1/2 z-10 hidden h-14 w-11 -translate-y-1/2 items-center justify-center rounded-lg bg-white/95 text-ink shadow-lift ring-1 ring-line hover:bg-white";
  return (
    <div className="relative">
      <div ref={ref} onScroll={measure} className="-mx-4 flex snap-x gap-3 overflow-x-auto scroll-px-4 px-4 pb-2 no-scrollbar md:mx-0 md:scroll-px-0 md:px-0">
        {children}
      </div>
      <button type="button" onClick={() => move(-1)} className={`${btn} -start-3 ${edge.start ? "" : "md:flex"}`} aria-label={prev} tabIndex={edge.start ? -1 : 0}>
        <IconChevron className="h-6 w-6 rotate-180" />
      </button>
      <button type="button" onClick={() => move(1)} className={`${btn} -end-3 ${edge.end ? "" : "md:flex"}`} aria-label={next} tabIndex={edge.end ? -1 : 0}>
        <IconChevron className="h-6 w-6" />
      </button>
    </div>
  );
}
