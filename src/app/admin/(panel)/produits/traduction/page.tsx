import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { translationReady } from "@/lib/translate";
import { needsTranslation } from "@/lib/translate-merge";
import { idsParam, storedTexts, textsSelect } from "@/lib/translate-batch";
import { TranslateBatch } from "./TranslateBatch";

export const metadata = { title: "Traduire en lot" };
// Each product translated with the API key is one action of this page, and can take a little while.
export const maxDuration = 120;

const MAX_SHOWN = 500;

/**
 * Every product with a text in one language only (or no search keywords),
 * newest first, or only those of "?ids=" (the products just imported).
 */
export default async function TranslateBatchPage({ searchParams }: PageProps<"/admin/produits/traduction">) {
  const sp = await searchParams;
  const ids = idsParam(sp.ids);
  const rows = await prisma.product.findMany({
    where: ids ? { id: { in: ids } } : {},
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, ...textsSelect },
  });
  const todo = rows.flatMap((p) => {
    const texts = storedTexts(p);
    return needsTranslation(texts) ? [{ id: p.id, name: p.name, texts }] : [];
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/admin/produits" className="inline-flex h-10 items-center text-sm text-muted">← Produits</Link>
        <h1 className="font-display text-[26px]">Traduire en lot</h1>
      </div>
      {ids && (
        <p className="flex flex-wrap items-center gap-x-1 text-sm text-muted">
          Produits choisis seulement.
          <Link href="/admin/produits/traduction" className="inline-flex min-h-10 items-center text-sea underline underline-offset-4">Voir tous les produits à traduire</Link>
        </p>
      )}
      {todo.length > MAX_SHOWN && (
        <p className="rounded-2xl bg-[#fff3d6] px-4 py-3 text-sm text-[#8a5a00]">
          {todo.length} produits ont des textes à traduire : voici les {MAX_SHOWN} plus récents. Revenez sur cette page ensuite pour les suivants.
        </p>
      )}
      <TranslateBatch products={todo.slice(0, MAX_SHOWN)} aiReady={translationReady()} chosen={ids != null} />
    </div>
  );
}
