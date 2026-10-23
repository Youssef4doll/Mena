"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { refreshCatalog } from "@/lib/catalog-refresh";

/** The products changed: see refreshCatalog. */
async function done(productIds: string[] = []) {
  await refreshCatalog(productIds);
  revalidatePath("/admin/produits");
}

/**
 * Once at the end of an import: the shop rebuilds its pages in the background
 * (customers are not kept waiting meanwhile), the product list shows
 * everything at once, and this page its new storage figures, in the same
 * response.
 */
export async function finishImport(): Promise<{ ok: true }> {
  await requireAdmin();
  await done();
  return { ok: true };
}

const ids = z.array(z.string().regex(/^[a-z0-9]{20,40}$/)).min(1).max(2000);

/** "Mettre en ligne les N produits créés": the products an import created offline, after a look at them. */
export async function activateProducts(raw: string[]): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  await requireAdmin();
  const parsed = ids.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Liste de produits invalide." };
  const r = await prisma.product.updateMany({ where: { id: { in: parsed.data } }, data: { active: true } });
  await done(parsed.data);
  return { ok: true, count: r.count };
}
