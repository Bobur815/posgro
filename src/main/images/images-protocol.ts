import { protocol } from 'electron';
import { getPrismaClient } from '../database/sqlite-client';
import { getCategoryImage, getProductImage, type StoredImage } from './image-store';

/**
 * `posimg:` — pictures straight out of SQLite into an `<img src>`, so the browser does the lazy
 * loading and decoding and no picture ever crosses IPC as a blob.
 *
 *   posimg://product/?barcode=4780…&mxik=02202…   own picture by barcode → MXIK picture
 *   posimg://category/?uz=Ichimliklar&ru=Напитки  own picture → seed by nameUz → seed by nameRu
 *
 * Everything rides in the query: the caller already has the product/category object, and a
 * satellite's local rows (and ids) need not match the main's. Any other parameter (`v=` after a
 * picture changes) is ignored here and only busts the renderer's cache. No picture → 404, which
 * the `<img>` turns into its onError fallback.
 */
export const IMAGE_SCHEME = 'posimg';

/** Must run before `app` is ready. */
export function registerImageScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: IMAGE_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
  ]);
}

export async function resolveImageUrl(url: string): Promise<StoredImage | null> {
  const { hostname, searchParams } = new URL(url);
  const prisma = getPrismaClient();
  if (hostname === 'product') {
    const barcode = searchParams.get('barcode') ?? '';
    if (!barcode) return null;
    return getProductImage(prisma, { barcode, mxik: searchParams.get('mxik') });
  }
  if (hostname === 'category') {
    const nameUz = searchParams.get('uz') ?? '';
    if (!nameUz) return null;
    return getCategoryImage(prisma, { nameUz, nameRu: searchParams.get('ru') });
  }
  return null;
}

/** After `app` is ready and the database is open. */
export function handleImageScheme(): void {
  protocol.handle(IMAGE_SCHEME, async (request) => {
    try {
      const image = await resolveImageUrl(request.url);
      if (!image)
        return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
      return new Response(new Uint8Array(image.data), {
        headers: { 'Content-Type': image.mime, 'Cache-Control': 'max-age=3600' },
      });
    } catch (error) {
      console.error('[images] posimg failed:', error);
      return new Response(null, { status: 500, headers: { 'Cache-Control': 'no-store' } });
    }
  });
}
