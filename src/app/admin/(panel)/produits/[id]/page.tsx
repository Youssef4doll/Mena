import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ProductEditor } from "./ProductEditor";
import { LeaveLink } from "./LeaveLink";
import { getSettings } from "@/lib/settings";
import { SITE_URL } from "@/lib/site";
import { deliversEverywhere } from "@/lib/governorates";
import { translationReady } from "@/lib/translate";
import { productForForm, toInput } from "@/lib/product-write";

export const metadata = { title: "Produit" };
// A translation by Claude can take a little while.
export const maxDuration = 120;

/** "← Précédent" / "Suivant →": loaded as soon as the pointer rests on it, so it opens at once. */
function Step({ to, children }: { to: string | null; children: React.ReactNode }) {
  const cls = "flex h-10 items-center rounded-full px-3 text-sm";
  if (!to) return <span aria-disabled="true" className={`${cls} text-muted/50`}>{children}</span>;
  return <LeaveLink href={`/admin/produits/${to}`} intent className={`${cls} text-sea hover:bg-sea-soft`}>{children}</LeaveLink>;
}

export default async function ProductEditPage({ params }: PageProps<"/admin/produits/[id]">) {
  const { id } = await params;
  const isNew = id === "nouveau";
  const [p, categories, suppliers, settings, order] = await Promise.all([
    isNew ? null : prisma.product.findUnique({ where: { id }, select: { ...productForForm, images: { orderBy: { sort: "asc" }, select: { id: true, mediaId: true, alt: true, kind: true, sort: true } } } }),
    prisma.category.findMany({ orderBy: [{ sort: "asc" }, { name: "asc" }], select: { id: true, name: true, nameAr: true } }),
    prisma.supplier.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    getSettings(),
    // The products before and after this one in the list's order (newest first), worked out by the database: two ids, not the catalog.
    isNew
      ? []
      : prisma.$queryRaw<{ prev: string | null; next: string | null }[]>`
          SELECT prev, next FROM (
            SELECT id, LAG(id) OVER w AS prev, LEAD(id) OVER w AS next
            FROM "Product" WINDOW w AS (ORDER BY "createdAt" DESC, id DESC)
          ) t WHERE id = ${id}`,
  ]);
  if (!isNew && !p) notFound();
  const prev = order[0]?.prev ?? null;
  const next = order[0]?.next ?? null;
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="flex items-center justify-between gap-2">
          <LeaveLink href="/admin/produits" className="-ms-1 flex h-10 items-center px-1 text-sm text-muted">← Produits</LeaveLink>
          {!isNew && (
            <nav aria-label="Autres produits" className="-me-3 flex items-center">
              <Step to={prev}>← Précédent</Step>
              <Step to={next}>Suivant →</Step>
            </nav>
          )}
        </div>
        <div className="flex min-h-10 flex-wrap items-center gap-x-3">
          <h1 className="min-w-0 break-words font-display text-[26px] leading-tight">{p ? p.name : "Nouveau produit"}</h1>
          {p?.active && (
            <a href={`/produit/${p.slug}`} target="_blank" className="flex h-10 items-center text-sm text-sea underline">Voir sur la boutique</a>
          )}
        </div>
      </div>
      <ProductEditor
        // Every save bumps updatedAt: the form remounts from the saved rows (new offers keep their ids).
        version={p ? `${p.id}:${p.updatedAt.getTime()}` : "new"}
        id={p?.id ?? null}
        nextId={next}
        categories={categories}
        shopName={settings.shop.name}
        everywhere={deliversEverywhere(settings.delivery.zones)}
        shipping={{ fee: settings.delivery.fee, carrier: settings.costs.carrierPerParcel }}
        aiReady={translationReady()}
        videoReady={Boolean(process.env.BLOB_READ_WRITE_TOKEN)}
        siteUrl={SITE_URL}
        oldSlugs={p?.oldSlugs ?? []}
        suppliers={suppliers}
        images={p?.images.map((i) => ({ id: i.id, mediaId: i.mediaId, alt: i.alt ?? "", kind: i.kind, sort: i.sort })) ?? []}
        initial={p ? toInput(p) : null}
      />
    </div>
  );
}
