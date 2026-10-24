import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { daysAgo } from "@/lib/analytics-range";
import { stockState } from "@/lib/catalog";
import { Empty, PageTitle, Tabs, btn } from "@/components/admin/ui";
import { DemoBanner, ListFilters, PendingHint } from "./ProductListControls";
import { IntentLink } from "./IntentLink";
import { ProductRows, type ProductRow } from "./ProductRows";
import { OUT_OF_STOCK, PAGE_SIZE, listHref, listWhere, pageCount, readListParams, tabWhere } from "./list-params";

export const metadata = { title: "Produits" };

const rowSelect = {
  id: true, name: true, price: true, cost: true, active: true, featured: true, stockMode: true, stockQty: true, available: true, isDemo: true, categoryId: true,
  supplier: { select: { name: true } },
  images: { where: { kind: "GALLERY" }, take: 1, orderBy: { sort: "asc" }, select: { mediaId: true } },
  variants: { select: { stockQty: true, available: true } },
  _count: { select: { offers: true } },
} satisfies Prisma.ProductSelect;

/** Newest first, and a row stays where it is when one of its fields is edited. */
const pageOf = (where: Prisma.ProductWhereInput, page: number) =>
  prisma.product.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, select: rowSelect });

/**
 * Every product, 100 a page, filtered and counted by the database. One wait
 * for the page and its counts, one more for the views and sales of the rows
 * shown, however big the catalog.
 */
export default async function ProductsPage({ searchParams }: PageProps<"/admin/produits">) {
  const params = readListParams(await searchParams);
  const base = listWhere(params);
  const where = tabWhere(params);
  const [byActive, outCount, uncheckedCount, demoCount, untranslated, categories, firstTry] = await Promise.all([
    prisma.product.groupBy({ by: ["active"], where: base, _count: { _all: true } }),
    prisma.product.count({ where: { AND: [base, OUT_OF_STOCK] } }),
    prisma.product.count({ where: { ...base, active: true, checkedAt: null } }),
    prisma.product.count({ where: { isDemo: true } }),
    prisma.product.count({ where: { OR: [{ nameAr: null }, { nameAr: "" }] } }),
    prisma.category.findMany({ orderBy: [{ sort: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
    pageOf(where, params.page),
  ]);
  const online = byActive.find((g) => g.active)?._count._all ?? 0;
  const offline = byActive.find((g) => !g.active)?._count._all ?? 0;
  const total = { all: online + offline, active: online, inactive: offline, out: outCount, unchecked: uncheckedCount }[params.f];
  const pages = pageCount(total);
  // A page past the end (the last products of it were just deleted): the last page instead.
  const page = Math.min(params.page, pages);
  const products = page === params.page ? firstTry : await pageOf(where, page);

  const ids = products.map((p) => p.id);
  const since = daysAgo(30);
  const [views, sold] = ids.length
    ? await Promise.all([
        prisma.analyticsEvent.groupBy({ by: ["productId"], where: { name: "product_viewed", createdAt: { gte: since }, productId: { in: ids } }, _count: { _all: true } }),
        prisma.orderItem.groupBy({ by: ["productId"], where: { productId: { in: ids }, order: { createdAt: { gte: since }, status: { not: "CANCELLED" } } }, _sum: { qty: true } }),
      ])
    : [[], []];
  const v = new Map(views.map((x) => [x.productId, x._count._all]));
  const s = new Map(sold.map((x) => [x.productId, x._sum.qty ?? 0]));

  const rows: ProductRow[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    image: p.images[0]?.mediaId ?? null,
    price: p.price,
    offers: p._count.offers,
    margin: p.cost != null && p.price > 0 ? (p.price - p.cost) / p.price : null,
    categoryId: p.categoryId,
    supplier: p.supplier?.name ?? null,
    active: p.active,
    featured: p.featured,
    isDemo: p.isDemo,
    stockMode: p.stockMode,
    stockQty: p.stockQty,
    available: p.available,
    variants: p.variants.length,
    variantStock: p.variants.reduce((n, x) => n + Math.max(0, x.stockQty), 0),
    stock: stockState(p),
    views: v.get(p.id) ?? 0,
    sold: s.get(p.id) ?? 0,
  }));
  const filtered = params.q !== "" || params.c !== "";
  const found = online + offline;
  const tab = (f: typeof params.f) => listHref(params, { f, page: 1 });

  return (
    <>
      <PageTitle
        title="Produits"
        sub={`${found} ${found > 1 ? "produits" : "produit"}${filtered ? (found > 1 ? " trouvés" : " trouvé") : ""} · vues et ventes sur 30 jours.`}
        actions={
          <>
            <IntentLink href="/admin/produits/nouveau" className={btn.sea}>Nouveau produit</IntentLink>
            <Link href="/admin/produits/fournisseur" className={btn.ghost}>Depuis Ecomness</Link>
            <Link href="/admin/produits/import" className={btn.ghost}>Importer (CSV)</Link>
            {/* A file to save, not a page: the browser downloads it. */}
            <a href="/admin/produits/export" download className={btn.ghost}>Exporter (CSV)</a>
            <Link href="/admin/produits/traduction" className={btn.ghost} aria-label={untranslated > 0 ? `Traduire en lot : ${untranslated} produits sans nom arabe` : undefined}>
              Traduire en lot
              {untranslated > 0 && <span className="rounded-full bg-sand px-2 py-0.5 text-[11px] font-semibold tabular-nums text-ink-2" title="Produits sans nom arabe">{untranslated}</span>}
            </Link>
          </>
        }
      />
      {demoCount > 0 && <DemoBanner count={demoCount} />}
      <Tabs
        current={params.f}
        items={[
          { key: "all", label: "Tous", href: tab("all"), count: found },
          { key: "active", label: "En ligne", href: tab("active"), count: online },
          { key: "inactive", label: "Hors ligne", href: tab("inactive"), count: offline },
          { key: "out", label: "Épuisés", href: tab("out"), count: outCount },
          { key: "unchecked", label: "À vérifier", href: tab("unchecked"), count: uncheckedCount },
        ]}
      />
      <ListFilters params={params} categories={categories} />
      {rows.length === 0 ? (
        filtered || params.f !== "all" ? (
          <Empty>
            Aucun produit ne correspond.{" "}
            <Link href="/admin/produits" className="text-sea underline underline-offset-4">Voir tous les produits</Link>
          </Empty>
        ) : (
          <Empty>Aucun produit. Ajoutez le premier avec « Nouveau produit », ou plusieurs d&apos;un coup avec « Importer (CSV) ».</Empty>
        )
      ) : (
        <ProductRows key={listHref(params)} rows={rows} categories={categories} />
      )}
      {pages > 1 && (
        <nav aria-label="Pages" className="mt-4 flex flex-wrap items-center justify-between gap-2">
          {page > 1 ? (
            <Link href={listHref(params, { page: page - 1 })} className={btn.ghost} rel="prev">
              ← Précédente <PendingHint />
            </Link>
          ) : (
            <span />
          )}
          <span className="order-first basis-full text-center text-sm tabular-nums text-muted sm:order-none sm:basis-auto">
            Page {page} sur {pages} · {total} produit{total > 1 ? "s" : ""}
          </span>
          {page < pages ? (
            <Link href={listHref(params, { page: page + 1 })} className={btn.ghost} rel="next">
              Suivante → <PendingHint />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </>
  );
}
