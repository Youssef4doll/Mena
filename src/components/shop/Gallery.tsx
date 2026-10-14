"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useRef, useState } from "react";
import { dict, type Lang } from "@/i18n";
import type { ImageRef } from "@/lib/catalog";
import type { Video } from "@/lib/product-content";
import { track } from "@/lib/client/track";
import { Placeholder } from "./Img";
import { IconExpand, IconPlay } from "./Icons";

// The full-screen viewer is only downloaded when someone opens it.
const Viewer = dynamic(() => import("./GalleryViewer").then((m) => m.GalleryViewer), { ssr: false });
const preloadViewer = () => void import("./GalleryViewer");

export type Slide = { kind: "image"; image: ImageRef } | { kind: "video"; video: Video; poster: ImageRef | null };

/** The video goes second: the first picture stays the one the card showed, and the video is one swipe away. */
export function slidesOf(images: ImageRef[], video: Video | null): Slide[] {
  const s: Slide[] = images.map((image) => ({ kind: "image", image }));
  if (video) s.splice(Math.min(1, s.length), 0, { kind: "video", video, poster: images[0] ?? null });
  return s;
}

/**
 * The pictures, Amazon's way: swiped on a phone with the thumbnails under
 * them, the thumbnails down the side on a computer, a counter, and the whole
 * set in full screen (with zoom) at a tap. The video plays in its place,
 * loaded only when asked for.
 */
