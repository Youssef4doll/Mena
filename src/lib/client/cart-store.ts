"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { randomId } from "./storage";

/**
 * The basket in the browser: ids and quantities, plus a name and picture so
 * the drawer can draw itself before the server answers. Prices are never
 * kept here — every price shown comes from /api/quote.
 */
export type CartLine = { productId: string; variantId: string | null; qty: number; name: string; variantName: string | null; imageId: string | null; slug: string };

type CartState = {
  token: string;
  lines: CartLine[];
  open: boolean;
  add: (line: CartLine) => void;
  setQty: (productId: string, variantId: string | null, qty: number) => void;
  remove: (productId: string, variantId: string | null) => void;
  replace: (lines: CartLine[]) => void;
  clear: () => void;
  setOpen: (open: boolean) => void;
};

const same = (a: { productId: string; variantId: string | null }, b: { productId: string; variantId: string | null }) =>
  a.productId === b.productId && (a.variantId ?? null) === (b.variantId ?? null);

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      token: "",
      lines: [],
      open: false,
      add: (line) =>
        set((s) => {
          const existing = s.lines.find((l) => same(l, line));
          const lines = existing
            ? s.lines.map((l) => (same(l, line) ? { ...l, qty: Math.min(10, l.qty + line.qty) } : l))
            : [...s.lines, { ...line, qty: Math.min(10, line.qty) }];
          return { lines: lines.slice(0, 30), token: s.token || randomId() };
        }),
      setQty: (productId, variantId, qty) =>
        set((s) => ({ lines: s.lines.map((l) => (same(l, { productId, variantId }) ? { ...l, qty: Math.max(1, Math.min(10, qty)) } : l)) })),
      remove: (productId, variantId) => set((s) => ({ lines: s.lines.filter((l) => !same(l, { productId, variantId })) })),
      replace: (lines) => set({ lines }),
      // A placed order starts a new basket with a new token.
      clear: () => set({ lines: [], token: randomId() }),
      setOpen: (open) => set({ open }),
    }),
    {
      name: "mena_cart",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ token: s.token, lines: s.lines }),
    },
  ),
);

export const cartCount = (lines: CartLine[]) => lines.reduce((n, l) => n + l.qty, 0);
