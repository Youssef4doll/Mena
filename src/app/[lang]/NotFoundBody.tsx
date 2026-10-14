"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { DEFAULT_LANG, LOCALES, href, type Lang } from "@/i18n/lang";

/** The missing page in the visitor's language, with the way back to that language's home. */
export function NotFoundBody({ copy }: { copy: Record<Lang, { title: string; back: string }> }) {
  // A not-found page may get no params: the address says the language too ("/fr/…").
  const p = useParams<{ lang?: string }>();
  const first = usePathname()?.split("/")[1];
  const lang: Lang = (LOCALES as readonly string[]).includes(p?.lang ?? "") ? (p.lang as Lang) : (LOCALES as readonly string[]).includes(first ?? "") ? (first as Lang) : DEFAULT_LANG;
  const t = copy[lang];
  return (
    <div className="mx-auto flex min-h-[55vh] max-w-md flex-col items-center justify-center gap-6 px-4 py-16 text-center">
      <h1 className="text-[28px] leading-tight">{t.title}</h1>
      <Link href={href(lang, "/")} className="inline-flex min-h-[52px] items-center rounded-full bg-ink px-7 text-[17px] font-bold text-white hover:bg-ink-2">
        {t.back}
      </Link>
    </div>
  );
}
