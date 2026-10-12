"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

/**
 * False while the server HTML is being hydrated, true after. For anything read
 * from localStorage (basket, saved address, cookie choice): the server cannot
 * know it, so it is only shown once the page is live.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(noop, () => true, () => false);
}
