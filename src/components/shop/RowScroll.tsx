"use client";

import { useEffect, useRef, useState } from "react";
import { IconChevron } from "./Icons";

/**
 * A shelf that scrolls sideways: a finger on a phone, an arrow on each side
 * on a computer (a mouse wheel does not scroll sideways). One click moves by
 * almost a screen of cards; right to left on an Arabic page.
 */
export function RowScroll({
  className,
  prev,
  next,
  children,
}: {
  className: string;
  prev: string;
  next: string;
  children: React.ReactNode;
}) {
  const row = useRef<HTMLDivElement>(null);
  // Arrows only when there is more to see than the screen shows.
  const [more, setMore] = useState(false);
  useEffect(() => {
    const el = row.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() =>
      setMore(el.scrollWidth > el.clientWidth + 4),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const go = (dir: -1 | 1) => {
    const el = row.current;
    if (!el) return;
    const rtl = getComputedStyle(el).direction === "rtl";
    el.scrollBy({
      left: dir * (rtl ? -1 : 1) * el.clientWidth * 0.85,
      behavior: "smooth",
    });
  };
  const arrow =
    "absolute top-[28%] z-10 hidden h-11 w-11 items-center justify-center rounded-full border border-line bg-white/95 text-ink shadow-[0_4px_14px_-6px_rgb(0_0_0/.45)] transition hover:bg-white md:flex md:pointer-coarse:hidden";
  return (
    <div className="relative">
      <div ref={row} className={className}>
        {children}
      </div>
      {more && (
        <>
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label={prev}
            className={`${arrow} -start-4`}
          >
            <IconChevron className="h-5 w-5 rotate-180" />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            aria-label={next}
            className={`${arrow} -end-4`}
          >
            <IconChevron className="h-5 w-5" />
          </button>
        </>
      )}
    </div>
  );
}
