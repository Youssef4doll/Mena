import "server-only";
import { checkHost } from "./media";
import { extractProductPage, type PageFinds } from "./web-product";

/** A page is read up to this size: a product's pictures and texts are in its first megabytes. */
const MAX_PAGE = 3 * 1024 * 1024;

export type PageRead = { url: string; ok: true; finds: PageFinds } | { url: string; ok: false; error: string };

/**
 * Another site's product page, read by the server for its pictures, video
 * and texts: the same address checks as a supplier's picture (no address of
 * the server's own network, redirects checked one by one), a short wait, a
 * size limit. A site that refuses robots (Amazon often does) says so.
 */
export async function readProductPage(raw: string): Promise<PageRead> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { url: raw, ok: false, error: "Adresse invalide." };
  }
  try {
    let res: Response | null = null;
    for (let hop = 0; hop < 5; hop++) {
      await checkHost(u);
      res = await fetch(u, {
        signal: AbortSignal.timeout(15_000),
        redirect: "manual",
        headers: { "user-agent": "Mozilla/5.0 (compatible; MenaShop/1.0; +product-pages)", accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5", "accept-language": "fr,en;q=0.8" },
      });
      const next = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
      if (!next) break;
      u = new URL(next, u);
      res = null;
    }
    if (!res) return { url: raw, ok: false, error: "Trop de redirections." };
    if (!res.ok) return { url: raw, ok: false, error: res.status === 403 || res.status === 503 || res.status === 429 ? "Le site refuse la lecture automatique : copiez les adresses des photos à la main." : `Page illisible (erreur ${res.status}).` };
    const type = (res.headers.get("content-type") ?? "").toLowerCase();
    if (type && !type.includes("html") && !type.includes("xml")) return { url: raw, ok: false, error: "Ce lien ne mène pas à une page." };
    const html = await readText(res, MAX_PAGE);
    return { url: u.toString(), ok: true, finds: extractProductPage(html, u.toString()) };
  } catch (e) {
    const msg = e instanceof Error && e.name === "TimeoutError" ? "Le site ne répond pas." : e instanceof Error ? e.message : "Page illisible.";
    return { url: raw, ok: false, error: msg };
  }
}

/** The page's first `max` bytes, as text: the rest is not waited for. */
async function readText(res: Response, max: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
    if (size >= max) {
      await reader.cancel().catch(() => {});
      break;
    }
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}
