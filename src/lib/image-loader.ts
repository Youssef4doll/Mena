/** Widths /api/img will produce. Anything else is rounded up to one of these, so the CDN caches a handful of files per image. */
export const IMG_WIDTHS = [64, 96, 128, 200, 256, 360, 480, 640, 828, 1080, 1280, 1600];

export function snapWidth(w: number): number {
  return IMG_WIDTHS.find((x) => x >= w) ?? IMG_WIDTHS[IMG_WIDTHS.length - 1];
}

export default function loader({ src, width }: { src: string; width: number; quality?: number }) {
  // src is "/api/img/<id>"; anything else (a static file) is served as-is.
  if (!src.startsWith("/api/img/")) return src;
  return `${src}/${snapWidth(width)}`;
}
