/**
 * The shop's languages, kept apart from the dictionaries so the proxy can
 * read them without loading every sentence of the shop.
 *
 * The main language is served at the root, the other one under its prefix.
 * Arabic unless NEXT_PUBLIC_DEFAULT_LANG=fr (read at build time, by the proxy
 * and by every link alike).
 */
export const LOCALES = ["fr", "ar"] as const;
export type Lang = (typeof LOCALES)[number];

export const DEFAULT_LANG: Lang = process.env.NEXT_PUBLIC_DEFAULT_LANG === "fr" ? "fr" : "ar";
export const OTHER_LANG: Lang = DEFAULT_LANG === "ar" ? "fr" : "ar";

/** The main language lives at the root (/produit/x), the other one under its prefix (/fr/produit/x). */
export function href(lang: Lang, path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  if (lang === DEFAULT_LANG) return p;
  return p === "/" ? `/${lang}` : `/${lang}${p}`;
}

/** An order's own language ("fr" or "ar"), for the links sent to that customer. */
export const orderLang = (locale: string | null | undefined): Lang => (locale === "fr" ? "fr" : "ar");
