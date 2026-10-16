import { z } from "zod";
import { refuseUnlessAdmin } from "@/lib/admin-api";
import { json, readJson } from "@/lib/http";
import { prepareImport } from "@/lib/product-import";

const body = z.object({
  categories: z.array(z.object({ name: z.string().min(1).max(60), nameAr: z.string().max(60).optional() })).max(500),
  suppliers: z.array(z.string().min(1).max(80)).max(500),
});

/** Creates the import's new categories and suppliers, once, before its rows. */
export async function POST(request: Request) {
  const refused = await refuseUnlessAdmin(request);
  if (refused) return refused;
  const parsed = body.safeParse(await readJson(request, 256_000));
  if (!parsed.success) return json({ ok: false, error: "Liste invalide." }, 400);
  return json(await prepareImport(parsed.data.categories, parsed.data.suppliers));
}
