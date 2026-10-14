"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { dict, type Lang } from "@/i18n";
import type { ImageRef } from "@/lib/catalog";
import { IconClose, IconExpand, IconMinus } from "./Icons";

/**
 * The pictures in full screen, on white: swiped one by one, the counter and
 * the thumbnails at hand, and a zoom (double tap, or the button) that lets the
 * customer move around a picture to read a label or see a stitch. The phone's
 * Back button closes it, as people expect, instead of leaving the page.
 */
export function GalleryViewer({ images, start, name, lang, onClose }: { images: ImageRef[]; start: number; name: string; lang: Lang; onClose: () => void }) {
  const t = dict(lang);
  const [i, setI] = useState(start);
  const [zoom, setZoom] = useState(false);
  const strip = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const zoomBox = useRef<HTMLDivElement>(null);
  const closing = useRef(false);
  const pushed = useRef(false);

  // Opening adds a history entry; Back (or the close button, which goes back) closes it.
  // Added once, even when the effect runs twice (React's development checks).
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    if (!pushed.current && location.hash !== "#photos") {
      history.pushState(history.state, "", `${location.pathname}${location.search}#photos`);
      pushed.current = true;
    }
    const onPop = () => {
      if (location.hash === "#photos") return;
      closing.current = true;
      onClose();
    };
    addEventListener("popstate", onPop);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeBtn.current?.focus();
    // Straight to the picture that was tapped.
    const el = strip.current;
    if (el) el.scrollLeft = (document.dir === "rtl" ? -1 : 1) * start * el.clientWidth;
    return () => {
      removeEventListener("popstate", onPop);
      document.body.style.overflow = overflow;
      opener?.focus?.({ preventScroll: true });
    };
    // Runs once per opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = () => {
    if (closing.current) return;
    closing.current = true;
    if (pushed.current && location.hash === "#photos") history.back();
    else onClose();
  };

  const go = (n: number) => {
    const el = strip.current;
    if (!el || n < 0 || n >= images.length) return;
    setZoom(false);
    el.scrollTo({ left: (document.dir === "rtl" ? -1 : 1) * n * el.clientWidth, behavior: "smooth" });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      const rtl = document.dir === "rtl";
      if (e.key === "ArrowRight") go(rtl ? i - 1 : i + 1);
      if (e.key === "ArrowLeft") go(rtl ? i + 1 : i - 1);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  });

  // Two taps close together, without moving: a double tap, with a mouse or a finger alike.
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);
  const onTap = (e: React.PointerEvent<HTMLElement>) => {
    const now = e.timeStamp;
    const prev = lastTap.current;
    lastTap.current = { t: now, x: e.clientX, y: e.clientY };
    if (!prev || now - prev.t > 320 || Math.hypot(e.clientX - prev.x, e.clientY - prev.y) > 24) return;
    lastTap.current = null;
    const r = e.currentTarget.getBoundingClientRect();
    toggleZoom((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  };

  /** Zooms on the point that was tapped, so the detail the customer wanted is in view. */
  function toggleZoom(x?: number, y?: number) {
    if (zoom) return setZoom(false);
    setZoom(true);
    requestAnimationFrame(() => {
      const box = zoomBox.current;
      if (!box) return;
      const fx = x ?? 0.5;
      const fy = y ?? 0.5;
      box.scrollLeft = (box.scrollWidth - box.clientWidth) * (document.dir === "rtl" ? -(1 - fx) : fx);
      box.scrollTop = (box.scrollHeight - box.clientHeight) * fy;
    });
  }

  return (
    <div className="fixed inset-0 z-[70] flex animate-fade touch-manipulation flex-col bg-white" role="dialog" aria-modal="true" aria-label={name}>
      <div className="flex items-center justify-between gap-3 border-b border-line px-3 py-2">
        <span className="px-2 text-[17px] font-bold text-ink" aria-live="polite">
          <span className="ltr-nums">
            {i + 1} / {images.length}
          </span>
        </span>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => toggleZoom()} className="flex h-12 items-center gap-2 rounded-xl px-3 text-[16px] font-bold text-ink hover:bg-sand" aria-pressed={zoom}>
            {zoom ? <IconMinus className="h-6 w-6" /> : <IconExpand className="h-6 w-6" />}
            {zoom ? t.product.zoomOut : t.product.zoomIn}
          </button>
          <button ref={closeBtn} type="button" onClick={close} className="flex h-12 w-12 items-center justify-center rounded-xl bg-sand text-ink" aria-label={t.nav.close}>
            <IconClose className="h-7 w-7" />
          </button>
        </div>
      </div>

      <div
        ref={strip}
        className={`flex min-h-0 flex-1 snap-x snap-mandatory no-scrollbar ${zoom ? "overflow-hidden" : "overflow-x-auto"}`}
        onScroll={(e) => {
          const el = e.currentTarget;
          const n = Math.round(Math.abs(el.scrollLeft) / el.clientWidth);
          if (n !== i) setI(n);
        }}
      >
        {images.map((img, n) => (
          <div key={img.id} className="relative h-full w-full shrink-0 snap-center">
            {zoom && n === i ? (
              <div ref={zoomBox} className="absolute inset-0 overflow-auto overscroll-contain" onPointerUp={onTap}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/img/${img.id}/1600`} alt={img.alt ?? name} className="h-auto w-[250%] max-w-none md:w-[180%]" draggable={false} />
              </div>
            ) : (
              <button
                type="button"
                className="absolute inset-0 cursor-zoom-in [--focus-offset:-3px]"
                onPointerUp={onTap}
                onClick={(e) => e.detail === 0 && toggleZoom()}
                aria-label={`${t.product.zoomIn} — ${t.product.photo(n + 1, images.length)}`}
              >
                <Image src={`/api/img/${img.id}`} alt={img.alt ?? name} fill sizes="100vw" className="object-contain p-2" priority={n === start} />
              </button>
            )}
          </div>
        ))}
      </div>

      {images.length > 1 && (
        <div className="flex justify-center gap-2 overflow-x-auto border-t border-line px-3 py-2.5 pb-[max(.625rem,env(safe-area-inset-bottom))] no-scrollbar">
          {images.map((img, n) => (
            <button key={img.id} type="button" onClick={() => go(n)} className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 ${n === i ? "border-sea ring-2 ring-sea/30" : "border-line"}`} aria-label={t.product.photo(n + 1, images.length)} aria-current={n === i}>
              <Image src={`/api/img/${img.id}`} alt="" fill sizes="64px" className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
