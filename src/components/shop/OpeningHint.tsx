"use client";

import { useLinkStatus } from "next/link";

/**
 * Over a card's picture while its page is still on its way (a slow
 * connection, a page not loaded ahead yet): the tap is seen at once, so
 * nobody taps again. Shown after a short delay, so an instant opening does
 * not flash it; always in place, so nothing moves.
 */
export function OpeningHint() {
  const { pending } = useLinkStatus();
  return (
    <span aria-hidden className={`pointer-events-none absolute inset-0 grid place-items-center bg-white/55 transition-opacity duration-150 ${pending ? "opacity-100 delay-150" : "opacity-0"}`}>
      {pending && <span className="h-9 w-9 animate-spin rounded-full border-[3px] border-sea/25 border-t-sea" />}
    </span>
  );
}
