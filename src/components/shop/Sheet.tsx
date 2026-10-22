"use client";

import { useEffect, useRef } from "react";
import { dict, type Lang } from "@/i18n";
import { IconClose } from "./Icons";
import { useFocusTrap } from "@/lib/client/focus-trap";
import { useBackToClose } from "@/lib/client/back-to-close";

/**
 * An order form over the page: a sheet from the bottom on a phone, a window
 * on a computer, under the product's picture and name. Escape, the backdrop
 * or the phone's Back button closes it; the page behind does not scroll, and
 * the focus goes back to what opened it. The close button takes the focus
 * first, so no keyboard comes up over the form.
 *
 * `children` gets `dismiss`: it closes the sheet and leaves its history entry
 * to what takes over (the "added to basket" sheet).
 */
export function Sheet({ lang, titleId, title, image, onClose, children }: { lang: Lang; titleId: string; title: string; image: string | null; onClose: () => void; children: (dismiss: () => void) => React.ReactNode }) {
  const t = dict(lang);
  const { close, dismiss } = useBackToClose(true, onClose, "commande");
  const closeBtn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useFocusTrap(panel, true);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      removeEventListener("keydown", onKey);
      // Without moving the page: the reader stays where they were.
      opener?.focus({ preventScroll: true });
    };
  }, [close]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <button type="button" className="absolute inset-0 animate-fade bg-ink/50" onClick={close} aria-label={t.nav.close} tabIndex={-1} />
      <div ref={panel} className="relative flex max-h-[94dvh] w-full animate-sheet-up flex-col overflow-hidden rounded-t-3xl bg-white shadow-lift md:max-w-xl md:rounded-3xl">
        <div className="flex items-center gap-3 border-b border-line bg-white px-4 py-3">
          <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-line bg-sand">
            {image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/img/${image}/200`} alt="" className="h-full w-full object-cover" />
            )}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span id={titleId} className="line-clamp-2 text-[17px] font-bold leading-snug text-ink">
              {title}
            </span>
          </span>
          <button ref={closeBtn} type="button" onClick={close} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink hover:bg-sand" aria-label={t.nav.close}>
            <IconClose className="h-6 w-6" />
          </button>
        </div>
        <div className="overflow-y-auto overscroll-contain px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">{children(dismiss)}</div>
      </div>
    </div>
  );
}
