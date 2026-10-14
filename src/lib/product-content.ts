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

export type Video = { kind: "youtube"; id: string } | { kind: "file"; src: string };

/** A YouTube link (watch, youtu.be, shorts, embed) or a direct https .mp4/.webm file; anything else is refused. */
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
  const host = u.hostname.replace(/^(www|m)\./, "");
  const id = (s: string | null | undefined) => (s && /^[A-Za-z0-9_-]{11}$/.test(s) ? s : null);
  if (host === "youtu.be") {
    const v = id(u.pathname.split("/")[1]);
    return v ? { kind: "youtube", id: v } : null;
  }
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const parts = u.pathname.split("/").filter(Boolean);
    const v = parts[0] === "watch" ? id(u.searchParams.get("v")) : ["shorts", "embed", "live"].includes(parts[0]) ? id(parts[1]) : null;
    return v ? { kind: "youtube", id: v } : null;
  }
  if (/\.(mp4|webm)$/i.test(u.pathname)) return { kind: "file", src: u.toString() };
  return null;
}

const SOLD_STEPS = [10, 20, 30, 50, 100, 200, 300, 500, 1000, 2000, 5000];

/** Orders in the last 30 days, rounded down to a step ("+20"); under 10, nothing is said. */
export function soldStep(orders: number): number | null {
  let step: number | null = null;
  for (const s of SOLD_STEPS) if (orders >= s) step = s;
  return step;
}
