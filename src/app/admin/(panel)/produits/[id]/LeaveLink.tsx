"use client";

import Link from "next/link";
import { useState } from "react";
import { mayLeave } from "./editor-state";

/**
 * A link out of the product editor that asks first when the form has changes
 * not saved. `intent`: the page behind it is loaded in full once the pointer
 * rests on it, a finger touches it or it gets the focus, not as soon as it
 * shows (two neighbours loaded with every product would double the work of
 * each opening).
 */
export function LeaveLink({ href, prefetch, intent, className, children }: { href: string; prefetch?: boolean; intent?: boolean; className?: string; children: React.ReactNode }) {
  const [armed, setArmed] = useState(false);
  const arm = () => setArmed(true);
  return (
    <Link
      href={href}
      prefetch={intent ? armed : prefetch}
      className={className}
      onNavigate={(e) => !mayLeave() && e.preventDefault()}
      {...(intent ? { onPointerEnter: arm, onTouchStart: arm, onFocus: arm } : {})}
    >
      {children}
    </Link>
  );
}
