import { ipcMain } from 'electron';
import { getPrismaClient } from '../database/sqlite-client';
import { getCurrentUser } from './auth-handlers';
import {
  checkImage,
  getEntityImage,
  mxikNeedsFetch,
  removeEntityImage,
  saveFetchedMxikImage,
  setEntityImage,
  type ImageEntity,
} from '../images/image-store';
import { fetchTasnifPicture } from '../images/tasnif-pictures';

/**
 * Product and category pictures (images/image-store.ts). Everything stays in this till's SQLite:
 * nothing here talks to the VPS, and nothing is queued for sync.
 *
 * The renderer shows pictures through the `posimg:` protocol (images/images-protocol.ts); these
 * handlers only fill and change what it serves.
 */

export type FetchMxikResult =
  | { status: 'found'; candidates: Array<{ bytes: Uint8Array; sourceName: string }> }
  /** Nothing to do: a generic code, a code this till already has, or a recent "none". */
  | { status: 'skip' }
  | { status: 'none' }
  | { status: 'error' };

/** tasnif is a government service a till shares with every other shop — two requests at most. */
const MAX_PARALLEL_FETCHES = 2;
let running = 0;
const waiting: Array<() => void> = [];
const inFlight = new Map<string, Promise<FetchMxikResult>>();

async function withSlot<T>(task: () => Promise<T>): Promise<T> {
  if (running >= MAX_PARALLEL_FETCHES) await new Promise<void>((resolve) => waiting.push(resolve));
  running++;
  try {
    return await task();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

async function fetchMxik(mxik: string): Promise<FetchMxikResult> {
  const prisma = getPrismaClient();
  if (!(await mxikNeedsFetch(prisma, mxik))) return { status: 'skip' };
  const result = await withSlot(() => fetchTasnifPicture(mxik));
  if (result.status === 'found') return result;
  if (result.status === 'none') {
    await saveFetchedMxikImage(prisma, mxik, null, null);
    return { status: 'none' };
  }
  console.warn(`[images] tasnif ${mxik}: ${result.message}`);
  return { status: 'error' };
}

function assertAdmin(): void {
  const user = getCurrentUser();
  if (!user || user.role !== 'ADMIN') throw new Error('Unauthorized');
}

function assertEntity(type: unknown): asserts type is ImageEntity {
  if (type !== 'product' && type !== 'category') throw new Error('Unknown picture owner');
}

export function setupImagesHandlers(): void {
  /**
   * The original picture tasnif has for `mxik`, for the renderer to shrink and hand back through
   * `images:saveMxik`. A "none" answer is recorded here; an error is not, so it is tried again.
   */
  ipcMain.handle('images:fetchMxik', (_event, mxik: string): Promise<FetchMxikResult> => {
    const existing = inFlight.get(mxik);
    if (existing) return existing;
    const job = fetchMxik(String(mxik)).finally(() => inFlight.delete(mxik));
    inFlight.set(mxik, job);
    return job;
  });

  /** Store the shrunk picture for `mxik`. Any signed-in role: the fill runs while a cashier sells. */
  ipcMain.handle(
    'images:saveMxik',
    async (_event, mxik: string, bytes: Uint8Array, sourceName: string): Promise<boolean> => {
      if (!getCurrentUser()) throw new Error('Unauthorized');
      const image = checkImage(bytes);
      if (!image) return false;
      await saveFetchedMxikImage(getPrismaClient(), String(mxik), image, String(sourceName ?? ''));
      return true;
    },
  );

  /** An admin's own picture for a product (key = barcode) or category (key = nameUz). */
  ipcMain.handle(
    'images:setOwn',
    async (_event, type: ImageEntity, key: string, bytes: Uint8Array): Promise<void> => {
      assertAdmin();
      assertEntity(type);
      const image = checkImage(bytes);
      if (!image) throw new Error('Not a JPEG, PNG or WebP picture, or larger than 512 KB');
      await setEntityImage(getPrismaClient(), type, String(key), image);
    },
  );

  ipcMain.handle(
    'images:removeOwn',
    async (_event, type: ImageEntity, key: string): Promise<void> => {
      assertAdmin();
      assertEntity(type);
      await removeEntityImage(getPrismaClient(), type, String(key));
    },
  );

  /** Whether the product/category has its own picture (the form shows "remove" only then). */
  ipcMain.handle(
    'images:hasOwn',
    async (_event, type: ImageEntity, key: string): Promise<boolean> => {
      assertEntity(type);
      return (await getEntityImage(getPrismaClient(), type, String(key))) !== null;
    },
  );
}
