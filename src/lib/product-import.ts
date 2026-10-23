import "server-only";
import { z } from "zod";
import { prisma } from "./prisma";
import { slugify } from "./slug";
import { mergeRow, rowKey, type RowData } from "./product-csv";
import { productForForm, toInput, writeProduct, type ProductInput } from "./product-write";
import { needsTranslation, textsOfProduct, withProductTexts } from "./translate-merge";
import { translateProduct, translationReady } from "./translate";
import { normHeader } from "./product-csv";
import { arabicCategory } from "./category-ar";

/**
 * The server half of the CSV import. The browser reads the file and sends
 * one row at a time; every row is checked again here (lengths, prices,
 * options, offers) and saved through the same code as the product form.
 */

const text = (max: number) => z.string().max(max).optional();
const money = z.number().int().min(0).max(100_000_000);

export const rowSchema = z.object({
  slug: text(100), name: text(140), nameAr: text(140), summary: text(300), summaryAr: text(300), description: text(8000), descriptionAr: text(8000),
  specs: text(4000), specsAr: text(4000), keywords: text(1000), videoUrl: text(500),
  seoTitle: text(120), seoTitleAr: text(120), seoDescription: text(320), seoDescriptionAr: text(320),
  price: money.optional(), compareAt: money.nullable().optional(), cost: money.optional(),
  category: text(60), categoryAr: text(60), supplier: text(80), supplierRef: text(120), supplierUrl: text(500),
  stockQty: z.number().int().min(0).max(1_000_000).nullable().optional(),
  available: z.boolean().optional(), active: z.boolean().optional(), featured: z.boolean().optional(),
  photos: z.array(z.string().max(2000)).max(30).optional(), detailPhotos: z.array(z.string().max(2000)).max(30).optional(),
  variants: z.array(z.object({ name: z.string().min(1).max(60), nameAr: text(60), colorHex: z.string().regex(/^#[0-9a-f]{6}$/).optional(), price: money.nullable().optional(), stockQty: z.number().int().min(0).max(1_000_000).optional() })).max(60).optional(),
  offers: z.array(z.object({ quantity: z.number().int().min(1).max(50), price: money.min(1), freeDelivery: z.boolean(), label: text(80), labelAr: text(80) })).max(8).optional(),
}) satisfies z.ZodType<RowData>;

const sameName = (a: string, b: string) => normHeader(a) === normHeader(b);

/** Before importing: which rows update a product already in the shop, and which categories and suppliers are new. */
export async function checkImport(keys: string[], categories: string[], suppliers: string[]) {
  const unique = [...new Set(keys.filter(Boolean))].slice(0, 2000);
  const [found, cats, sups] = await Promise.all([
    prisma.product.findMany({ where: { OR: [{ slug: { in: unique } }, { oldSlugs: { hasSome: unique } }] }, select: { id: true, slug: true, oldSlugs: true, name: true } }),
    prisma.category.findMany({ select: { name: true, slug: true } }),
    prisma.supplier.findMany({ select: { name: true } }),
  ]);
  const existing: Record<string, { id: string; name: string }> = {};
  for (const p of found) for (const k of [p.slug, ...p.oldSlugs]) if (unique.includes(k) && !existing[k]) existing[k] = { id: p.id, name: p.name };
  return {
    existing,
    newCategories: [...new Set(categories)].filter((c) => !cats.some((x) => sameName(x.name, c) || x.slug === slugify(c))),
    newSuppliers: [...new Set(suppliers)].filter((s) => !sups.some((x) => sameName(x.name, s))),
  };
}

/** Creates the missing categories and suppliers once, before the rows are sent several at a time. */
export async function prepareImport(categories: { name: string; nameAr?: string }[], suppliers: string[]) {
  const cats = await prisma.category.findMany({ select: { id: true, name: true, slug: true, sort: true } });
  let sort = Math.max(0, ...cats.map((c) => c.sort));
  for (const c of categories) {
    const slug = slugify(c.name);
    if (!slug || cats.some((x) => sameName(x.name, c.name) || x.slug === slug)) continue;
    // A common aisle gets its Arabic name at once; the others are translated on the Categories page.
    const made = await prisma.category.upsert({ where: { slug }, create: { name: c.name.trim(), nameAr: c.nameAr?.trim() || arabicCategory(c.name) || null, slug, sort: ++sort }, update: {}, select: { id: true, name: true, slug: true, sort: true } });
    cats.push(made);
  }
  const sups = await prisma.supplier.findMany({ select: { id: true, name: true } });
  for (const s of suppliers) {
    if (!s.trim() || sups.some((x) => sameName(x.name, s))) continue;
    sups.push(await prisma.supplier.create({ data: { name: s.trim() }, select: { id: true, name: true } }));
  }
  return { ok: true as const };
}

async function categoryId(name: string, nameAr?: string): Promise<string | null> {
  const slug = slugify(name);
  const cats = await prisma.category.findMany({ select: { id: true, name: true, slug: true } });
  const hit = cats.find((c) => sameName(c.name, name)) ?? cats.find((c) => c.slug === slug);
  if (hit) return hit.id;
  if (!slug) return null;
  // Not prepared (a row sent on its own): made here, safely if two rows ask at once.
  const made = await prisma.category.upsert({ where: { slug }, create: { name: name.trim(), nameAr: nameAr?.trim() || arabicCategory(name) || null, slug }, update: {}, select: { id: true } });
  return made.id;
}

async function supplierId(name: string): Promise<string> {
  const sups = await prisma.supplier.findMany({ select: { id: true, name: true } });
  return sups.find((s) => sameName(s.name, name))?.id ?? (await prisma.supplier.create({ data: { name: name.trim() }, select: { id: true } })).id;
}

export type ImportRowResult =
  | { ok: true; id: string; slug: string; created: boolean; translated: boolean; arabicToRedo: boolean; images: { GALLERY: number; DETAIL: number } }
  | { ok: false; error: string };

/**
 * One row: the product found by its address (or an old address), the row's
 * values over it, then the same save as the form. A row run twice gives the
 * same product, not a copy.
 */
export async function importRow(row: RowData, opts: { activateNew: boolean; translate: boolean }): Promise<ImportRowResult> {
  const key = rowKey(row);
  if (!key) return { ok: false, error: "Ni nom ni adresse : la ligne ne dit pas quel produit." };
  const found = await prisma.product.findFirst({
    where: { OR: [{ slug: key }, { oldSlugs: { has: key } }] },
    orderBy: { createdAt: "asc" },
    select: { ...productForForm, images: { select: { kind: true } } },
  });
  if (!found) {
    if (!row.name) return { ok: false, error: "Nouveau produit sans nom en français." };
    if (row.price == null) return { ok: false, error: "Nouveau produit sans prix." };
  }
  const refs = {
    ...(row.category ? { categoryId: await categoryId(row.category, row.categoryAr) } : {}),
    ...(row.supplier ? { supplierId: await supplierId(row.supplier) } : {}),
  };
  const base = found ? toInput(found) : null;
  let input = mergeRow(base, row, refs, opts.activateNew);
  // French changed without its Arabic: the old Arabic was removed, to be translated again.
  const arabicOf = (p: ProductInput) => [p.nameAr, p.summaryAr, p.descriptionAr, p.specsAr, p.seoTitleAr, p.seoDescriptionAr, ...p.offers.map((o) => o.labelAr)];
  const removed = base != null && arabicOf(base).some((v, i) => v.trim() && !arabicOf(input)[i]?.trim());

  let translated = false;
  if (opts.translate && translationReady() && needsTranslation(textsOfProduct(input))) {
    try {
      input = withProductTexts(input, await translateProduct(textsOfProduct(input), "fill"));
      translated = true;
    } catch {
      // The product is saved without the translation; the translation page can do it later.
    }
  }

  const w = await writeProduct(found?.id ?? null, input);
  if (!w.ok) return w;
  const count = (k: "GALLERY" | "DETAIL") => found?.images.filter((i) => i.kind === k).length ?? 0;
  return { ok: true, id: w.id, slug: w.slug, created: w.created, translated, arabicToRedo: removed && !translated, images: { GALLERY: count("GALLERY"), DETAIL: count("DETAIL") } };
}
