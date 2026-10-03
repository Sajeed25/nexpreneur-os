"use client";

/** Shrinks a photo in the browser (max 1200px, JPEG) so uploads stay small and fast. Returns null if the file isn't a readable image. */
export async function resizeToJpeg(file: File, max = 1200, quality = 0.82): Promise<Blob | null> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise((res) => c.toBlob((b) => res(b), "image/jpeg", quality));
  } catch {
    return null;
  }
}
