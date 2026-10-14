import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { daysAgo } from "@/lib/analytics-range";
import { formatTND } from "@/lib/money";
import { stockState } from "@/lib/catalog";
import { Badge, Empty, PageTitle, Tabs, btn, input } from "@/components/admin/ui";
import { DemoBanner, ActiveToggle } from "./ProductListControls";

export const metadata = { title: "Produits" };

export default async function ProductsPage({ searchParams }: PageProps<"/admin/produits">) {
  const sp = await searchParams;
  const filter = typeof sp.f === "string" ? sp.f : "all";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const where: Prisma.ProductWhereInput = {
    ...(filter === "active" ? { active: true } : filter === "inactive" ? { active: false } : {}),
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { supplierRef: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const since = daysAgo(30);
  const [products, demoCount, views, sold] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: [{ active: "desc" }, { createdAt: "desc" }],
      take: 300,
      select: {
        id: true, name: true, price: true, cost: true, active: true, featured: true, stockMode: true, stockQty: true, available: true, isDemo: true,
        category: { select: { name: true } }, supplier: { select: { name: true } },
        images: { where: { kind: "GALLERY" }, take: 1, orderBy: { sort: "asc" }, select: { mediaId: true } },
        variants: { select: { stockQty: true, available: true } },
      },
    }),
    prisma.product.count({ where: { isDemo: true } }),
    prisma.analyticsEvent.groupBy({ by: ["productId"], where: { name: "product_viewed", createdAt: { gte: since }, productId: { not: null } }, _count: { _all: true } }),
    prisma.orderItem.groupBy({ by: ["productId"], where: { productId: { not: null }, order: { createdAt: { gte: since }, status: { not: "CANCELLED" } } }, _sum: { qty: true } }),
  ]);
  const v = new Map(views.map((x) => [x.productId, x._count._all]));
  const s = new Map(sold.map((x) => [x.productId, x._sum.qty ?? 0]));
  const out = products.filter((p) => stockState(p).kind === "out");
  const list = filter === "out" ? out : products;

  return (
    <>
      <PageTitle title="Produits" sub="Vues et ventes sur 30 jours." actions={<Link href="/admin/produits/nouveau" className={btn.sea}>Nouveau produit</Link>} />
      {demoCount > 0 && <DemoBanner count={demoCount} />}
      <Tabs
        current={filter}
        items={[
          { key: "all", label: "Tous", href: "/admin/produits" },
          { key: "active", label: "En ligne", href: "/admin/produits?f=active" },
          { key: "inactive", label: "Hors ligne", href: "/admin/produits?f=inactive" },
          { key: "out", label: "Épuisés", href: "/admin/produits?f=out", count: out.length },
        ]}
      />
      <form className="mb-4 flex gap-2" action="/admin/produits">
        <input type="hidden" name="f" value={filter} />
        <input name="q" defaultValue={q} placeholder="Nom ou réf. fournisseur" className={input} />
        <button className={btn.primary}>Chercher</button>
      </form>
      {list.length === 0 ? (
        <Empty>Aucun produit. Ajoutez le premier avec « Nouveau produit ».</Empty>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
          {list.map((p) => {
            const st = stockState(p);
            const views30 = v.get(p.id) ?? 0;
            const sold30 = s.get(p.id) ?? 0;
            const margin = p.cost != null && p.price > 0 ? (p.price - p.cost) / p.price : null;
            return (
              <li key={p.id} className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
                <Link href={`/admin/produits/${p.id}`} className="relative h-14 w-12 shrink-0 overflow-hidden rounded-lg bg-sand">
                  {p.images[0] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/img/${p.images[0].mediaId}/128`} alt="" className="h-full w-full object-cover" />
                  )}
                </Link>
                <Link href={`/admin/produits/${p.id}`} className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{p.name}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                    <span className="tabular-nums">{formatTND(p.price)}</span>
                    {margin != null && <span>· marge {Math.round(margin * 100)} %</span>}
                    {p.category && <span>· {p.category.name}</span>}
                    {p.supplier && <span>· {p.supplier.name}</span>}
                  </span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    {st.kind === "out" ? <Badge tone="danger">Épuisé</Badge> : st.kind === "low" ? <Badge tone="warn">Stock {st.qty}</Badge> : <Badge tone="ok">{p.stockMode === "TRACKED" ? "En stock" : "Dispo fournisseur"}</Badge>}
                    {p.featured && <Badge tone="info">Sélection</Badge>}
                    {p.isDemo && <Badge>Démo</Badge>}
                    <Badge>{views30} vues · {sold30} vendus</Badge>
                    {views30 >= 30 && sold30 === 0 && <Badge tone="warn">Vu sans être acheté</Badge>}
                  </span>
                </Link>
                <ActiveToggle id={p.id} active={p.active} />
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
