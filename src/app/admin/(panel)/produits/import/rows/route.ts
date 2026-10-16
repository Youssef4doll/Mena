import { revalidateTag } from "next/cache";
import { z } from "zod";
import { refuseUnlessAdmin } from "@/lib/admin-api";
import { json, readJson } from "@/lib/http";
import { CATALOG_TAG } from "@/lib/catalog";
import { importRow, rowSchema } from "@/lib/product-import";

// With an API key, a row may wait for its translation.
export const maxDuration = 120;

const body = z.object({ row: rowSchema, activateNew: z.boolean().default(false), translate: z.boolean().default(false) });

/** One CSV row, created or updated. The browser sends a few at a time and shows the progress. */
export async function POST(request: Request) {
  const refused = await refuseUnlessAdmin(request);
  if (refused) return refused;
  const parsed = body.safeParse(await readJson(request, 256_000));
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return json({ ok: false, error: `Ligne refusée : ${i?.path.join(" ") || "contenu"} invalide.` }, 400);
  }
  const r = await importRow(parsed.data.row, parsed.data);
  if (!r.ok) return json(r, 422);
  revalidateTag(CATALOG_TAG, "max");
  return json(r);
}
