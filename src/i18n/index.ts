import { fr, type Dict } from "./fr";
import { ar } from "./ar";

export const LOCALES = ["fr", "ar"] as const;
export type Lang = (typeof LOCALES)[number];

export function isLang(v: string): v is Lang {
  return (LOCALES as readonly string[]).includes(v);
}

export function dict(lang: Lang): Dict {
  return lang === "ar" ? ar : fr;
}

/** French lives at the root (/produit/x), Arabic under /ar (/ar/produit/x). */
export function href(lang: Lang, path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  if (lang === "fr") return p;
  return p === "/" ? "/ar" : `/ar${p}`;
}

/** The same page in the other language. */
export function switchHref(lang: Lang, pathname: string): string {
  const bare = pathname.replace(/^\/(ar|fr)(?=\/|$)/, "") || "/";
  return href(lang === "fr" ? "ar" : "fr", bare);
}

export function pick<T extends string | null | undefined>(lang: Lang, frText: string, arText: T): string {
  return lang === "ar" && arText ? arText : frText;
}

export type { Dict };
