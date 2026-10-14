"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { dict, type Lang } from "@/i18n";
import { track } from "@/lib/client/track";
import { loadQuick } from "@/lib/client/quick";

// The form's code is only downloaded when someone wants to order, so lists stay light.
const QuickSheet = dynamic(() => import("./QuickSheet").then((m) => m.QuickSheet), { ssr: false });
const preload = () => void import("./QuickSheet");

/**
 * "Acheter maintenant" on a product card: the order form opens over the list,
 * in a sheet, without leaving the page. Same form, same checks as the
 * product page.
 */
export function QuickBuy({ slug, productId, lang }: { slug: string; productId: string; lang: Lang }) {
  const t = dict(lang);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onPointerDown={() => {
          void loadQuick(slug);
          preload();
        }}
        onClick={() => {
          setOpen(true);
          track("quick_buy_opened", { productId });
        }}
        className="flex min-h-11 w-full items-center justify-center rounded-full bg-buy px-3 text-[15px] font-bold whitespace-nowrap text-night transition [--focus-ring:var(--color-night)] hover:bg-buy-2 active:scale-[.98]"
        aria-haspopup="dialog"
        aria-label={t.product.buyNow}
      >
        {t.product.buyShort}
      </button>
      {open && <QuickSheet slug={slug} lang={lang} onClose={() => setOpen(false)} />}
    </>
  );
}
