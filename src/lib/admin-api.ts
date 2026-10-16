import "server-only";
import { currentAdmin } from "./admin-auth";
import { json } from "./http";

/**
 * The check every back-office route handler starts with. Writes must come
 * from the shop's own pages (the browser always sends Origin on a POST), and
 * from a signed-in admin. Returns the response to send when refused, or null.
 */
export async function refuseUnlessAdmin(request: Request): Promise<Response | null> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    const origin = request.headers.get("origin");
    let ok = false;
    try {
      const host = origin ? new URL(origin).host : null;
      ok = host != null && (host === new URL(request.url).host || host === request.headers.get("host") || host === request.headers.get("x-forwarded-host"));
    } catch {}
    if (!ok) return json({ ok: false, error: "Requête refusée." }, 403);
  }
  if (!(await currentAdmin())) return json({ ok: false, error: "Session expirée : reconnectez-vous." }, 401);
  return null;
}
