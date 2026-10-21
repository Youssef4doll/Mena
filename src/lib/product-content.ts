/**
 * The product page's extra content, read the same way on the server and in
 * the browser: the specs table typed one line at a time, the video link, and
 * the "+20 commandes" line, which is a rounded-down fact or nothing.
 */

export type Spec = { label: string; value: string };

/**
 * "Matière : inox" → { label: "Matière", value: "inox" }. A line without a
 * colon is kept as a plain point (label ""). Empty lines are dropped.
 */
export function parseSpecs(text: string | null | undefined): Spec[] {
  return (text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[-•*·]\s*/, ""))
    .filter(Boolean)
    .slice(0, 40)
    .map((line) => {
      const i = line.search(/\s*[:：]\s*/);
      if (i <= 0) return { label: "", value: line };
      const label = line.slice(0, i).trim();
      const value = line.slice(i).replace(/^\s*[:：]\s*/, "").trim();
      return value ? { label, value } : { label: "", value: label };
    });
}

export type Video =
  | { kind: "youtube"; id: string }
  /** Another platform's player, built from the video's own id (never from the link as typed). */
  | { kind: "embed"; provider: "vimeo" | "tiktok" | "instagram" | "facebook"; src: string; vertical: boolean }
  | { kind: "file"; src: string }
  /** A streamed video (.m3u8), such as the one on an Amazon listing. */
  | { kind: "hls"; src: string };

/**
 * A product video: a YouTube, Vimeo, TikTok, Instagram or Facebook link, or a
 * direct https video file (.mp4, .webm, .mov), such as one sent from the
 * computer, or a stream (.m3u8, the format of Amazon's product videos). Anything else is refused. Short share links (vm.tiktok.com,
 * fb.watch) are refused too: they hide the video's id behind a redirect.
 */
export function parseVideo(url: string | null | undefined): Video | null {
  const raw = (url ?? "").trim();
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  const host = u.hostname.replace(/^(www|m|web)\./, "");
  const parts = u.pathname.split("/").filter(Boolean);
  const id = (s: string | null | undefined) => (s && /^[A-Za-z0-9_-]{11}$/.test(s) ? s : null);
  const digits = (s: string | null | undefined) => (s && /^\d{5,25}$/.test(s) ? s : null);
  /** The part right after a word of the path ("video" → its id), or null when the word is not there. */
  const after = (word: string) => {
    const i = parts.indexOf(word);
    return i >= 0 ? (parts[i + 1] ?? null) : null;
  };
  if (host === "youtu.be") {
    const v = id(parts[0]);
    return v ? { kind: "youtube", id: v } : null;
  }
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const v = parts[0] === "watch" ? id(u.searchParams.get("v")) : ["shorts", "embed", "live"].includes(parts[0]) ? id(parts[1]) : null;
    return v ? { kind: "youtube", id: v } : null;
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const v = digits(parts[0] === "video" ? parts[1] : parts.find((x) => /^\d+$/.test(x)));
    return v ? { kind: "embed", provider: "vimeo", src: `https://player.vimeo.com/video/${v}?autoplay=1&playsinline=1&title=0&byline=0`, vertical: false } : null;
  }
  if (host === "tiktok.com") {
    // tiktok.com/@shop/video/7301234567890123456, or its player link.
    const v = digits(parts[0] === "player" ? parts[2] : after("video"));
    return v ? { kind: "embed", provider: "tiktok", src: `https://www.tiktok.com/player/v1/${v}?autoplay=1&music_info=0&description=0&rel=0`, vertical: true } : null;
  }
  if (host === "instagram.com") {
    // instagram.com/reel/C1a2b3c4d5e/ or /p/C1a2b3c4d5e/
    const at = parts.findIndex((x) => x === "reel" || x === "reels" || x === "p" || x === "tv");
    const code = at >= 0 && /^[A-Za-z0-9_-]{5,40}$/.test(parts[at + 1] ?? "") ? parts[at + 1] : null;
    const kind = parts[at] === "p" ? "p" : "reel";
    return code ? { kind: "embed", provider: "instagram", src: `https://www.instagram.com/${kind}/${code}/embed`, vertical: true } : null;
  }
  if (host === "facebook.com") {
    // facebook.com/<page>/videos/<id>, /reel/<id>, /watch/?v=<id>: rebuilt from the id alone.
    const v = digits(parts[0] === "reel" ? parts[1] : parts[0] === "watch" ? u.searchParams.get("v") : after("videos"));
    if (!v) return null;
    const page = parts[0] === "reel" ? `https://www.facebook.com/reel/${v}` : `https://www.facebook.com/watch/?v=${v}`;
    return { kind: "embed", provider: "facebook", src: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(page)}&show_text=false&autoplay=true`, vertical: parts[0] === "reel" };
  }
  if (/\.(mp4|webm|mov)$/i.test(u.pathname)) return { kind: "file", src: u.toString() };
  if (/\.m3u8$/i.test(u.pathname)) return { kind: "hls", src: u.toString() };
  return null;
}

const SOLD_STEPS = [10, 20, 30, 50, 100, 200, 300, 500, 1000, 2000, 5000];

/** Orders in the last 30 days, rounded down to a step ("+20"); under 10, nothing is said. */
export function soldStep(orders: number): number | null {
  let step: number | null = null;
  for (const s of SOLD_STEPS) if (orders >= s) step = s;
  return step;
}
