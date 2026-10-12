"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { href, type Lang } from "@/i18n";
import { useCart, type CartLine } from "@/lib/client/cart-store";

/** The reminder link: puts the saved basket back and opens the checkout. */
export function RestoreCart({ id, lang }: { id: string; lang: Lang }) {
  const router = useRouter();
  const add = useCart((s) => s.add);
  useEffect(() => {
    fetch(`/api/cart/${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : { lines: [] }))
      .then((d: { lines: CartLine[] }) => {
        const { lines } = useCart.getState();
        for (const l of d.lines) if (!lines.some((x) => x.productId === l.productId && x.variantId === l.variantId)) add(l);
        if (d.lines.length) useCart.getState().setRestoredFrom(id);
        router.replace(href(lang, d.lines.length ? "/commande" : "/boutique"));
      })
      .catch(() => router.replace(href(lang, "/boutique")));
  }, [id, lang, add, router]);
  return <div className="min-h-[50vh]" />;
}
