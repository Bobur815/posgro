import { mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { ImageSeedManifest } from './image-bytes';

// Real SQLite through the real schema setup: the tables are raw SQL, so only a real database
// proves the DDL, the upserts and the BLOB round-trip.
jest.setTimeout(30_000);

const dataDir = mkdtempSync(join(tmpdir(), 'posgro-images-'));
const appRoot = mkdtempSync(join(tmpdir(), 'posgro-images-app-'));
const seedDir = join(appRoot, 'prisma', 'seed', 'images');

// Packaged mode with resourcesPath at a temp folder: the boot-time import in initializeDatabase
// then reads this test's seed, not the repo's real prisma/seed/images. getAppPath stays the repo
// root because sqlite-client.ts requires the generated client relative to it.
Object.defineProperty(process, 'resourcesPath', { value: appRoot, configurable: true });

jest.mock('electron', () => ({
  app: {
    getPath: () => dataDir,
    getAppPath: () => join(__dirname, '..', '..', '..'),
    isPackaged: true,
  },
}));

import { closeDatabase, getPrismaClient, initializeDatabase } from '../database/sqlite-client';
import {
  checkImage,
  getCategoryImage,
  getMxikImage,
  getProductImage,
  importImageSeed,
  mxikNeedsFetch,
  MXIK_NONE_RECHECK_MS,
  removeEntityImage,
  saveFetchedMxikImage,
  setEntityImage,
} from './image-store';

// Minimal but real headers — checkImage sniffs them.
const webp = (tag: string) =>
  Buffer.concat([Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'latin1'), Buffer.from(tag)]);
const png = (tag: string) =>
  Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from(tag)]);

const COLA = '02202002001010009';
const PEPSI = '02202002001039038';
const BREAD = '01905002004173001';
const GENERIC = '01905007001000000';

function writeSeed(
  generatedAt: string,
  pictures: Record<string, string>,
  none: string[],
  categories: Record<string, string>,
  blocked: string[] = [],
) {
  mkdirSync(join(seedDir, 'mxik'), { recursive: true });
  mkdirSync(join(seedDir, 'category'), { recursive: true });
  const manifest: ImageSeedManifest = {
    generatedAt,
    mxik: [],
    mxikNone: none,
    mxikBlocked: blocked,
    categories: [],
  };
  for (const [mxik, tag] of Object.entries(pictures)) {
    writeFileSync(join(seedDir, 'mxik', `${mxik}.webp`), webp(tag));
    manifest.mxik.push({ mxik, file: `mxik/${mxik}.webp`, sourceName: `${mxik}_1.png` });
  }
  for (const [nameKey, tag] of Object.entries(categories)) {
    const file = `category/${tag}.webp`;
    writeFileSync(join(seedDir, file), webp(tag));
    manifest.categories.push({ nameKey, file });
  }
  writeFileSync(join(seedDir, 'manifest.json'), JSON.stringify(manifest));
}

const tagOf = (img: { data: Buffer } | null) => (img ? img.data.subarray(16).toString() : null);
const db = () => getPrismaClient();

// Callers pass what identifies a product or category on every till — barcode/MXIK, names.
const cola = { barcode: '4780000000017', mxik: COLA };
const generic = { barcode: '4780000000024', mxik: GENERIC };
const noMxik = { barcode: '4780000000031', mxik: null };
const household = { nameUz: 'Uy-ro‘zg‘or', nameRu: 'Бытовые товары' };
const drinks = { nameUz: 'Yangi', nameRu: 'Напитки' };
const other = { nameUz: 'Boshqa', nameRu: 'Прочее' };

beforeAll(async () => {
  await initializeDatabase();
});

afterAll(async () => {
  await closeDatabase();
});

describe('installer seed', () => {
  it('imports pictures, "none" codes and categories once per seed', async () => {
    writeSeed('2026-10-02T00:00:00.000Z', { [COLA]: 'cola-v1', [PEPSI]: 'pepsi-v1' }, [BREAD], {
      "uy-ro'zg'or": 'cat-uy',
      напитки: 'cat-drinks',
    });
    expect(await importImageSeed(db(), seedDir)).toBe(true);
    expect(await importImageSeed(db(), seedDir)).toBe(false);

    expect(tagOf(await getMxikImage(db(), COLA))).toBe('cola-v1');
    expect(await mxikNeedsFetch(db(), BREAD, new Date('2026-10-03'))).toBe(false);
  });

  it('a newer seed replaces seed pictures but never one this till fetched', async () => {
    await saveFetchedMxikImage(db(), PEPSI, checkImage(webp('pepsi-fetched')), 'x.jpg');
    writeSeed('2026-11-01T00:00:00.000Z', { [COLA]: 'cola-v2', [PEPSI]: 'pepsi-v2' }, [], {
      напитки: 'cat-drinks-2',
    });
    expect(await importImageSeed(db(), seedDir)).toBe(true);

    expect(tagOf(await getMxikImage(db(), COLA))).toBe('cola-v2');
    expect(tagOf(await getMxikImage(db(), PEPSI))).toBe('pepsi-fetched');
    // Category seed is replaced wholesale: the dropped "uy-ro'zg'or" picture is gone.
    expect(await getCategoryImage(db(), household)).toBeNull();
    expect(tagOf(await getCategoryImage(db(), drinks))).toBe('cat-drinks-2');
  });

  it('does nothing without a seed', async () => {
    expect(await importImageSeed(db(), join(appRoot, 'missing'))).toBe(false);
  });
});

