"use client";

import Link from "next/link";
import { useState, type ComponentProps } from "react";

/**
 * A shop link that loads its page ahead only once the person shows they mean
 * to open it: a finger touches it, the pointer comes over it, it gets the
 * focus. Next's own default loads every link in sight, so one visit to the
 * home page asked the server for some forty pages nobody opened; the host
 * counts each of them. The tap still opens fast: the page is asked for at the
 * touch, a moment before the click.
 *
 * A link that sets `prefetch` itself keeps its own choice.
 */
export function IntentLink({ prefetch, onPointerEnter, onTouchStart, onFocus, ...rest }: ComponentProps<typeof Link>) {
  const [armed, setArmed] = useState(false);
  return (
    <Link
      {...rest}
      prefetch={prefetch !== undefined ? prefetch : armed ? null : false}
      onPointerEnter={(e) => {
        setArmed(true);
        onPointerEnter?.(e);
      }}
      onTouchStart={(e) => {
        setArmed(true);
        onTouchStart?.(e);
      }}
      onFocus={(e) => {
        setArmed(true);
        onFocus?.(e);
      }}
    />
  );
}
