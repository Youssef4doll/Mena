import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { translationReady } from "@/lib/translate";
import { PageTitle } from "@/components/admin/ui";
import { SupplierImport } from "./SupplierImport";

export const metadata = { title: "Ajouter depuis Ecomness" };
// Claude writes a product page in two languages in this page's action: it can take a little while.
export const maxDuration = 120;

export default async function SupplierImportPage() {
  const categories = await prisma.category.findMany({ orderBy: [{ sort: "asc" }, { name: "asc" }], select: { name: true } });
  return (
    <>
      <Link href="/admin/produits" className="-mt-2 mb-1 inline-flex h-10 items-center text-sm text-muted">← Produits</Link>
      <PageTitle title="Ajouter depuis Ecomness" sub="Collez la liste de vos produits Ecomness, ou la page d'un produit : photos en grand, textes en français et en arabe tunisien, coût et référence. Les produits sont créés hors ligne." />
      <SupplierImport aiReady={translationReady()} categories={categories.map((c) => c.name)} />
    </>
  );
}
