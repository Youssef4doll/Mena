import { jsonPost, limiter, send, SessionExpired } from "@/lib/client/import-run";

/**
 * Pictures sent from the editor through the product's images route, several
 * at a time: Server Actions would go one by one. Kept apart from the editor
 * so the order and the messages can be tested without a browser.
 */

export type Kind = "GALLERY" | "DETAIL";
/** A picture on its way to a product: a file from the device, or the address of one on the web. */
export type Outgoing = { kind: Kind; file: File } | { kind: Kind; url: string };

export type SendResult = { added: number; skipped: number; errors: string[]; expired: boolean };

export type Deps = {
  fetch: typeof fetch;
  shrink: (file: File, maxH: number) => Promise<File>;
  wait?: (ms: number) => Promise<void>;
};

export const AT_ONCE = 3;

/** Tallest picture sent, per kind: the description images may be very long. */
const MAX_H: Record<Kind, number> = { GALLERY: 3200, DETAIL: 16_000 };

/** The web addresses pasted in a field, one or several separated by spaces; null when something else is in it. */
export function linksIn(text: string): string[] | null {
  const parts = text.split(/\s+/).filter(Boolean);
  return parts.length > 0 && parts.every((s) => /^https?:\/\/\S+$/i.test(s)) ? parts : null;
}

/**
 * What a picture is called in a message: its file name, or the site and the
 * end of its address ("drive.google.com/…/view" says more than "view").
 */
export function pictureName(o: Outgoing): string {
  if ("file" in o) return o.file.name;
  let name = o.url;
  try {
    const u = new URL(o.url);
    const host = u.hostname.replace(/^www\./, "");
    const parts = u.pathname.split("/").filter(Boolean);
    const tail = parts.length ? decodeURIComponent(parts[parts.length - 1]) : "";
    name = !tail ? host : `${host}/${parts.length > 1 ? "…/" : ""}${tail}`;
  } catch {}
  return name.length > 40 ? `${name.slice(0, 39)}…` : name;
}

async function requestFor(item: Outgoing, sort: number, deps: Deps): Promise<RequestInit> {
  if ("url" in item) return jsonPost({ url: item.url, kind: item.kind, sort });
  const form = new FormData();
  form.append("file", await deps.shrink(item.file, MAX_H[item.kind]));
  form.append("kind", item.kind);
  form.append("sort", String(sort));
  // The name and size of the file as chosen: the same photo sent again is recognised, whatever the shrinking gives.
  form.append("source", `file:${item.file.name}:${item.file.size}`);
  return { method: "POST", body: form, cache: "no-store" };
}

/**
 * Sends the pictures, three at a time. Each asks for its own place, the
 * first free place of its kind (`after`) plus its rank among the pictures
 * of that kind, so the order chosen is kept whatever answer comes first.
 * Errors are listed in the order of the pictures, each with the picture's
 * name when several were sent. Once the session has expired, the pictures
 * not sent yet are not tried.
 */
export async function sendPictures(
  productId: string,
  items: Outgoing[],
  after: Record<Kind, number>,
  onProgress: (done: number, total: number) => void,
  deps: Deps,
): Promise<SendResult> {
  const slot = limiter(AT_ONCE);
  const rank: Record<Kind, number> = { GALLERY: 0, DETAIL: 0 };
  const errors: (string | null)[] = items.map(() => null);
  const out: SendResult = { added: 0, skipped: 0, errors: [], expired: false };
  let done = 0;
  onProgress(0, items.length);
  await Promise.all(
    items.map((item, i) => {
      const sort = after[item.kind] + rank[item.kind]++;
      return slot(async () => {
        if (out.expired) return;
        try {
          const r = await send(deps, `/admin/produits/${productId}/images`, await requestFor(item, sort, deps));
          if (!r.ok) errors[i] = items.length > 1 ? `${pictureName(item)} : ${r.error}` : r.error;
          else if (r.skipped === true) out.skipped++;
          else out.added++;
        } catch (e) {
          if (!(e instanceof SessionExpired)) throw e;
          out.expired = true;
        }
        onProgress(++done, items.length);
      });
    }),
  );
  out.errors = errors.filter((e): e is string => e != null);
  return out;
}
