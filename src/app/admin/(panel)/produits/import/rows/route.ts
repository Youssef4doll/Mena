import { revalidateTag } from "next/cache";
import { z } from "zod";
import { refuseUnlessAdmin } from "@/lib/admin-api";
import { json, readJson } from "@/lib/http";
import { CATALOG_TAG } from "@/lib/catalog";
import { importRow, rowSchema } from "@/lib/product-import";
import { COLUMNS } from "@/lib/product-csv";

// With an API key, a row may wait for its translation.
export const maxDuration = 120;

const body = z.object({ row: rowSchema, activateNew: z.boolean().default(false), translate: z.boolean().default(false) });

/** One CSV row, created or updated. The browser sends a few at a time and shows the progress. */
export async function POST(request: Request) {
  const refused = await refuseUnlessAdmin(request);
  if (refused) return refused;
  const parsed = body.safeParse(await readJson(request, 256_000));
  if (!parsed.success) {
    // The column as the file names it ("prix", "photos"), not the field's internal name.
    const key = parsed.error.issues[0]?.path.find((p) => typeof p === "string" && p !== "row");
    const column = COLUMNS.find((c) => c.key === key || (key === "stockQty" && c.key === "stock"))?.header;
    return json({ ok: false, error: column ? `Ligne refusée : la colonne « ${column} » a une valeur trop longue ou invalide.` : "Ligne refusée : une valeur est trop longue ou invalide." }, 400);
  }
  const r = await importRow(parsed.data.row, parsed.data);
  if (!r.ok) return json(r, 422);
  revalidateTag(CATALOG_TAG, "max");
  return json(r);
}
