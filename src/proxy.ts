import { NextResponse, type NextRequest } from "next/server";

/**
 * French is served at the root and Arabic under /ar; internally every page
 * lives under app/[lang]. A French URL is rewritten to /fr/..., and /fr/...
 * typed by hand is redirected to the root form, so each page has one URL.
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

  if (pathname === "/fr" || pathname.startsWith("/fr/")) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.slice(3) || "/";
    return NextResponse.redirect(url, 308);
  }
  if (pathname === "/ar" || pathname.startsWith("/ar/")) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = `/fr${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/((?!api|_next|favicon.ico|icon|apple-icon|robots.txt|sitemap.xml|manifest.webmanifest|.*\\..*).*)"],
};
