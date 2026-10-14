"use client";

/**
 * Makes a picture light enough to upload: at most 1600 px wide (what the shop
 * stores) and `maxH` tall, re-encoded in the browser. The server re-encodes it
 * again, so this only saves the upload. Anything that cannot be redrawn here
 * (an unusual format, an old browser, a picture too large for a canvas) is
 * sent as it is.
 */
export async function shrinkForUpload(file: File, maxH: number): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || typeof createImageBitmap !== "function") return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / bmp.width, maxH / bmp.height);
    // Already small: nothing to gain.
    if (scale === 1 && file.size < 1_500_000) {
      bmp.close();
      return file;
    }
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    // JPEG has no transparency: a white background, like a product photo.
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    // WebP where the browser can write it, JPEG otherwise (Safari).
    let blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", 0.88));
    if (!blob || blob.type !== "image/webp") blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.88));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, blob.type === "image/webp" ? ".webp" : ".jpg"), { type: blob.type });
  } catch {
    return file;
  }
}
