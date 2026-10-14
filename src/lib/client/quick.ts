"use client";

import type { ProductPage } from "@/lib/catalog";
import type { PublicSettings } from "@/lib/settings-schema";

export type QuickData = { product: Omit<ProductPage, "related">; settings: PublicSettings };

const cache = new Map<string, Promise<QuickData | null>>();

/**
 * The product and settings for the quick order form. Started as soon as a
 * finger touches "Acheter maintenant", so the sheet usually opens filled.
 * A failed load is forgotten, so the next tap tries again.
 */
export function loadQuick(slug: string): Promise<QuickData | null> {
  let p = cache.get(slug);
  if (!p) {
    p = fetch(`/api/products/${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? (r.json() as Promise<QuickData>) : null))
      .catch(() => null)
      .then((d) => {
        if (!d) cache.delete(slug);
        return d;
      });
    cache.set(slug, p);
  }
  return p;
}
