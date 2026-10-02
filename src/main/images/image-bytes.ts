// Pure helpers for product/category pictures — no electron import, so the seed script
// (scripts/fetch-mxik-images.ts) and the main process share one definition of "a real picture",
// "a generic MXIK" and "the same category name".

export type ImageMime = 'image/jpeg' | 'image/png' | 'image/webp';

/**
 * The picture type from the file's leading bytes, or null when it is not a JPEG/PNG/WebP.
 *
 * tasnif answers a missing file with HTTP 200 and a placeholder (a "404 Error" JPEG for `.jpg`,
 * an SVG for `.png`), so the status code proves nothing. SVG is rejected here; the JPEG
 * placeholder can only be reached by asking for a name `picture-names` did not list, which
 * nothing does.
 */
export function sniffImageMime(bytes: Uint8Array): ImageMime | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) === 'RIFF' &&
    String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

/** tasnif's picture endpoints (found in the tasnif.soliq.uz site bundle; no auth, UZ IPs only). */
export const TASNIF_PICTURES =
  'https://tasnif.soliq.uz/api/cls-api/integration-mxik/references/get';

/**
 * The order to try a code's pictures in: numbered names (`{mxik}_1.png`, `_2`, …) first, by
 * number, then the rest as tasnif lists them. The numbered ones are the clean front shots; the
 * random-suffix ones are extra angles — Coca-Cola 02202002001010009 lists a top-down photo of the
 * cap first.
 */
export function preferredPictureOrder(names: string[]): string[] {
  const numbered = names
    .filter(isNumberedPictureName)
    .sort((a, b) => pictureNumber(a) - pictureNumber(b));
  return [...numbered, ...names.filter((n) => !isNumberedPictureName(n))];
}

const pictureNumber = (name: string) => Number(/_(\d+)\.[a-z]+$/i.exec(name)?.[1]);

/** `{mxik}_1.png`-style names — the catalog's own front shots. */
export function isNumberedPictureName(name: string): boolean {
  return /_\d+\.[a-z]+$/i.test(name);
}

/**
 * Among a code's random-suffix pictures, the tallest one (height ÷ width), first on a tie.
 *
 * In the seed's sample about one picture in five was useless — a cap or a can lid shot from
 * above, the back of a can, a packaging print laid flat — and all of those are square or wide,
 * while a bottle, can or carton standing up is tall. Numbered pictures skip this: they are already
 * the front. The renderer applies the same rule for codes a till fetches (utils/pictures.ts).
 */
export function pickUpright<T extends { width: number; height: number }>(
  candidates: T[],
): T | undefined {
  let best: T | undefined;
  for (const c of candidates) {
    if (c.width <= 0 || c.height <= 0) continue;
    if (!best || c.height / c.width > best.height / best.width) best = c;
  }
  return best;
}

/** A full 17-digit MXIK code. */
export function isFullMxik(mxik: string | null | undefined): mxik is string {
  return typeof mxik === 'string' && /^\d{17}$/.test(mxik);
}

/**
 * A sub-position-level code (`…000000`, e.g. `00401001001000000` "Сут") names a kind of goods,
 * not a product — one store has 119 different products on `01905007001000000`. Its tasnif
 * picture would put the same photo on all of them, so generic codes get no automatic picture.
 */
export function isGenericMxik(mxik: string): boolean {
  return mxik.endsWith('000000');
}

/** Whether a code may get an automatic tasnif picture. */
export function wantsMxikPicture(mxik: string | null | undefined): mxik is string {
  return isFullMxik(mxik) && !isGenericMxik(mxik);
}

/**
 * The key a category's pre-filled picture is matched on: the name, case- and spacing-insensitive,
 * with every Uzbek apostrophe variant (ʻ ʼ ‘ ’ `) folded to `'`. "Uy-ro‘zg‘or " and "uy-ro'zg'or"
 * are the same category.
 */
export function categoryNameKey(name: string): string {
  return name
    .normalize('NFC')
    .replace(/[ʻʼ‘’`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Shape of `prisma/seed/images/manifest.json`, written by the seed script, read by the till. */
export interface ImageSeedManifest {
  /** ISO time of the run that produced it; a till re-imports whenever this differs from the last one it imported. */
  generatedAt: string;
  /** Pictures found: `file` is relative to the manifest's folder. */
  mxik: Array<{ mxik: string; file: string; sourceName: string }>;
  /** Codes tasnif had no usable picture for when the seed was made — a till waits before asking again. */
  mxikNone: string[];
  /**
   * Codes whose every tasnif picture was judged wrong in review (scripts/mxik-image-overrides.json).
   * A till never fetches these. Optional: a seed from before review has none.
   */
  mxikBlocked?: string[];
  categories: Array<{ nameKey: string; file: string }>;
}
