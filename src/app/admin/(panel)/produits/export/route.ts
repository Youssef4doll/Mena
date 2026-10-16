import { refuseUnlessAdmin } from "@/lib/admin-api";
import { prisma } from "@/lib/prisma";
import { SITE_URL } from "@/lib/site";
import { productForForm, toInput } from "@/lib/product-write";
import { productsToCsv, templateCsv } from "@/lib/product-csv";
import { csvResponse } from "@/lib/csv";

/**
 * The catalog as a CSV file in the import format: open it in Excel or Google
 * Sheets, change prices or texts, import it again. ?modele=vide gives the
 * empty template, ?modele=exemple the template with two example lines.
 */
export async function GET(request: Request) {
  const refused = await refuseUnlessAdmin(request);
  if (refused) return refused;
  const url = new URL(request.url);
  const model = url.searchParams.get("modele");
  const day = new Date().toISOString().slice(0, 10);
  if (model) return csvResponse(model === "exemple" ? "exemple-import-produits.csv" : "modele-import-produits.csv", templateCsv(model === "exemple"));

  // Pictures are listed by their address on this shop; importing the file again links them, it never copies them.
  const base = (SITE_URL.startsWith("http://localhost") ? url.origin : SITE_URL).replace(/\/$/, "");
  const products = await prisma.product.findMany({
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
    take: 5000,
    select: {
      ...productForForm,
      category: { select: { name: true, nameAr: true } },
      supplier: { select: { name: true } },
      images: { orderBy: { sort: "asc" }, select: { mediaId: true, kind: true } },
    },
  });
  const rows = products.map((p) => ({
    ...toInput(p),
    category: p.category,
    supplier: p.supplier?.name ?? null,
    photos: p.images.filter((i) => i.kind === "GALLERY").map((i) => `${base}/api/img/${i.mediaId}/1600`),
    detailPhotos: p.images.filter((i) => i.kind === "DETAIL").map((i) => `${base}/api/img/${i.mediaId}/1600`),
  }));
  return csvResponse(`produits-mena-${day}.csv`, productsToCsv(rows));
}
