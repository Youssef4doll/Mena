/**
 * An ad's picture or video, made ready for Claude in the browser: Claude
 * reads pictures, not videos, so a video becomes one sheet of still frames
 * (the first three seconds closely, then the rest), each labelled with the
 * ad's id and its second. Nothing leaves the browser until the owner sends
 * it; the files themselves are never uploaded, only these JPEG sheets.
 *
 *   prepareAd(file, id)        → PreparedAd
 *   photoData(src)             → string | null   a product photo of the shop, as a JPEG data URL
 */

export type PreparedAd = {
  kind: "video" | "image";
  /** The picture Claude reads (JPEG data URL). */
  sheet: string;
  /** A small preview for the page and the saved forecast. */
  thumb: string;
  seconds: number | null;
  ratio: string;
};

/** The frames of a video, in seconds: the hook closely, then spread over the rest. */
export function frameTimes(duration: number): number[] {
  if (!(duration > 0)) return [0.05];
  const early = [0.05, 0.5, 1, 1.5, 2, 3].filter((t) => t < duration - 0.05);
  const late: number[] = [];
  const from = 4;
  const to = duration - 0.3;
  if (to > from) for (let i = 0; i < 3; i++) late.push(from + ((to - from) * i) / 2);
  return [...early, ...late].slice(0, 9);
}

/** "9:16", "4:5", "1:1", "16:9", or the size itself. */
export function ratioOf(w: number, h: number): string {
  const r = w / h;
  const known: [string, number][] = [["9:16", 9 / 16], ["4:5", 4 / 5], ["1:1", 1], ["16:9", 16 / 9], ["2:3", 2 / 3], ["3:4", 3 / 4]];
  const best = known.find(([, v]) => Math.abs(r - v) / v < 0.04);
  return best ? best[0] : `${w}×${h}`;
}

const jpeg = (c: HTMLCanvasElement, q = 0.82) => c.toDataURL("image/jpeg", q);

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Navigateur trop ancien pour lire cette image.");
  return [c, ctx];
}

function tag(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number) {
  ctx.font = `600 ${size}px system-ui, sans-serif`;
  const w = ctx.measureText(text).width + size;
  ctx.fillStyle = "rgba(0,0,0,0.72)";
  ctx.fillRect(x, y, w, size * 1.6);
  ctx.fillStyle = "#fff";
  ctx.fillText(text, x + size / 2, y + size * 1.15);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image illisible."));
    img.src = src;
  });
}

function fit(w: number, h: number, max: number): [number, number] {
  const k = Math.min(1, max / Math.max(w, h));
  return [w * k, h * k];
}

async function prepareImage(file: File, id: string): Promise<PreparedAd> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const [w, h] = fit(img.naturalWidth, img.naturalHeight, 1200);
    const [c, ctx] = canvas(w, h);
    ctx.drawImage(img, 0, 0, w, h);
    tag(ctx, id, 8, 8, Math.max(14, Math.round(w / 40)));
    const [tw, th] = fit(img.naturalWidth, img.naturalHeight, 240);
    const [t, tctx] = canvas(tw, th);
    tctx.drawImage(img, 0, 0, tw, th);
    return { kind: "image", sheet: jpeg(c), thumb: jpeg(t, 0.7), seconds: null, ratio: ratioOf(img.naturalWidth, img.naturalHeight) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function once(el: HTMLMediaElement, ev: string, ms = 8000): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("Vidéo trop lente à lire : essayez un fichier MP4 plus court.")), ms);
    el.addEventListener(ev, () => (clearTimeout(t), resolve()), { once: true });
    el.addEventListener("error", () => (clearTimeout(t), reject(new Error("Vidéo illisible dans ce navigateur : essayez un MP4."))), { once: true });
  });
}

async function prepareVideo(file: File, id: string): Promise<PreparedAd> {
  const url = URL.createObjectURL(file);
  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.preload = "auto";
  v.src = url;
  try {
    await once(v, "loadeddata");
    const vw = v.videoWidth || 720;
    const vh = v.videoHeight || 1280;
    const times = frameTimes(v.duration);
    const cols = 3;
    const rows = Math.ceil(times.length / cols);
    const [tw, th] = fit(vw, vh, 400);
    const [c, ctx] = canvas(tw * cols, th * rows);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    let thumb = "";
    for (const [i, t] of times.entries()) {
      v.currentTime = t;
      await once(v, "seeked");
      const x = (i % cols) * tw;
      const y = Math.floor(i / cols) * th;
      ctx.drawImage(v, x, y, tw, th);
      tag(ctx, `${id} · ${t.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} s`, x + 6, y + 6, 15);
      if (i === 0) {
        const [pw, ph] = fit(vw, vh, 240);
        const [p, pctx] = canvas(pw, ph);
        pctx.drawImage(v, 0, 0, pw, ph);
        thumb = jpeg(p, 0.7);
      }
    }
    return { kind: "video", sheet: jpeg(c, 0.8), thumb, seconds: Number.isFinite(v.duration) ? v.duration : null, ratio: ratioOf(vw, vh) };
  } finally {
    v.removeAttribute("src");
    v.load();
    URL.revokeObjectURL(url);
  }
}

export async function prepareAd(file: File, id: string): Promise<PreparedAd> {
  if (file.type.startsWith("video/")) return prepareVideo(file, id);
  if (file.type.startsWith("image/")) return prepareImage(file, id);
  throw new Error("Choisissez une image ou une vidéo.");
}

/** A product photo of the shop (same origin), for Claude to check the ad shows the same product. */
export async function photoData(src: string, label: string): Promise<string | null> {
  try {
    const img = await loadImage(src);
    const [w, h] = fit(img.naturalWidth, img.naturalHeight, 800);
    const [c, ctx] = canvas(w, h);
    ctx.drawImage(img, 0, 0, w, h);
    tag(ctx, label, 8, 8, 16);
    return jpeg(c);
  } catch {
    return null;
  }
}
