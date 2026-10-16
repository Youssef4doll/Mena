import { z } from "zod";
import { refuseUnlessAdmin } from "@/lib/admin-api";
import { json, readJson } from "@/lib/http";
import { checkImport } from "@/lib/product-import";

const body = z.object({
  keys: z.array(z.string().max(100)).max(2000),
  categories: z.array(z.string().max(60)).max(2000),
  suppliers: z.array(z.string().max(80)).max(2000),
});

/** For the preview: which rows update an existing product, which categories and suppliers will be created. Writes nothing. */
export async function POST(request: Request) {
  const refused = await refuseUnlessAdmin(request);
  if (refused) return refused;
  const parsed = body.safeParse(await readJson(request, 512_000));
  if (!parsed.success) return json({ ok: false, error: "Liste invalide." }, 400);
  return json({ ok: true, ...(await checkImport(parsed.data.keys, parsed.data.categories, parsed.data.suppliers)) });
}
