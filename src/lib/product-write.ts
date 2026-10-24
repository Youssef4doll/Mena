import "server-only";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { slugify } from "./slug";
import { parseVideo } from "./product-content";
import { offerLabelProblem } from "./offer-label";

/**
 * Saving a product, shared by the editor, the CSV import and the copy of a
 * product. Every check lives here, so a row from a CSV file goes through
 * exactly what the form goes through.
 */

const variant = z.object({
  id: z.string().max(40).optional(),
  name: z.string().trim().min(1).max(60),
  nameAr: z.string().trim().max(60).optional(),
  /** "#1f2937", shown as a dot beside the name in the shop. Empty: no colour. */
  colorHex: z.string().trim().regex(/^(#[0-9a-fA-F]{6})?$/).optional(),
  sku: z.string().trim().max(60).optional(),
  price: z.number().int().min(0).nullable(),
  stockQty: z.number().int().min(0).max(1_000_000),
  available: z.boolean(),
});

const offer = z.object({
  id: z.string().max(40).optional(),
  label: z.string().trim().min(2).max(80),
  labelAr: z.string().trim().max(80),
  quantity: z.number().int().min(1).max(50),
  price: z.number().int().min(1).max(100_000_000),
  freeDelivery: z.boolean(),
  /** YYYY-MM-DD, the last day the offer can be bought; empty = no end. */
  endsOn: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]),
  active: z.boolean(),
});

export const productSchema = z.object({
  name: z.string().trim().min(2).max(140),
  nameAr: z.string().trim().max(140),
  slug: z.string().trim().max(140),
  summary: z.string().trim().max(300),
  summaryAr: z.string().trim().max(300),
  description: z.string().max(8000),
  descriptionAr: z.string().max(8000),
  specs: z.string().max(4000),
  specsAr: z.string().max(4000),
  videoUrl: z.string().trim().max(500),
  keywords: z.string().max(1000),
  seoTitle: z.string().trim().max(120),
  seoTitleAr: z.string().trim().max(120),
  seoDescription: z.string().trim().max(320),
  seoDescriptionAr: z.string().trim().max(320),
  price: z.number().int().min(0).max(100_000_000),
  compareAt: z.number().int().min(0).nullable(),
  cost: z.number().int().min(0).nullable(),
  categoryId: z.string().max(40).nullable(),
  supplierId: z.string().max(40).nullable(),
  supplierRef: z.string().trim().max(120),
  supplierUrl: z.union([z.literal(""), z.url().max(500)]),
  stockMode: z.enum(["TRACKED", "SUPPLIER"]),
  stockQty: z.number().int().min(0).max(1_000_000),
  available: z.boolean(),
  active: z.boolean(),
  featured: z.boolean(),
  /** Facts checked with the supplier (see Product.checkedAt). Left out: unchanged. */
  checked: z.boolean().optional(),
  variants: z.array(variant).max(60),
  offers: z.array(offer).max(8),
});
export type ProductInput = z.infer<typeof productSchema>;

/** French names of the fields, for "Champ invalide : …" messages a person can act on. */
const FIELD: Record<string, string> = {
  name: "nom", nameAr: "nom arabe", slug: "adresse", summary: "description courte", summaryAr: "description courte arabe",
  description: "description", descriptionAr: "description arabe", specs: "caractéristiques", specsAr: "caractéristiques arabes",
  videoUrl: "vidéo", keywords: "mots-clés", seoTitle: "titre Google", seoTitleAr: "titre Google arabe", seoDescription: "description Google",
  seoDescriptionAr: "description Google arabe", price: "prix", compareAt: "ancien prix", cost: "coût", supplierRef: "réf. fournisseur",
  supplierUrl: "lien fournisseur", stockQty: "stock", variants: "variantes", offers: "offres", label: "nom de l'offre", quantity: "quantité",
  colorHex: "couleur",
};
function issueText(issue: z.core.$ZodIssue): string {
  const path = issue.path.map((p) => (typeof p === "number" ? String(p + 1) : (FIELD[String(p)] ?? String(p)))).join(" ");
  return path || "produit";
}