export function Gallery({ slides, name, productId, badge, lang }: { slides: Slide[]; name: string; productId: string; badge: number; lang: Lang }) {
  const t = dict(lang);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [viewer, setViewer] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const swiped = useRef(false);
  const tag =
    badge > 0 ? (
      <span className="pointer-events-none absolute start-3 top-3 z-10 rounded-lg bg-deal px-2.5 py-1 text-[16px] font-bold text-white">
        <span className="ltr-nums">−{badge}%</span>
      </span>
    ) : null;
  if (slides.length === 0)
    return (
      <div className="relative -mx-4 aspect-square overflow-hidden md:mx-0 md:rounded-3xl">
        {tag}
        <Placeholder />
      </div>
    );
  const go = (n: number) => {
    const el = ref.current;
    if (!el) return;
    el.scrollTo({ left: (document.dir === "rtl" ? -1 : 1) * n * el.clientWidth, behavior: "smooth" });
  };
  const open = (n: number) => {
    setPlaying(false);
    setViewer(n);
    track("gallery_zoomed", { productId });
  };
  const photos = slides.flatMap((s) => (s.kind === "image" ? [s.image] : []));

  return (
    <div className="flex flex-col gap-2.5 md:flex-row md:items-start md:gap-3">
      <div className="relative -mx-4 min-w-0 md:mx-0 md:flex-1">
        {tag}
        <div
          ref={ref}
          className="flex aspect-square snap-x snap-mandatory overflow-x-auto overscroll-x-contain bg-white no-scrollbar md:rounded-3xl md:border md:border-line"
          onScroll={(e) => {
            const el = e.currentTarget;
            const n = Math.round(Math.abs(el.scrollLeft) / el.clientWidth);
            if (n === i) return;
            setI(n);
            // A video stops when it is swiped away.
            setPlaying(false);
            if (!swiped.current) {
              swiped.current = true;
              track("gallery_swiped", { productId });
            }
          }}
          role="group"
          aria-roledescription="carousel"
          aria-label={name}
        >
          {slides.map((s, n) => (
            <div key={n} className="relative h-full w-full shrink-0 snap-center snap-always" aria-label={t.product.photo(n + 1, slides.length)} role="group" aria-roledescription="slide">
              {s.kind === "image" ? (
                <button type="button" onClick={() => open(photos.indexOf(s.image))} onPointerDown={preloadViewer} className="block h-full w-full cursor-zoom-in [--focus-offset:-3px]" aria-label={t.product.zoom}>
                  <Image
                    src={`/api/img/${s.image.id}`}
                    alt={s.image.alt ?? (n === 0 ? name : "")}
                    fill
                    sizes="(min-width: 1024px) 560px, (min-width: 768px) 50vw, 100vw"
                    className="object-contain"
                    priority={n === 0}
                    placeholder={s.image.blur ? "blur" : "empty"}
                    blurDataURL={s.image.blur ?? undefined}
                  />
                </button>
              ) : playing && i === n ? (
                <VideoPlayer video={s.video} title={`${t.product.video} — ${name}`} />
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setPlaying(true);
                    track("video_played", { productId });
                  }}
                  className="group relative block h-full w-full overflow-hidden bg-night [--focus-offset:-3px]"
                  aria-label={`${t.product.playVideo} — ${name}`}
                >
                  {s.poster && <Image src={`/api/img/${s.poster.id}`} alt="" fill sizes="(min-width: 768px) 50vw, 100vw" className="scale-105 object-cover opacity-55 blur-[2px]" />}
                  <span className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white">
                    <span className="flex h-20 w-20 items-center justify-center rounded-full bg-white/95 text-night shadow-lift transition group-active:scale-95">
                      <IconPlay className="ms-1 h-10 w-10" />
                    </span>
                    <span className="rounded-full bg-night/70 px-4 py-1.5 text-[17px] font-bold">{t.product.playVideo}</span>
                  </span>
                </button>
              )}
            </div>
          ))}
        </div>
        {slides.length > 1 && (
          <span className="pointer-events-none absolute end-3 top-3 rounded-full bg-night/75 px-2.5 py-1 text-[14px] font-bold text-white" aria-hidden>
            <span className="ltr-nums">
              {i + 1}/{slides.length}
            </span>
          </span>
        )}
        {slides[i]?.kind === "image" && (
          <button type="button" onClick={() => open(photos.indexOf((slides[i] as { image: ImageRef }).image))} onPointerDown={preloadViewer} className="absolute bottom-3 end-3 flex h-12 w-12 items-center justify-center rounded-full bg-white/95 text-ink shadow-soft" aria-label={t.product.zoom}>
            <IconExpand className="h-6 w-6" />
          </button>
        )}
      </div>

      {slides.length > 1 && (
        // Thumbnails: under the picture on a phone (swiped if many), down the side on a computer.
        <div className="flex gap-2 overflow-x-auto px-0.5 py-0.5 no-scrollbar md:order-first md:max-h-[560px] md:flex-col md:overflow-y-auto md:overflow-x-visible">
          {slides.map((s, n) => (
            <button
              key={n}
              type="button"
              onClick={() => go(n)}
              className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2 bg-white transition md:h-[72px] md:w-[72px] ${i === n ? "border-sea ring-2 ring-sea/30" : "border-line hover:border-sea/50"}`}
              aria-label={s.kind === "video" ? t.product.playVideo : t.product.photo(n + 1, slides.length)}
              aria-current={i === n}
            >
              {s.kind === "image" ? (
                <Image src={`/api/img/${s.image.id}`} alt="" fill sizes="72px" className="object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center bg-night text-white">
                  <IconPlay className="h-7 w-7" />
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {viewer != null && <Viewer images={photos} start={viewer} name={name} lang={lang} onClose={() => setViewer(null)} />}
    </div>
  );
}

/** The video, loaded at the tap: YouTube without its tracking cookies, or the shop's own file. */
function VideoPlayer({ video, title }: { video: Video; title: string }) {
  if (video.kind === "youtube")
    return (
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1&playsinline=1&rel=0&modestbranding=1`}
        title={title}
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        className="absolute inset-0 h-full w-full border-0 bg-black"
      />
    );
  // eslint-disable-next-line jsx-a11y/media-has-caption
  return <video src={video.src} controls autoPlay playsInline className="absolute inset-0 h-full w-full bg-black object-contain" title={title} />;
}
