// Product and category pictures, kept only in this till's SQLite file — never uploaded, never
// synced, never on the VPS.
//
// Three tables (created by createSchemaIfNeeded, every boot, IF NOT EXISTS):
//   mxik_images           one picture per MXIK: from the installer seed or fetched from tasnif here.
//                         `data IS NULL` means "tasnif had none at checked_at" — asked again later.
//   category_seed_images  pre-filled category pictures, matched on categoryNameKey(name).
//   entity_images         pictures an admin set on this till for one product or category; win over both.
//
// A product shows: its own picture → its MXIK's picture → nothing.
// A category shows: its own picture → the seed by nameUz → the seed by nameRu → nothing.
//
// Own pictures are keyed by what is the same on every till, never by row id: a product by its
// barcode, a category by categoryNameKey(nameUz). A LAN satellite shows the main's products, and
// its ids for the same products can differ (lan/satellite-cache.ts) — an id key would put one
// product's picture on another. Callers pass the barcode/MXIK/names, so nothing here reads the
// products or categories tables. Changing a barcode or renaming a category drops its own picture.
import * as fs from 'fs';
import * as path from 'path';
import type { getPrismaClient } from '../database/sqlite-client';
import {
  categoryNameKey,
  sniffImageMime,
  wantsMxikPicture,
  type ImageMime,
  type ImageSeedManifest,
} from './image-bytes';

// The SQLite client is require()d (sqlite-client.ts), so this is the repo's usual alias for it.
type PrismaClientType = ReturnType<typeof getPrismaClient>;

export type ImageEntity = 'product' | 'category';

export interface StoredImage {
  data: Buffer;
  mime: ImageMime;
}

/** How long a "tasnif has no picture" answer stands before this till asks again. */
export const MXIK_NONE_RECHECK_MS = 30 * 24 * 60 * 60 * 1000;

/** Largest picture accepted from the renderer — a 256px WebP is ~2–20 KB; this only stops accidents. */
export const MAX_IMAGE_BYTES = 512 * 1024;

const SEED_SETTING_KEY = 'image_seed_imported';

