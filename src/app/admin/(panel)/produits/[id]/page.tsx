import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ProductEditor } from "./ProductEditor";
import { getSettings } from "@/lib/settings";
import { SITE_URL } from "@/lib/site";
import { deliversEverywhere } from "@/lib/governorates";
import { translationReady } from "@/lib/translate";
import { productForForm, toInput } from "@/lib/product-write";

export const metadata = { title: "Produit" };
// A translation by Claude can take a little while.
export const maxDuration = 120;

export default async function ProductEditPage({ params }: PageProps<"/admin/produits/[id]">) {
  const { id } = await params;
  const isNew = id === "nouveau";
  const [p, categories, suppliers, settings] = await Promise.all([
    isNew ? null : prisma.product.findUnique({ where: { id }, select: { ...productForForm, images: { orderBy: { sort: "asc" }, select: { id: true, mediaId: true, alt: true, kind: true } } } }),
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
        initial={p ? toInput(p) : null}
      />
    </div>
  );
}
