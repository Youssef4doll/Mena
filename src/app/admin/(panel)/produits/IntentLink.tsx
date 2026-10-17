"use client";

import Link from "next/link";
import { useRef, useSyncExternalStore } from "react";

/**
 * A link that loads its page in full (code and data) once the person shows
 * they mean to open it — the pointer rests on it, a finger touches it, it gets
 * the focus — so the click opens at once. Not on sight: a page of 100 rows
 * would ask for 100 editors. One link is armed at a time: after a save, the
 * shop re-fetches the page under the last link touched, not every row the
 * pointer crossed.
 */
let armed: string | null = null;
const listeners = new Set<() => void>();
function arm(href: string) {
  if (armed === href) return;
  armed = href;
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** A pointer only passing over the list does not count as intent. */
const DWELL_MS = 60;

export function IntentLink({ href, className, children, ...rest }: { href: string; className?: string; children: React.ReactNode; "aria-label"?: string }) {
  const on = useSyncExternalStore(subscribe, () => armed === href, () => false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  return (
    <Link
      {...rest}
      href={href}
      prefetch={on}
      data-intent={on ? "armed" : undefined}
      className={className}
      onPointerEnter={(e) => {
        stop();
        if (e.pointerType === "mouse") timer.current = setTimeout(() => arm(href), DWELL_MS);
        else arm(href);
      }}
      onPointerLeave={stop}
      onTouchStart={() => arm(href)}
      onFocus={() => arm(href)}
    >
      {children}
    </Link>
  );
}
