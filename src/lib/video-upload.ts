/**
 * A product video sent from the admin's computer goes straight from the
 * browser to Vercel Blob: the file is too big for the site's own functions
 * (4.5 MB at most). The site only signs the upload, for a signed-in admin.
 * Works once a Blob store is connected to the project on Vercel, which sets
 * BLOB_READ_WRITE_TOKEN; until then the editor says how to connect one.
 */
export const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"] as const;
export const VIDEO_MAX_MB = 60;
export const VIDEO_UPLOAD_URL = "/admin/produits/video";

/** Where the file is kept: "produits/<name>.<ext>", a random suffix added by Blob. Null when the file is not a video the shop takes. */
export function videoPath(fileName: string, type: string): string | null {
  const ext = type === "video/mp4" ? "mp4" : type === "video/webm" ? "webm" : type === "video/quicktime" ? "mov" : null;
  if (!ext) return null;
  const base =
    fileName
      .replace(/\.[^.]+$/, "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "video";
  return `produits/${base}.${ext}`;
}

/** The path the server accepts to sign: exactly what videoPath makes. */
export const VIDEO_PATH = /^produits\/[a-z0-9-]{1,60}\.(mp4|webm|mov)$/;
