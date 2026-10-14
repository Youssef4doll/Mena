import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_LANG, OTHER_LANG } from "@/i18n/lang";

/**
 * The main language (Arabic, see DEFAULT_LANG) is served at the root, the
 * other under its prefix; internally every page lives under app/[lang]. A
 * root URL is rewritten to /ar/..., and /ar/... typed by hand is redirected
 * to the root form, so each page has one URL.
 *
 * /admin gets an optimistic check only (no cookie → login page); every admin
 * page and action verifies the session itself.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/admin")) {
    if (pathname !== "/admin/connexion" && !request.cookies.has("mena_admin")) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin/connexion";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  const main = `/${DEFAULT_LANG}`;
  const other = `/${OTHER_LANG}`;
  if (pathname === main || pathname.startsWith(`${main}/`)) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.slice(3) || "/";
    // Temporary: the main language is a setting, and a permanent redirect would outlive a change of it.
    return NextResponse.redirect(url, 307);
  }
  if (pathname === other || pathname.startsWith(`${other}/`)) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = `${main}${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/((?!api|_next|favicon.ico|icon|apple-icon|robots.txt|sitemap.xml|manifest.webmanifest|.*\\..*).*)"],
};
