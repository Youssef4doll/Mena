"use client";

import { usePathname } from "next/navigation";

/** Hides its children on the checkout: nothing to wander off to while ordering. */
export function HideOnCheckout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (/\/commande(\/|$)/.test(pathname) && !pathname.includes("/merci")) return null;
  return <>{children}</>;
}