export async function createImageTables(prisma: PrismaClientType): Promise<void> {
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS mxik_images (
      mxik TEXT PRIMARY KEY,
      data BLOB,
      mime TEXT,
      source TEXT NOT NULL,
      source_name TEXT,
      checked_at TEXT NOT NULL
    )
  `;
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS category_seed_images (
      name_key TEXT PRIMARY KEY,
      data BLOB NOT NULL,
      mime TEXT NOT NULL
    )
  `;
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS entity_images (
      entity_type TEXT NOT NULL,
      entity_key TEXT NOT NULL,
      data BLOB NOT NULL,
      mime TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (entity_type, entity_key)
    )
  `;
}

/** A picture from the renderer or tasnif, or null when the bytes are not one we store. */
export function checkImage(bytes: Uint8Array): StoredImage | null {
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) return null;
  const mime = sniffImageMime(bytes);
  return mime ? { data: Buffer.from(bytes), mime } : null;
}

interface ImageRow {
  data: Uint8Array | null;
  mime: string | null;
}

function toStored(row: ImageRow | undefined): StoredImage | null {
  if (!row?.data || !row.mime) return null;
  return { data: Buffer.from(row.data), mime: row.mime as ImageMime };
}

/** A product's own-picture key is its barcode; a category's is categoryNameKey(nameUz). */
export function entityKey(type: ImageEntity, keySource: string): string {
  return type === 'category' ? categoryNameKey(keySource) : keySource.trim();
}

export async function getEntityImage(
  prisma: PrismaClientType,
  type: ImageEntity,
  keySource: string,
): Promise<StoredImage | null> {
  const key = entityKey(type, keySource);
  if (!key) return null;
  const rows = await prisma.$queryRaw<ImageRow[]>`
    SELECT data, mime FROM entity_images WHERE entity_type = ${type} AND entity_key = ${key}
  `;
  return toStored(rows[0]);
}

export async function getMxikImage(
  prisma: PrismaClientType,
  mxik: string,
): Promise<StoredImage | null> {
  if (!wantsMxikPicture(mxik)) return null;
  const rows = await prisma.$queryRaw<ImageRow[]>`
    SELECT data, mime FROM mxik_images WHERE mxik = ${mxik}
  `;
  return toStored(rows[0]);
}

export async function getProductImage(
  prisma: PrismaClientType,
  product: { barcode: string; mxik?: string | null },
): Promise<StoredImage | null> {
  const own = await getEntityImage(prisma, 'product', product.barcode);
  if (own) return own;
  return product.mxik ? getMxikImage(prisma, product.mxik) : null;
}

export async function getCategoryImage(
  prisma: PrismaClientType,
  category: { nameUz: string; nameRu?: string | null },
): Promise<StoredImage | null> {
  const own = await getEntityImage(prisma, 'category', category.nameUz);
  if (own) return own;
  for (const name of [category.nameUz, category.nameRu]) {
    if (!name) continue;
    const rows = await prisma.$queryRaw<ImageRow[]>`
      SELECT data, mime FROM category_seed_images WHERE name_key = ${categoryNameKey(name)}
    `;
    const seeded = toStored(rows[0]);
    if (seeded) return seeded;
  }
  return null;
}

/**
 * Whether this till should ask tasnif for `mxik`: never for a generic code, never when it already
 * has a picture, never for a code the seed blocked (every tasnif picture judged wrong in review),
 * and for a "none" answer only once it is older than MXIK_NONE_RECHECK_MS.
 */
export async function mxikNeedsFetch(
  prisma: PrismaClientType,
  mxik: string,
  now: Date = new Date(),
): Promise<boolean> {
  if (!wantsMxikPicture(mxik)) return false;
  const rows = await prisma.$queryRaw<
    Array<{ has_data: number | bigint; source: string; checked_at: string }>
  >`
    SELECT data IS NOT NULL AS has_data, source, checked_at FROM mxik_images WHERE mxik = ${mxik}
  `;
  const row = rows[0];
  if (!row) return true;
  if (Number(row.has_data) || row.source === 'blocked') return false;
  const checked = Date.parse(row.checked_at);
  return Number.isNaN(checked) || now.getTime() - checked >= MXIK_NONE_RECHECK_MS;
}

/** Record what tasnif gave this till for `mxik`: a picture, or `null` for "none". */
export async function saveFetchedMxikImage(
  prisma: PrismaClientType,
  mxik: string,
  image: StoredImage | null,
  sourceName: string | null,
  now: Date = new Date(),
): Promise<void> {
  if (!wantsMxikPicture(mxik)) return;
  const data = image?.data ?? null;
  const mime = image?.mime ?? null;
  // A "none" answer never wipes a picture this till already has (a seed row, or an earlier fetch),
  // and nothing fetched replaces a block.
  await prisma.$executeRaw`
    INSERT INTO mxik_images (mxik, data, mime, source, source_name, checked_at)
    VALUES (${mxik}, ${data}, ${mime}, 'tasnif', ${sourceName}, ${now.toISOString()})
    ON CONFLICT(mxik) DO UPDATE SET
      data = COALESCE(excluded.data, mxik_images.data),
      mime = COALESCE(excluded.mime, mxik_images.mime),
      source = CASE WHEN excluded.data IS NULL THEN mxik_images.source ELSE 'tasnif' END,
      source_name = COALESCE(excluded.source_name, mxik_images.source_name),
      checked_at = excluded.checked_at
    WHERE mxik_images.source <> 'blocked'
  `;
}

/** `keySource` is the product's barcode or the category's nameUz (see entityKey). */
export async function setEntityImage(
  prisma: PrismaClientType,
  type: ImageEntity,
  keySource: string,
  image: StoredImage,
  now: Date = new Date(),
): Promise<void> {
  const key = entityKey(type, keySource);
  if (!key) throw new Error('A picture needs a barcode or a category name');
  await prisma.$executeRaw`
    INSERT INTO entity_images (entity_type, entity_key, data, mime, updated_at)
    VALUES (${type}, ${key}, ${image.data}, ${image.mime}, ${now.toISOString()})
    ON CONFLICT(entity_type, entity_key) DO UPDATE SET
      data = excluded.data, mime = excluded.mime, updated_at = excluded.updated_at
  `;
}

export async function removeEntityImage(
  prisma: PrismaClientType,
  type: ImageEntity,
  keySource: string,
): Promise<void> {
  const key = entityKey(type, keySource);
  await prisma.$executeRaw`
    DELETE FROM entity_images WHERE entity_type = ${type} AND entity_key = ${key}
  `;
}

/**
 * Load the installer's picture seed (`prisma/seed/images/manifest.json`) into this till's tables,
 * once per seed: skipped when the manifest's `generatedAt` is the one already imported.
 *
 * - MXIK pictures replace older seed rows and "none" rows, never a picture this till fetched.
 * - "None" codes are inserted only where the till knows nothing yet.
 * - Blocked codes lose any picture and are never fetched; a later seed that has a picture for one
 *   replaces the block (it is a `data IS NULL` row).
 * - Category seed pictures are replaced wholesale (that table holds nothing else).
 *
 * Returns false when there is no seed or it was already imported. Throws on a broken seed; the
 * caller logs and boots on — pictures are never worth a till that does not start.
 */
export async function importImageSeed(prisma: PrismaClientType, seedDir: string): Promise<boolean> {
  const manifestPath = path.join(seedDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return false;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as ImageSeedManifest;
  if (!manifest.generatedAt) return false;

  const done = await prisma.systemSetting.findUnique({ where: { key: SEED_SETTING_KEY } });
  if (done?.value === manifest.generatedAt) return false;

  const read = (file: string): StoredImage | null => {
    const full = path.join(seedDir, file);
    return fs.existsSync(full) ? checkImage(fs.readFileSync(full)) : null;
  };

  // `PrismaClientType` is `any` (require()d client), so the callback parameter needs the alias spelled out.
  await prisma.$transaction(async (db: PrismaClientType) => {
    for (const entry of manifest.mxik) {
      if (!wantsMxikPicture(entry.mxik)) continue;
      const image = read(entry.file);
      if (!image) continue;
      await db.$executeRaw`
        INSERT INTO mxik_images (mxik, data, mime, source, source_name, checked_at)
        VALUES (${entry.mxik}, ${image.data}, ${image.mime}, 'seed', ${entry.sourceName}, ${manifest.generatedAt})
        ON CONFLICT(mxik) DO UPDATE SET
          data = excluded.data, mime = excluded.mime, source = 'seed',
          source_name = excluded.source_name, checked_at = excluded.checked_at
        WHERE mxik_images.source = 'seed' OR mxik_images.data IS NULL
      `;
    }
    for (const mxik of manifest.mxikNone) {
      if (!wantsMxikPicture(mxik)) continue;
      await db.$executeRaw`
        INSERT OR IGNORE INTO mxik_images (mxik, data, mime, source, source_name, checked_at)
        VALUES (${mxik}, NULL, NULL, 'seed', NULL, ${manifest.generatedAt})
      `;
    }
    // A block wins over everything, a picture this till fetched included: review judged every
    // tasnif picture for the code wrong, so the one fetched here is one of them.
    for (const mxik of manifest.mxikBlocked ?? []) {
      if (!wantsMxikPicture(mxik)) continue;
      await db.$executeRaw`
        INSERT INTO mxik_images (mxik, data, mime, source, source_name, checked_at)
        VALUES (${mxik}, NULL, NULL, 'blocked', NULL, ${manifest.generatedAt})
        ON CONFLICT(mxik) DO UPDATE SET
          data = NULL, mime = NULL, source = 'blocked', source_name = NULL,
          checked_at = excluded.checked_at
      `;
    }
    await db.$executeRaw`DELETE FROM category_seed_images`;
    for (const entry of manifest.categories) {
      const image = read(entry.file);
      if (!image) continue;
      await db.$executeRaw`
        INSERT OR REPLACE INTO category_seed_images (name_key, data, mime)
        VALUES (${categoryNameKey(entry.nameKey)}, ${image.data}, ${image.mime})
      `;
    }
    await db.systemSetting.upsert({
      where: { key: SEED_SETTING_KEY },
      create: { key: SEED_SETTING_KEY, value: manifest.generatedAt },
      update: { value: manifest.generatedAt },
    });
  });
  return true;
}
