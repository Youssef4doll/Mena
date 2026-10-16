import { revalidateTag } from "next/cache";
import { z } from "zod";
import { refuseUnlessAdmin } from "@/lib/admin-api";
import { json, readJson } from "@/lib/http";
import { MAX_UPLOAD } from "@/lib/media";
import { CATALOG_TAG } from "@/lib/catalog";
import { addProductImage } from "@/lib/product-images";

// A supplier's server can be slow; a picture is fetched, resized and stored here.
export const maxDuration = 60;

const byUrl = z.object({ url: z.url().max(2000), kind: z.enum(["GALLERY", "DETAIL"]), sort: z.number().int().min(0).max(100_000).optional() });

/**
 * One picture for a product: a file (multipart: file, kind, source, sort) or a
 * web address (JSON: url, kind, sort). A route rather than a Server Action,
 * so the editor and the CSV import can send several at the same time.
 */
export async function POST(request: Request, ctx: RouteContext<"/admin/produits/[id]/images">) {
  const refused = await refuseUnlessAdmin(request);
  if (refused) return refused;
  const { id } = await ctx.params;
  if (!/^[a-z0-9]{20,40}$/.test(id)) return json({ ok: false, error: "Produit introuvable." }, 404);

  let result;
  if ((request.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File) || file.size === 0) return json({ ok: false, error: "Aucune image." }, 400);
    if (file.size > MAX_UPLOAD) return json({ ok: false, error: `${file.name} : 8 Mo maximum.` }, 413);
    const kind = form!.get("kind") === "DETAIL" ? "DETAIL" : "GALLERY";
    const sort = Number(form!.get("sort"));
    const source = String(form!.get("source") ?? "").slice(0, 300) || null;
    result = await addProductImage(id, kind, { buf: Buffer.from(await file.arrayBuffer()), mime: file.type, source }, Number.isInteger(sort) && sort >= 0 && sort <= 100_000 ? sort : undefined);
  } else {
    const body = byUrl.safeParse(await readJson(request, 8_192));
    if (!body.success) return json({ ok: false, error: "Adresse d'image invalide." }, 400);
    result = await addProductImage(id, body.data.kind, { url: body.data.url }, body.data.sort);
  }
  if (!result.ok) return json(result, 422);
  // The shop shows the new picture on its next visit; the editor asks for an immediate refresh itself.
  revalidateTag(CATALOG_TAG, "max");
  return json(result);
}