export type WriteResult = { ok: true; id: string; slug: string; created: boolean } | { ok: false; error: string; conflict?: true };

/** What a stale form is told: someone else saved the product since it was opened. */
export const CHANGED_ELSEWHERE =
  "Ce produit a été modifié ailleurs depuis que vous l'avez ouvert (liste, import, traduction ou un autre onglet). Rien n'a été enregistré : notez vos changements, rechargez la page, puis refaites-les.";

/** Endpoint of a Tunisian day: an offer "until 2026-10-20" stops at midnight in Tunis after that day. */
const endsAtOf = (endsOn: string) => (endsOn ? new Date(Date.parse(`${endsOn}T00:00:00Z`) + 23 * 3_600_000) : null);

/**
 * Creates (id null) or updates a product with its options and offers. Only
 * what changed is written: an edit of the price is one statement, not one per
 * option and offer, which is what a distant database makes slow.
 *
 * `loadedAt` is the product's updatedAt when the form was opened: the editor
 * sends the whole form, so a save from a tab opened before a change made in
 * the list, an import or the batch translation would silently undo it. Such a
 * save is refused instead. The import, which reads the product fresh, does
 * not send it.
 */
export async function writeProduct(id: string | null, raw: unknown, loadedAt?: number): Promise<WriteResult> {
  const parsed = productSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: `Champ invalide : ${issueText(parsed.error.issues[0]!)}` };
  const d = parsed.data;
  if (d.price <= 0) return { ok: false, error: "Prix invalide : il doit être plus grand que 0 (ex. 59,900)." };
  if (d.compareAt != null && d.compareAt <= d.price) return { ok: false, error: "L'ancien prix doit être plus élevé que le prix actuel, sinon laissez-le vide." };
  // Offers are priced from the product price: an option with its own price would make them wrong.
  if (d.offers.length > 0 && d.variants.some((v) => v.price != null && v.price !== d.price)) {
    return { ok: false, error: "Les offres utilisent le prix du produit : retirez le prix propre des variantes, ou retirez les offres." };
  }
  // A name that speaks of another quantity than the offer's ("la 3e offerte" on 2 units) promises what the parcel does not hold.
  for (const [i, o] of d.offers.entries()) {
    const problem = offerLabelProblem(o);
    if (problem) return { ok: false, error: `Offre ${i + 1} : ${problem}. Corrigez le nom ou la quantité.` };
  }
  if (d.videoUrl && !parseVideo(d.videoUrl)) return { ok: false, error: "Vidéo : collez l'adresse complète d'une vidéo YouTube, Vimeo, TikTok, Instagram ou Facebook, ou l'adresse https d'un fichier .mp4 ou d'une vidéo .m3u8 (Amazon)." };
  const slug = slugify(d.slug || d.name);
  if (!slug) return { ok: false, error: "Adresse (slug) invalide." };

  // The two reads at once: one wait for the database instead of two.
  const [clash, before] = await Promise.all([
    prisma.product.findFirst({ where: { slug, ...(id ? { id: { not: id } } : {}) }, select: { id: true } }),
    id
      ? prisma.product.findUnique({
          where: { id },
          select: {
            slug: true, oldSlugs: true, updatedAt: true, checkedAt: true,
            variants: { select: { id: true, name: true, nameAr: true, colorHex: true, sku: true, price: true, stockQty: true, available: true, sort: true } },
            offers: { select: { id: true, label: true, labelAr: true, quantity: true, price: true, freeDelivery: true, endsAt: true, active: true, sort: true } },
          },
        })
      : null,
  ]);
  if (clash) return { ok: false, error: `L'adresse « ${slug} » est déjà utilisée par un autre produit.` };
  if (id && !before) return { ok: false, error: "Produit introuvable : il a peut-être été supprimé." };
  if (before && loadedAt != null && before.updatedAt.getTime() !== loadedAt) return { ok: false, error: CHANGED_ELSEWHERE, conflict: true };

  // A new address keeps the old one working: links already shared and Google's result are redirected.
  const moved = before != null && before.slug !== slug;
  const oldSlugs = moved ? [...new Set([before.slug, ...before.oldSlugs])].filter((x) => x !== slug).slice(0, 20) : (before?.oldSlugs.filter((x) => x !== slug) ?? []);
  if (moved) {
    const other = await prisma.product.findFirst({ where: { slug: { in: oldSlugs }, id: { not: id! } }, select: { slug: true } });
    if (other) return { ok: false, error: `L'ancienne adresse « ${other.slug} » est déjà prise par un autre produit.` };
  }

  const data = {
    name: d.name, nameAr: d.nameAr || null, slug, summary: d.summary, summaryAr: d.summaryAr || null, description: d.description, descriptionAr: d.descriptionAr || null,
    specs: d.specs.trim(), specsAr: d.specsAr.trim() || null, videoUrl: d.videoUrl || null,
    keywords: d.keywords.trim(), seoTitle: d.seoTitle, seoTitleAr: d.seoTitleAr || null, seoDescription: d.seoDescription, seoDescriptionAr: d.seoDescriptionAr || null,
    price: d.price, compareAt: d.compareAt, cost: d.cost, categoryId: d.categoryId, supplierId: d.supplierId,
    supplierRef: d.supplierRef || null, supplierUrl: d.supplierUrl || null, stockMode: d.stockMode, stockQty: d.stockQty,
    available: d.available, active: d.active, featured: d.featured,
    // Ticked: the first date it was ticked is kept; unticked: cleared; not sent: unchanged.
    ...(d.checked === undefined ? {} : { checkedAt: d.checked ? (before?.checkedAt ?? new Date()) : null }),
  };
  const variantRow = (v: (typeof d.variants)[number], i: number) => ({ name: v.name, nameAr: v.nameAr || null, colorHex: v.colorHex ? v.colorHex.toLowerCase() : null, sku: v.sku || null, price: v.price, stockQty: v.stockQty, available: v.available, sort: i });
  const offerRow = (o: (typeof d.offers)[number], i: number) => ({ label: o.label, labelAr: o.labelAr || null, quantity: o.quantity, price: o.price, freeDelivery: o.freeDelivery, endsAt: endsAtOf(o.endsOn), active: o.active, sort: i });

  // Another product that had this address before gives it up.
  const freeSlug = prisma.$executeRaw`UPDATE "Product" SET "oldSlugs" = array_remove("oldSlugs", ${slug}) WHERE ${slug} = ANY("oldSlugs") AND id <> ${id ?? ""}`;

  if (!before) {
    // A new product, its options and its offers in one statement.
    const [, p] = await prisma.$transaction([
      freeSlug,
      prisma.product.create({
        data: { ...data, variants: { create: d.variants.map(variantRow) }, offers: { create: d.offers.map(offerRow) } },
        select: { id: true },
      }),
    ]);
    return { ok: true, id: p.id, slug, created: true };
  }

  const ops: Prisma.PrismaPromise<unknown>[] = [];
  if (moved) ops.push(freeSlug);
  // Written only if nobody saved it since it was read: a save in between makes this one fail as a whole.
  ops.push(prisma.product.update({ where: { id: id!, updatedAt: before.updatedAt }, data: { ...data, oldSlugs }, select: { id: true } }));

  // Options: deleted, changed or new; the untouched ones are not written.
  const oldV = new Map(before.variants.map((v) => [v.id, v]));
  const keepV = new Set(d.variants.flatMap((v) => (v.id && oldV.has(v.id) ? [v.id] : [])));
  const goneV = before.variants.filter((v) => !keepV.has(v.id)).map((v) => v.id);
  if (goneV.length) ops.push(prisma.productVariant.deleteMany({ where: { productId: id!, id: { in: goneV } } }));
  for (const [i, v] of d.variants.entries()) {
    const row = variantRow(v, i);
    const was = v.id ? oldV.get(v.id) : undefined;
    if (!was) ops.push(prisma.productVariant.create({ data: { ...row, productId: id! } }));
    else if (!same(was, row)) ops.push(prisma.productVariant.update({ where: { id: was.id }, data: row }));
  }

  // Offers: past orders keep their own copy of the label and price, so removing one is safe.
  const oldO = new Map(before.offers.map((o) => [o.id, o]));
  const keepO = new Set(d.offers.flatMap((o) => (o.id && oldO.has(o.id) ? [o.id] : [])));
  const goneO = before.offers.filter((o) => !keepO.has(o.id)).map((o) => o.id);
  if (goneO.length) ops.push(prisma.productOffer.deleteMany({ where: { productId: id!, id: { in: goneO } } }));
  for (const [i, o] of d.offers.entries()) {
    const row = offerRow(o, i);
    const was = o.id ? oldO.get(o.id) : undefined;
    if (!was) ops.push(prisma.productOffer.create({ data: { ...row, productId: id! } }));
    else if (!same(was, row)) ops.push(prisma.productOffer.update({ where: { id: was.id }, data: row }));
  }

  try {
    if (ops.length === 1) await ops[0];
    else await prisma.$transaction(ops);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") return { ok: false, error: CHANGED_ELSEWHERE, conflict: true };
    throw e;
  }
  return { ok: true, id: id!, slug, created: false };
}

