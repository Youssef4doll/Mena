"use client";

import { useEffect } from "react";
import { pixelPurchase, type PixelItem } from "@/lib/client/pixels";
import { store } from "@/lib/client/storage";

/** The browser half of the purchase event, once per order (a reload does not count twice). */
export function PurchasePixel({ ref_, total, items, enabled }: { ref_: string; total: number; items: PixelItem[]; enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return;
    const key = `mena_px_${ref_}`;
    if (store.get(key)) return;
    // Pixels load after consent; give them a moment to initialise.
    const id = setTimeout(() => {
      pixelPurchase(ref_, items, total);
      store.set(key, "1");
    }, 1200);
    return () => clearTimeout(id);
  }, [enabled, ref_, total, items]);
  return null;
}
