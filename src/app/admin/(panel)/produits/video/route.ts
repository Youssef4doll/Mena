import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { refuseUnlessAdmin } from "@/lib/admin-api";
import { json } from "@/lib/http";
import { VIDEO_MAX_MB, VIDEO_PATH, VIDEO_TYPES } from "@/lib/video-upload";

/**
 * Signs one video upload from the product editor (see lib/video-upload): the
 * browser then sends the file to Vercel Blob itself. Only the signing step
 * comes here, from a signed-in admin, for a video type and size the shop takes.
 */
export async function POST(request: Request) {
  const refused = await refuseUnlessAdmin(request);
  if (refused) return refused;
  if (!process.env.BLOB_READ_WRITE_TOKEN) return json({ error: "Stockage des vidéos non connecté (Vercel Blob)." }, 503);
  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return json({ error: "Requête illisible." }, 400);
  }
  // No completion call is asked for: the editor saves the file's address with the product.
  if (body?.type !== "blob.generate-client-token") return json({ error: "Requête refusée." }, 400);
  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!VIDEO_PATH.test(pathname)) throw new Error("Nom de fichier refusé.");
        return { allowedContentTypes: [...VIDEO_TYPES], maximumSizeInBytes: VIDEO_MAX_MB * 1024 * 1024, addRandomSuffix: true };
      },
    });
    return json(result);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Envoi refusé." }, 400);
  }
}
