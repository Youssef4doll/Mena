"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect } from "react";
import { useParams, usePathname } from "next/navigation";
import { DEFAULT_LANG, LOCALES, href, type Lang } from "@/i18n/lang";
import type { ProductCard } from "@/lib/catalog";
import { track } from "@/lib/client/track";

// The page-not-found boundary sits under every page: its product cards are fetched only when it shows.
const ProductRow = dynamic(() => import("@/components/shop/ProductCard").then((m) => m.ProductRow));

/** The missing page in the visitor's language, with the way back to that language's home and a few products. */
export function NotFoundBody({ copy, products }: { copy: Record<Lang, { title: string; back: string; others: string }>; products: ProductCard[] }) {
  // A not-found page may get no params: the address says the language too ("/fr/…").
  const p = useParams<{ lang?: string }>();
  const pathname = usePathname();
  const first = pathname?.split("/")[1];
  const lang: Lang = (LOCALES as readonly string[]).includes(p?.lang ?? "") ? (p.lang as Lang) : (LOCALES as readonly string[]).includes(first ?? "") ? (first as Lang) : DEFAULT_LANG;
  const t = copy[lang];
  // Counted with the visit's source: paid clicks landing on a removed product show up in the back office.
  useEffect(() => {
    track("not_found", { props: { path: pathname?.slice(0, 120) } });
  }, [pathname]);
  return (
    <>
      <div className="mx-auto flex max-w-md flex-col items-center justify-center gap-6 px-4 py-14 text-center">
        <h1 className="text-[28px] leading-tight">{t.title}</h1>
        <Link href={href(lang, "/")} className="inline-flex min-h-[52px] items-center rounded-full bg-ink px-7 text-[17px] font-bold text-white hover:bg-ink-2">
          {t.back}
        </Link>
      </div>
      {products.length >= 2 && (
        <section className="mx-auto max-w-6xl xl:max-w-7xl 2xl:max-w-[90rem] border-t border-line px-4 pt-8" aria-labelledby="nf-others">
          <h2 id="nf-others" className="mb-4 text-[20px] font-bold">
            {t.others}
          </h2>
          <ProductRow products={products} lang={lang} list="not_found" />
        </section>
      )}
    </>
  );
}
