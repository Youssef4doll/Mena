"use client";

import { useCallback, useEffect, useRef } from "react";

/** The hashes the shop's sheets put in the address while they are open. */
const SHEETS = ["#commande", "#panier"];
/**
 * Whether the history entry under the current sheet hash was added by a sheet
 * of this page (and so can be taken back). A link shared with "#commande" in
 * it, opened as the first page, is not ours: Back there would leave the shop.
 */
let entryOurs = false;

/**
 * Back closes a sheet instead of leaving the page. Most visitors come from an
 * ad, so the shop is often the first page of the history: without this, the
 * phone's Back button (or gesture) shuts the in-app browser with the form
 * half filled.
 *
 * Opening adds a history entry (#tag). Back, or close(), takes it away and
 * closes the sheet. dismiss() closes it and leaves the entry for whatever
 * comes next: the basket sheet that takes over from the order sheet, or a
 * link that replaces the entry.
 */
export function useBackToClose(open: boolean, onClose: () => void, tag: string) {
  const pushed = useRef(false);
  const closing = useRef(false);
  const cb = useRef(onClose);
  useEffect(() => {
    cb.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const mark = `#${tag}`;
    closing.current = false;
    // Once per opening, even when the effect runs twice (React's development checks).
    if (location.hash !== mark || !entryOurs) {
      const here = `${location.pathname}${location.search}`;
      const url = `${here}${mark}`;
      if (SHEETS.includes(location.hash) && entryOurs) {
        // Another sheet hands over (order sheet, then "added to basket"): one entry for both.
        history.replaceState(history.state, "", url);
      } else {
        // A sheet hash that came with the link is dropped first, so Back stays in the shop.
        if (SHEETS.includes(location.hash)) history.replaceState(history.state, "", here);
        history.pushState(history.state, "", url);
        entryOurs = true;
      }
      pushed.current = true;
    }
    const onPop = () => {
      if (location.hash === mark) return;
      pushed.current = false;
      entryOurs = false;
      closing.current = true;
      cb.current();
    };
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, [open, tag]);

  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    if (pushed.current && entryOurs && location.hash === `#${tag}`) {
      pushed.current = false;
      entryOurs = false;
      history.back();
    } else cb.current();
  }, [tag]);

  const dismiss = useCallback(() => {
    pushed.current = false;
    closing.current = true;
    cb.current();
  }, []);

  return { close, dismiss };
}
