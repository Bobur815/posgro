// Product/category pictures in the renderer: the posimg: URLs the main process serves
// (main/images/images-protocol.ts) and the canvas step that shrinks a picture before it is stored.

/** Same box the seed script uses (scripts/fetch-mxik-images.ts): fit inside 256×256. */
const PICTURE_SIZE = 256;
const WEBP_QUALITY = 0.8;

/** A product's picture: its own (by barcode), else its MXIK's. `v` changes when either changes. */
export function productPictureUrl(
  product: { barcode: string; mxik?: string | null },
  v: string | number = 0,
): string {
  const q = new URLSearchParams({ barcode: product.barcode, v: String(v) });
  if (product.mxik) q.set("mxik", product.mxik);
  return `posimg://product/?${q}`;
}

/** A category's picture: its own, else the seed by nameUz, else by nameRu. */
export function categoryPictureUrl(
  category: { nameUz: string; nameRu?: string | null },
  v: string | number = 0,
): string {
  const q = new URLSearchParams({ uz: category.nameUz, v: String(v) });
  if (category.nameRu) q.set("ru", category.nameRu);
  return `posimg://category/?${q}`;
}

/**
 * The tallest of a code's candidate pictures (height ÷ width, first on a tie), shrunk to WebP.
 *
 * Same rule as the seed's pickUpright (main/images/image-bytes.ts): tasnif's random-suffix
 * pictures include caps and lids shot from above, the backs of cans and flat package prints — all
 * square or wide — while the product standing up is tall. createImageBitmap applies EXIF
 * orientation, so a sideways phone photo is measured upright. Undecodable candidates are skipped.
 */
export async function encodeTallest(
  candidates: Array<{ bytes: Uint8Array; sourceName: string }>,
): Promise<{ bytes: Uint8Array; sourceName: string } | null> {
  let best: { blob: Blob; sourceName: string; ratio: number } | null = null;
  for (const c of candidates) {
    const blob = new Blob([Uint8Array.from(c.bytes)]);
    let ratio: number;
    try {
      const bitmap = await createImageBitmap(blob);
      ratio = bitmap.height / bitmap.width;
      bitmap.close();
    } catch {
      continue;
    }
    if (!best || ratio > best.ratio) best = { blob, sourceName: c.sourceName, ratio };
  }
  return best ? { bytes: await encodePicture(best.blob), sourceName: best.sourceName } : null;
}

/**
 * Fit a picture inside 256×256 on a white background and encode it as WebP — what every stored
 * picture is, whether it came from tasnif on this till or from an admin's file. White, because
 * transparent PNGs otherwise turn black wherever a viewer ignores alpha.
 */
export async function encodePicture(source: Blob): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(source);
  try {
    const scale = Math.min(1, PICTURE_SIZE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas unavailable");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await canvas.convertToBlob({ type: "image/webp", quality: WEBP_QUALITY });
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    bitmap.close();
  }
}
