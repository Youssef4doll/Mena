/** Device class from the User-Agent, read on the server (the browser's own claim is not used). */
export function deviceFromUA(ua: string | null | undefined): "mobile" | "tablet" | "desktop" {
  const s = (ua ?? "").toLowerCase();
  if (/ipad|tablet|kindle|silk|(android(?!.*mobile))/.test(s)) return "tablet";
  if (/mobi|iphone|ipod|android|blackberry|opera mini|iemobile/.test(s)) return "mobile";
  return "desktop";
}

const BOT = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|whatsapp|telegram|curl|wget|python|go-http|axios|node-fetch|playwright/i;

/** Crawlers and link previewers are not visitors. */
export function isBot(ua: string | null | undefined): boolean {
  if (!ua) return true;
  return BOT.test(ua);
}
