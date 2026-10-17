import type { Prisma } from "@prisma/client";

/**
 * The product list's address and filters, kept apart from the page so links,
 * the database filters and the messages of the bulk actions can be tested
 * without a database.
 */

export const PAGE_SIZE = 100;
/** The bulk actions take at most this many products at once (five pages). */
export const MAX_BULK = 500;

const FILTERS = ["all", "active", "inactive", "out"] as const;
export type ListFilter = (typeof FILTERS)[number];
/** "c": "" every category, "none" products without one, otherwise a category id. */
export type ListParams = { f: ListFilter; q: string; c: string; page: number };
export const NO_CATEGORY = "none";

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : Array.isArray(v) ? (v[0] ?? "") : "");

/** Reads "?f=&q=&c=&page=" as typed by anyone: unknown values fall back to the whole list. */
export function readListParams(sp: Record<string, string | string[] | undefined>): ListParams {
  const f = one(sp.f);
  const n = Number.parseInt(one(sp.page), 10);
  return {
    f: (FILTERS as readonly string[]).includes(f) ? (f as ListFilter) : "all",
    q: one(sp.q).trim().slice(0, 100),
    c: one(sp.c).trim().slice(0, 40),
    page: Number.isFinite(n) && n >= 1 ? Math.min(n, 10_000) : 1,
  };
}

/** The list's address with some filters changed. Defaults are left out, so links stay short. */
export function listHref(p: ListParams, change: Partial<ListParams> = {}): string {
  const n = { ...p, ...change };
  const s = new URLSearchParams();
  if (n.f !== "all") s.set("f", n.f);
  if (n.q) s.set("q", n.q);
  if (n.c) s.set("c", n.c);
  if (n.page > 1) s.set("page", String(n.page));
  const qs = s.toString();
  return qs ? `/admin/produits?${qs}` : "/admin/produits";
}

/** Pages needed for this many products; one page even when there are none. */
export const pageCount = (total: number) => Math.max(1, Math.ceil(total / PAGE_SIZE));

/**
 * Sold out, exactly as stockState (src/lib/catalog.ts) says it, but as a
 * database filter: the tab and its count cover the whole catalog, not a page.
 * A sum of max(0, stock) is 0 only when every option has 0 or less.
 */
export const OUT_OF_STOCK: Prisma.ProductWhereInput = {
  OR: [
    { stockMode: "SUPPLIER", available: false },
    { stockMode: "SUPPLIER", variants: { some: {}, none: { available: true } } },
    { stockMode: "TRACKED", variants: { none: {} }, stockQty: { lte: 0 } },
    { stockMode: "TRACKED", variants: { some: {}, every: { stockQty: { lte: 0 } } } },
  ],
};

/**
 * The search and the category, shared by every tab and its count. "%" and "_"
 * are searched as typed (a ref like "AB_12"), not as the database's wildcards.
 */
export function listWhere(p: Pick<ListParams, "q" | "c">): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = {};
  if (p.q) {
    const has = { contains: p.q.replace(/[\\%_]/g, "\\$&"), mode: "insensitive" } as const;
    where.OR = [{ name: has }, { nameAr: has }, { slug: has }, { supplierRef: has }, { keywords: has }];
  }
  if (p.c === NO_CATEGORY) where.categoryId = null;
  else if (p.c) where.categoryId = p.c;
  return where;
}

/** The list for one tab: the search and category, plus the tab's own condition. */
export function tabWhere(p: ListParams): Prisma.ProductWhereInput {
  const base = listWhere(p);
  if (p.f === "active") return { ...base, active: true };
  if (p.f === "inactive") return { ...base, active: false };
  if (p.f === "out") return { AND: [base, OUT_OF_STOCK] };
  return base;
}

/** One change applied to many products at once. */
export type BulkPatch = { active: boolean } | { featured: boolean } | { available: boolean } | { categoryId: string | null };

const pl = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

/**
 * "12 produits mis en ligne": what a bulk action did, counted by the database.
 * `skipped`: products the change does not apply to (availability of a product
 * whose stock is counted), said as such rather than counted as done.
 */
export function bulkMessage(patch: BulkPatch | "delete", n: number, extra: { categoryName?: string; skipped?: number } = {}): string {
  let text: string;
  if (patch === "delete") text = `${pl(n, "produit supprimé", "produits supprimés")}.`;
  else if ("active" in patch) text = `${pl(n, "produit", "produits")} ${patch.active ? "mis en ligne" : "mis hors ligne"}.`;
  else if ("featured" in patch) text = `${pl(n, "produit", "produits")} ${patch.featured ? (n > 1 ? "ajoutés" : "ajouté") + " à la sélection" : (n > 1 ? "retirés" : "retiré") + " de la sélection"}.`;
  else if ("available" in patch) text = patch.available ? `${pl(n, "produit marqué disponible", "produits marqués disponibles")}.` : `${pl(n, "produit marqué indisponible", "produits marqués indisponibles")}.`;
  else text = patch.categoryId ? `${pl(n, "produit rangé", "produits rangés")} dans « ${extra.categoryName ?? "la catégorie"} ».` : `${pl(n, "produit", "produits")} sans catégorie.`;
  if (extra.skipped) text += ` ${pl(extra.skipped, "autre compte son stock : inchangé", "autres comptent leur stock : inchangés")}.`;
  return text;
}
