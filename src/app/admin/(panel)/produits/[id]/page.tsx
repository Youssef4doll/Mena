import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ProductEditor } from "./ProductEditor";
import { getSettings } from "@/lib/settings";
import { SITE_URL } from "@/lib/site";
import { deliversEverywhere } from "@/lib/governorates";
import { translationReady } from "@/lib/translate";

export const metadata = { title: "Produit" };
// A translation by Claude can take a little while.
export const maxDuration = 120;

export default async function ProductEditPage({ params }: PageProps<"/admin/produits/[id]">) {
  const { id } = await params;
  const isNew = id === "nouveau";
  const [p, categories, suppliers, settings] = await Promise.all([
    isNew ? null : prisma.product.findUnique({ where: { id }, include: { images: { orderBy: { sort: "asc" } }, variants: { orderBy: { sort: "asc" } }, offers: { orderBy: { sort: "asc" } } } }),
    prisma.category.findMany({ orderBy: [{ sort: "asc" }, { name: "asc" }], select: { id: true, name: true, nameAr: true } }),
    prisma.supplier.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    getSettings(),
  ]);
  if (!isNew && !p) notFound();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/admin/produits" className="text-sm text-muted">← Produits</Link>
        <h1 className="font-display text-[26px]">{p ? p.name : "Nouveau produit"}</h1>
        {p?.active && (
          <a href={`/produit/${p.slug}`} target="_blank" className="text-sm text-sea underline">Voir sur la boutique</a>
        )}
      </div>
      <ProductEditor
        // Every save bumps updatedAt: the form remounts from the saved rows (new offers keep their ids).
        version={p ? `${p.id}:${p.updatedAt.getTime()}` : "new"}
        id={p?.id ?? null}
        categories={categories}
        shopName={settings.shop.name}
        everywhere={deliversEverywhere(settings.delivery.zones)}
        shipping={{ fee: settings.delivery.fee, carrier: settings.costs.carrierPerParcel }}
        aiReady={translationReady()}
        siteUrl={SITE_URL}
        oldSlugs={p?.oldSlugs ?? []}
        suppliers={suppliers}
        images={p?.images.map((i) => ({ id: i.id, mediaId: i.mediaId, alt: i.alt ?? "", kind: i.kind, width: 0, height: 0 })) ?? []}
        initial={
          p
            ? {
                name: p.name, nameAr: p.nameAr ?? "", slug: p.slug, summary: p.summary, summaryAr: p.summaryAr ?? "", description: p.description, descriptionAr: p.descriptionAr ?? "",
                specs: p.specs, specsAr: p.specsAr ?? "", videoUrl: p.videoUrl ?? "",
                keywords: p.keywords, seoTitle: p.seoTitle, seoTitleAr: p.seoTitleAr ?? "", seoDescription: p.seoDescription, seoDescriptionAr: p.seoDescriptionAr ?? "",
                price: p.price, compareAt: p.compareAt, cost: p.cost, categoryId: p.categoryId, supplierId: p.supplierId,
                supplierRef: p.supplierRef ?? "", supplierUrl: p.supplierUrl ?? "", stockMode: p.stockMode, stockQty: p.stockQty,
                available: p.available, active: p.active, featured: p.featured,
                variants: p.variants.map((v) => ({ id: v.id, name: v.name, nameAr: v.nameAr ?? "", sku: v.sku ?? "", price: v.price, stockQty: v.stockQty, available: v.available })),
                offers: p.offers.map((o) => ({
                  id: o.id, label: o.label, labelAr: o.labelAr ?? "", quantity: o.quantity, price: o.price, freeDelivery: o.freeDelivery, active: o.active,
                  // Stored as midnight in Tunis after the last day; shown as that last day.
                  endsOn: o.endsAt ? new Date(o.endsAt.getTime() - 23 * 3_600_000).toISOString().slice(0, 10) : "",
                })),
              }
            : null
        }
      />
    </div>
  );
}