/** Whether a stored row already holds these values (dates compared by time). */
function same(was: Record<string, unknown>, row: Record<string, unknown>): boolean {
  return Object.entries(row).every(([k, v]) => {
    const w = was[k];
    if (v instanceof Date || w instanceof Date) return (v instanceof Date ? v.getTime() : v) === (w instanceof Date ? w.getTime() : w);
    return w === v;
  });
}

/** The form's view of a stored product, for the editor and for merging a CSV row into it. */
export const productForForm = {
  id: true, name: true, nameAr: true, slug: true, summary: true, summaryAr: true, description: true, descriptionAr: true,
  specs: true, specsAr: true, videoUrl: true, keywords: true, seoTitle: true, seoTitleAr: true, seoDescription: true, seoDescriptionAr: true,
  price: true, compareAt: true, cost: true, categoryId: true, supplierId: true, supplierRef: true, supplierUrl: true,
  stockMode: true, stockQty: true, available: true, active: true, featured: true, checkedAt: true, oldSlugs: true, updatedAt: true,
  variants: { orderBy: { sort: "asc" }, select: { id: true, name: true, nameAr: true, colorHex: true, sku: true, price: true, stockQty: true, available: true } },
  offers: { orderBy: { sort: "asc" }, select: { id: true, label: true, labelAr: true, quantity: true, price: true, freeDelivery: true, active: true, endsAt: true } },
} satisfies Prisma.ProductSelect;

