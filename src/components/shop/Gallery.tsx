"use client";

import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { dict, type Lang } from "@/i18n";
import type { ImageRef } from "@/lib/catalog";
import type { Video } from "@/lib/product-content";
import { track } from "@/lib/client/track";
import { Placeholder } from "./Img";
import { IconArrowDown, IconExpand, IconPlay } from "./Icons";

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
 * The pictures in a light frame: swiped on a phone with the thumbnails
 * centred under them, the thumbnails down the side on a computer, and the
 * whole set in full screen (with zoom) at a tap. The video plays in its
 * place, loaded only when asked for. A product with long pictures says so on
 * the first screen: a link in the picture's corner, with their real number.
 */
export function Gallery({ slides, name, productId, badge, lang, details }: { slides: Slide[]; name: string; productId: string; badge: number; lang: Lang; details?: { count: number; label: string; onClick: () => void } }) {
  const t = dict(lang);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [viewer, setViewer] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const swiped = useRef(false);
  const tag =
    badge > 0 ? (
      <span className="pointer-events-none absolute start-3 top-3 z-10 rounded-full bg-deal px-2.5 text-[14px] font-bold leading-7 text-white">
        <span className="ltr-nums">−{badge}%</span>
      </span>
    ) : null;
  // In the corner opposite the zoom button, never under it: narrower than the picture by the button, its margins
  // and a gap (12 + 44 + 8 + 12 px), it goes on two lines rather than over it. One line on a 360 px phone.
  const link =
    details && details.count > 0 ? (
      <button type="button" onClick={details.onClick} className="absolute bottom-3 start-3 flex min-h-11 max-w-[calc(100%-4.75rem)] items-center gap-1 rounded-[22px] border border-line bg-white/95 py-1 ps-3 pe-2.5 text-start text-[16px] font-bold leading-tight text-ink shadow-[0_2px_10px_-4px_rgb(0_0_0/.3)]" data-testid="details-link">
        <span>
          {details.label}&nbsp;<span className="ltr-nums">({details.count})</span>
        </span>
        <IconArrowDown className="h-4 w-4 shrink-0 text-sea" />
      </button>
    ) : null;
  if (slides.length === 0)
    return (
      <div className="relative aspect-square overflow-hidden rounded-2xl border border-line">
        {tag}
        <Placeholder />
        {link}
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
      <div className="relative min-w-0 md:flex-1">
        {tag}
        <div
          ref={ref}
          className="flex aspect-square snap-x snap-mandatory overflow-x-auto overscroll-x-contain rounded-2xl border border-line bg-white no-scrollbar"
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
            <div key={n} className="relative h-full w-full shrink-0 snap-center snap-always" aria-label={s.kind === "image" ? t.product.photo(photos.indexOf(s.image) + 1, photos.length) : t.product.video} role="group" aria-roledescription="slide">
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
        {slides[i]?.kind === "image" && (
          <button type="button" onClick={() => open(photos.indexOf((slides[i] as { image: ImageRef }).image))} onPointerDown={preloadViewer} className="absolute bottom-3 end-3 flex h-11 w-11 items-center justify-center rounded-full border border-line bg-white/95 text-ink-2" aria-label={t.product.zoom}>
            <IconExpand className="h-5 w-5" />
          </button>
        )}
        {/* Out of the way of a playing video's controls. */}
        {!playing && link}
      </div>

      {slides.length > 1 && (
        // Thumbnails: centred under the picture on a phone (swiped if many), down the side on a computer.
        <div className="overflow-x-auto no-scrollbar md:order-first md:max-h-[560px] md:overflow-y-auto md:overflow-x-visible">
          <div className="mx-auto flex w-max gap-2 p-0.5 md:mx-0 md:w-auto md:flex-col">
            {slides.map((s, n) => (
              <button
                key={n}
                type="button"
                onClick={() => go(n)}
                // With a mouse, pointing at a thumbnail shows its picture, as on Amazon.
                onMouseEnter={(e) => {
                  if (matchMedia("(pointer: fine)").matches && e.buttons === 0) go(n);
                }}
                className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border bg-white transition md:h-[72px] md:w-[72px] xl:h-16 xl:w-16 ${i === n ? "border-sea ring-1 ring-sea" : "border-line hover:border-sea/50"}`}
                aria-label={s.kind === "video" ? t.product.playVideo : t.product.photo(photos.indexOf(s.image) + 1, photos.length)}
                aria-current={i === n}
              >
                {s.kind === "image" ? (
                  <Image src={`/api/img/${s.image.id}`} alt="" fill sizes="72px" className="object-cover" />
                ) : (
                  <>
                    {s.poster && <Image src={`/api/img/${s.poster.id}`} alt="" fill sizes="72px" className="object-cover" />}
                    <span className={`absolute inset-0 flex items-center justify-center text-white ${s.poster ? "bg-night/40" : "bg-night"}`}>
                      <IconPlay className="h-6 w-6" />
                    </span>
                  </>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* On the page's body, not inside the gallery: a sticky or transformed parent would otherwise hold the full-screen view and let the page show over it. */}
      {viewer != null && createPortal(<Viewer images={photos} start={viewer} name={name} lang={lang} onClose={() => setViewer(null)} />, document.body)}
    </div>
  );
}

/**
 * The video, loaded at the tap: YouTube without its tracking cookies, another
 * platform's own player (Vimeo, TikTok, Instagram, Facebook), or the shop's file.
 * A vertical player (TikTok, a reel) keeps its shape in the middle of the slide.
 */
function VideoPlayer({ video, title }: { video: Video; title: string }) {
  if (video.kind === "file") return <video src={video.src} controls autoPlay playsInline className="absolute inset-0 h-full w-full bg-black object-contain" title={title} />;
  if (video.kind === "hls") return <StreamPlayer src={video.src} title={title} />;
  const src = video.kind === "youtube" ? `https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1&playsinline=1&rel=0&modestbranding=1` : video.src;
  const vertical = video.kind === "embed" && video.vertical;
  return (
    <div className="absolute inset-0 flex justify-center bg-black">
      <iframe
        src={src}
        title={title}
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-write"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        className={`h-full border-0 ${vertical ? "aspect-[9/16] max-w-full" : "w-full"}`}
      />
    </div>
  );
}

/**
 * A stream (.m3u8): played by the phone itself where it can (iPhone, most
 * Android phones), otherwise by hls.js, loaded only then.
 */
function StreamPlayer({ src, title }: { src: string; title: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.canPlayType("application/vnd.apple.mpegurl")) {
      el.src = src;
      void el.play().catch(() => {});
      return;
    }
    let hls: { destroy: () => void } | null = null;
    let gone = false;
    void import("hls.js").then(({ default: Hls }) => {
      if (gone || !Hls.isSupported()) return;
      const h = new Hls();
      h.loadSource(src);
      h.attachMedia(el);
      h.on(Hls.Events.MANIFEST_PARSED, () => void el.play().catch(() => {}));
      hls = h;
    });
    return () => {
      gone = true;
      hls?.destroy();
    };
  }, [src]);
  return <video ref={ref} controls playsInline className="absolute inset-0 h-full w-full bg-black object-contain" title={title} />;
}
