"use client";

import { pick, type Lang } from "@/i18n";
import type { ProductPage } from "@/lib/catalog";
import type { PublicSettings } from "@/lib/settings-schema";
import { BuyBox, type BuyChoice } from "./BuyBox";
import type { OrderDraft } from "./OrderForm";
import { Sheet } from "./Sheet";

type P = Omit<ProductPage, "related">;

/**
 * The product page's own form, over the page, for a reader who went on past
 * it (the long pictures, the text, the questions): the form comes to them
 * instead of the page going back up. The page's choice (offer, option,
 * quantity) and what was already typed are the same here: nothing to load,
 * nothing to type twice. Closed, it leaves the reader where they were.
 */
export function OrderSheet({ p, lang, settings, url, choice, draft, onClose }: { p: P; lang: Lang; settings: PublicSettings; url: string; choice: BuyChoice; draft: OrderDraft; onClose: () => void }) {
  return (
    <Sheet lang={lang} titleId="os-title" title={pick(lang, p.name, p.nameAr)} image={p.images[0]?.id ?? null} onClose={onClose}>
      {/* "Ajouter au panier" closes the sheet: the confirmation takes its place (and its history entry). */}
      {(dismiss) => <BuyBox p={p} lang={lang} settings={settings} url={url} choice={choice} idp="os" origin="sheet" draft={draft} onAdded={dismiss} />}
    </Sheet>
  );
}