type Stored = Prisma.ProductGetPayload<{ select: typeof productForForm }>;

export function toInput(p: Stored): ProductInput {
  return {
    name: p.name, nameAr: p.nameAr ?? "", slug: p.slug, summary: p.summary, summaryAr: p.summaryAr ?? "", description: p.description, descriptionAr: p.descriptionAr ?? "",
    specs: p.specs, specsAr: p.specsAr ?? "", videoUrl: p.videoUrl ?? "",
    keywords: p.keywords, seoTitle: p.seoTitle, seoTitleAr: p.seoTitleAr ?? "", seoDescription: p.seoDescription, seoDescriptionAr: p.seoDescriptionAr ?? "",
    price: p.price, compareAt: p.compareAt, cost: p.cost, categoryId: p.categoryId, supplierId: p.supplierId,
    supplierRef: p.supplierRef ?? "", supplierUrl: p.supplierUrl ?? "", stockMode: p.stockMode, stockQty: p.stockQty,
    available: p.available, active: p.active, featured: p.featured, checked: p.checkedAt != null,
    variants: p.variants.map((v) => ({ id: v.id, name: v.name, nameAr: v.nameAr ?? "", colorHex: v.colorHex ?? "", sku: v.sku ?? "", price: v.price, stockQty: v.stockQty, available: v.available })),
    offers: p.offers.map((o) => ({
      id: o.id, label: o.label, labelAr: o.labelAr ?? "", quantity: o.quantity, price: o.price, freeDelivery: o.freeDelivery, active: o.active,
      // Stored as midnight in Tunis after the last day; shown as that last day.
      endsOn: o.endsAt ? new Date(o.endsAt.getTime() - 23 * 3_600_000).toISOString().slice(0, 10) : "",
    })),
  };
}

