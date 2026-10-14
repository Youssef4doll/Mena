import { NextResponse, type NextRequest } from "next/server";
import { orderIdFromToken, rememberOrder } from "@/lib/order-access";
import { href, isLang } from "@/i18n";

/**
 * The link sent by SMS. It sets the access cookie and redirects at once, so
 * the secret never stays in the address bar of a page where pixels run.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/[lang]/suivi/t/[token]">) {
  const { lang, token } = await ctx.params;
  const to = (path: string) => href(isLang(lang) ? lang : "ar", path);
  const o = await orderIdFromToken(token);
  const url = request.nextUrl.clone();
  url.search = "";
  if (!o) {
    url.pathname = to("/suivi");
    return NextResponse.redirect(url);
  }
  await rememberOrder(token);
  url.pathname = to(`/suivi/${o.ref}`);
  const keep = ["avis", "paiement"].filter((k) => request.nextUrl.searchParams.has(k));
  for (const k of keep) url.searchParams.set(k, request.nextUrl.searchParams.get(k)!);
  const res = NextResponse.redirect(url);
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}
