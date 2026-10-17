import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { directImageUrl, importImageFromUrl, storeImage } from "./media";

export type ImageKind = "GALLERY" | "DETAIL";
export type AddImageResult = { ok: true; id: string; skipped: boolean } | { ok: false; error: string };

/** A picture of this shop ("…/api/img/<id>/<width>"), as an export lists them: linked again, never downloaded twice. */
const OWN = /\/api\/img\/([a-z0-9]{20,40})\/\d+\/?$/;

/**
 * Adds a picture to a product, from a web address or from a file. `source`
 * (the address, or the file's name and size) is kept with the picture, so
 * the same CSV imported again adds nothing. `sort` is the place asked by the
 * caller, which sends several pictures at once and knows their order.
 */
export async function addProductImage(
  productId: string,
  kind: ImageKind,
  from: { url: string } | { buf: Buffer; mime: string; source: string | null; max?: number },
  sort?: number,
): Promise<AddImageResult> {
  const source = "url" in from ? directImageUrl(from.url).slice(0, 1000) : from.source?.slice(0, 1000) || null;
  const [product, already, last] = await Promise.all([
    prisma.product.findUnique({ where: { id: productId }, select: { id: true } }),
    source ? prisma.productImage.findFirst({ where: { productId, kind, source }, select: { id: true } }) : null,
    sort == null ? prisma.productImage.findFirst({ where: { productId, kind }, orderBy: { sort: "desc" }, select: { sort: true } }) : null,
  ]);
  if (!product) return { ok: false, error: "Produit introuvable." };
  if (already) return { ok: true, id: already.id, skipped: true };
  const place = sort ?? (last?.sort ?? -1) + 1;
  try {
    let mediaId: string;
    const own = "url" in from ? from.url.match(OWN)?.[1] : undefined;
    const known = own ? await prisma.media.findUnique({ where: { id: own }, select: { id: true } }) : null;
    if (known) {
      const linked = await prisma.productImage.findFirst({ where: { productId, kind, mediaId: known.id }, select: { id: true } });
      if (linked) return { ok: true, id: linked.id, skipped: true };
      mediaId = known.id;
    } else if ("url" in from) mediaId = (await importImageFromUrl(from.url)).id;
    else mediaId = (await storeImage(from.buf, from.mime, from.max)).id;
    try {
      const img = await prisma.productImage.create({ data: { productId, kind, mediaId, sort: place, source }, select: { id: true } });
      return { ok: true, id: img.id, skipped: false };
    } catch (e) {
      // The same picture sent at the same moment from another device: that one is kept, this copy is dropped.
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && source)) throw e;
      const kept = await prisma.productImage.findFirst({ where: { productId, kind, source }, select: { id: true } });
      if (!known) await prisma.media.delete({ where: { id: mediaId } }).catch(() => {});
      return { ok: true, id: kept?.id ?? "", skipped: true };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Image refusée." };
  }
}