describe('resolution order', () => {
  it('product: own picture, then its MXIK picture; generic and missing MXIK get none', async () => {
    expect(tagOf(await getProductImage(db(), cola))).toBe('cola-v2');
    expect(await getProductImage(db(), generic)).toBeNull();
    expect(await getProductImage(db(), noMxik)).toBeNull();

    await setEntityImage(db(), 'product', cola.barcode, checkImage(png('own'))!);
    const own = await getProductImage(db(), cola);
    expect(own?.mime).toBe('image/png');
    expect(own?.data.subarray(8).toString()).toBe('own');
    // Keyed by barcode: another product on the same MXIK keeps the MXIK picture.
    expect(tagOf(await getProductImage(db(), { barcode: '4780000000048', mxik: COLA }))).toBe(
      'cola-v2',
    );

    await removeEntityImage(db(), 'product', cola.barcode);
    expect(tagOf(await getProductImage(db(), cola))).toBe('cola-v2');
  });

  it('category: own picture, then the seed by nameUz, then by nameRu', async () => {
    writeSeed('2026-12-01T00:00:00.000Z', {}, [], { "uy-ro'zg'or": 'by-uz', прочее: 'by-ru' });
    await importImageSeed(db(), seedDir);
    // nameUz "Uy-ro‘zg‘or" (typographic apostrophes) matches the key "uy-ro'zg'or".
    expect(tagOf(await getCategoryImage(db(), household))).toBe('by-uz');
    expect(tagOf(await getCategoryImage(db(), other))).toBe('by-ru');

    // Own picture keyed by the normalised nameUz: spelling variants of the name find it.
    await setEntityImage(db(), 'category', "uy-ro'zg'or ", checkImage(webp('mine'))!);
    expect(tagOf(await getCategoryImage(db(), household))).toBe('mine');
  });
});

describe('fetching on the till', () => {
  const now = new Date('2026-12-15T00:00:00.000Z');

  it('asks for unknown codes, never for generic or pictured ones', async () => {
    expect(await mxikNeedsFetch(db(), '02202002001039023', now)).toBe(true);
    expect(await mxikNeedsFetch(db(), GENERIC, now)).toBe(false);
    expect(await mxikNeedsFetch(db(), COLA, now)).toBe(false);
  });

  it('a "none" answer stands for 30 days and never wipes a picture', async () => {
    const code = '02202002001039045';
    await saveFetchedMxikImage(db(), code, null, null, now);
    expect(
      await mxikNeedsFetch(db(), code, new Date(now.getTime() + MXIK_NONE_RECHECK_MS - 1)),
    ).toBe(false);
    expect(await mxikNeedsFetch(db(), code, new Date(now.getTime() + MXIK_NONE_RECHECK_MS))).toBe(
      true,
    );

    await saveFetchedMxikImage(db(), COLA, null, null, now);
    expect(tagOf(await getMxikImage(db(), COLA))).toBe('cola-v2');
  });
});

describe('blocked codes', () => {
  const code = '02202002001154156';
  const t0 = new Date('2027-01-01T00:00:00.000Z');

  it('a block removes a fetched picture, stops fetching for good, and ignores later fetches', async () => {
    await saveFetchedMxikImage(db(), code, checkImage(webp('cap-from-above')), 'x_ab.jpg', t0);
    writeSeed('2027-01-02T00:00:00.000Z', {}, [], {}, [code]);
    await importImageSeed(db(), seedDir);

    expect(await getMxikImage(db(), code)).toBeNull();
    const muchLater = new Date(t0.getTime() + 10 * MXIK_NONE_RECHECK_MS);
    expect(await mxikNeedsFetch(db(), code, muchLater)).toBe(false);
    await saveFetchedMxikImage(db(), code, checkImage(webp('again')), 'x_ab.jpg', muchLater);
    expect(await getMxikImage(db(), code)).toBeNull();
  });

  it('a later seed with a reviewed picture lifts the block', async () => {
    writeSeed('2027-02-01T00:00:00.000Z', { [code]: 'upright' }, [], {});
    await importImageSeed(db(), seedDir);
    expect(tagOf(await getMxikImage(db(), code))).toBe('upright');
  });
});

describe('checkImage', () => {
  it('rejects SVG, empty and oversized input', () => {
    expect(checkImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(checkImage(Buffer.alloc(0))).toBeNull();
    expect(checkImage(Buffer.concat([webp('x'), Buffer.alloc(600 * 1024)]))).toBeNull();
    expect(checkImage(webp('x'))?.mime).toBe('image/webp');
  });
});
