// Ask tasnif for one MXIK's pictures, from the till's main process (no browser CORS; the till is
// in Uzbekistan, where tasnif answers). Returns original bytes: the renderer picks one, shrinks it
// to a 256px WebP on a canvas and hands it back (images-handlers.ts → `images:saveMxik`).
import {
  isNumberedPictureName,
  preferredPictureOrder,
  sniffImageMime,
  TASNIF_PICTURES,
} from './image-bytes';

/** tasnif's raw uploads reach ~2 MB; anything far past that is not a product photo. */
const MAX_DOWNLOAD_BYTES = 8 * 1024 * 1024;
/** Random-suffix pictures to download for the renderer's "tallest" choice — keeps one code to ~8 MB at worst. */
const MAX_CANDIDATES = 4;
const LIST_TIMEOUT_MS = 10_000;
const FILE_TIMEOUT_MS = 30_000;

export interface TasnifCandidate {
  bytes: Uint8Array;
  sourceName: string;
}

export type TasnifPictureResult =
  /**
   * One candidate when the code has a numbered (front) picture; otherwise every random-suffix one,
   * up to MAX_CANDIDATES, for the renderer to pick the tallest (same rule as the seed, pickUpright).
   */
  | { status: 'found'; candidates: TasnifCandidate[] }
  /** tasnif answered and has no usable picture — safe to remember. */
  | { status: 'none' }
  /** Offline, timed out, or tasnif misbehaved — remember nothing, try another day. */
  | { status: 'error'; message: string };

export async function fetchTasnifPicture(
  mxik: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TasnifPictureResult> {
  try {
    const listRes = await fetchImpl(
      `${TASNIF_PICTURES}/mxik/picture-names?mxik_code=${encodeURIComponent(mxik)}`,
      { signal: AbortSignal.timeout(LIST_TIMEOUT_MS) },
    );
    if (!listRes.ok) return { status: 'error', message: `picture-names HTTP ${listRes.status}` };
    const names: unknown = await listRes.json();
    if (!Array.isArray(names)) return { status: 'error', message: 'picture-names: not a list' };

    const ordered = preferredPictureOrder(
      names.filter((n): n is string => typeof n === 'string' && n.length > 0),
    );
    const candidates: TasnifCandidate[] = [];
    let httpFailure: string | null = null;
    for (const name of ordered) {
      const numbered = isNumberedPictureName(name);
      if (!numbered && candidates.length >= MAX_CANDIDATES) break;
      const fileRes = await fetchImpl(`${TASNIF_PICTURES}/file/${encodeURIComponent(name)}`, {
        signal: AbortSignal.timeout(FILE_TIMEOUT_MS),
      });
      if (!fileRes.ok) {
        httpFailure = `file HTTP ${fileRes.status}`;
        continue;
      }
      const bytes = new Uint8Array(await fileRes.arrayBuffer());
      // A missing file is HTTP 200 with a placeholder (SVG for .png names) — the bytes decide.
      if (bytes.length > MAX_DOWNLOAD_BYTES || !sniffImageMime(bytes)) continue;
      // Numbered names come first: the first usable one is the front shot, nothing to compare.
      if (numbered) return { status: 'found', candidates: [{ bytes, sourceName: name }] };
      candidates.push({ bytes, sourceName: name });
    }
    if (candidates.length) return { status: 'found', candidates };
    // Only "every listed file is not a picture" is a real "none"; a server error is not.
    return httpFailure ? { status: 'error', message: httpFailure } : { status: 'none' };
  } catch (error) {
    return { status: 'error', message: (error as Error).message };
  }
}
