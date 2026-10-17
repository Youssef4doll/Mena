import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { translationReady } from "@/lib/translate";
import { PageTitle } from "@/components/admin/ui";
import { ImportWizard } from "./ImportWizard";

export const metadata = { title: "Importer des produits" };

/**
 * What the database holds now, for the estimate of what an import adds. The
 * picture sizes are read from the stored lengths, without reading the
 * pictures. Null when the database does not answer: the page works without it.
 */
async function storage() {
  try {
    const [r] = await prisma.$queryRaw<{ photos: bigint; photoBytes: bigint | null; dbBytes: bigint }[]>`
      SELECT (SELECT count(*) FROM "Media") AS photos,
             (SELECT sum(octet_length(bytes)) FROM "Media") AS "photoBytes",
             pg_database_size(current_database()) AS "dbBytes"`;
    return { photos: Number(r.photos), photoBytes: Number(r.photoBytes ?? 0), dbBytes: Number(r.dbBytes) };
  } catch {
    return null;
  }
}

export default async function ImportPage() {
  return (
    <>
      <Link href="/admin/produits" className="-mt-2 mb-1 inline-flex h-10 items-center text-sm text-muted">← Produits</Link>
      <PageTitle title="Importer des produits" sub="Beaucoup de produits d'un coup, depuis Excel ou Google Sheets : textes, prix, photos, catégories, options et offres." />
      <ImportWizard aiReady={translationReady()} storage={await storage()} />
    </>
  );
}
