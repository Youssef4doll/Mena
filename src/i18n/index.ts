import { fr, type Dict } from "./fr";
import { ar } from "./ar";

import { DEFAULT_LANG, LOCALES, OTHER_LANG, href, type Lang } from "./lang";

export { DEFAULT_LANG, LOCALES, OTHER_LANG, href, type Lang };

export function isLang(v: string): v is Lang {
  return (LOCALES as readonly string[]).includes(v);
}

export function dict(lang: Lang): Dict {
  return lang === "ar" ? ar : fr;
}

/** The same page in the other language. */
export function switchHref(lang: Lang, pathname: string): string {
  const bare = pathname.replace(/^\/(ar|fr)(?=\/|$)/, "") || "/";
  return href(lang === "fr" ? "ar" : "fr", bare);
}

/** hreflang alternates of a page, for metadata and the sitemap. */
export function languages(path: string, base = ""): Record<Lang, string> {
  return { fr: `${base}${href("fr", path)}`, ar: `${base}${href("ar", path)}` };
}

export function pick<T extends string | null | undefined>(lang: Lang, frText: string, arText: T): string {
  return lang === "ar" && arText ? arText : frText;
}

export type { Dict };
