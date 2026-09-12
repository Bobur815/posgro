import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * Products deleted on the web dashboard, applied at the till against a real SQLite database.
 *
 * A hard delete on the server leaves nothing in the `updatedAfter` pull, so the till used to keep
 * the product for good. Now it asks for deletions: a product nothing references is deleted; one
 * that local history points at is deactivated, so the history stays whole.
 */

const dataDir = mkdtempSync(join(tmpdir(), 'posgro-deleted-sync-'));
jest.setTimeout(30_000);

jest.mock('electron', () => ({
  app: {
    getPath: () => dataDir,
    getAppPath: () => require('path').join(__dirname, '..', '..', '..'),
  },
}));
jest.mock('../config/app-config', () => ({
  getAppConfig: () => ({ vpsApiUrl: 'https://vps.test/api' }),
}));
jest.mock('./queue-manager', () => ({ getServerToken: () => 'server-token' }));

import { initializeDatabase, closeDatabase, getPrismaClient } from '../database/sqlite-client';
import { syncDeletedProducts, type PullSource } from './products-sync';

const db = () => getPrismaClient();
let requested: string[] = [];

/** The server's deletion feed, answering `rows` (or a status with no body). */
function serve(rows: Array<{ barcode: string; deletedAt: string }> | number) {
  requested = [];
  global.fetch = jest.fn(async (url: string) => {
    requested.push(String(url));
    if (typeof rows === 'number') return { ok: false, status: rows, statusText: 'x', json: async () => ({}) };
    return { ok: true, status: 200, statusText: 'OK', json: async () => rows };
  }) as unknown as typeof fetch;
}

async function product(barcode: string) {
  const category = await db().category.findFirst();
  return db().product.create({
    data: { barcode, nameRu: barcode, nameUz: barcode, price: 1000, stock: 5, categoryId: category.id },
  });
}

beforeAll(async () => {
  await initializeDatabase();
  await db().category.create({ data: { nameRu: 'Фрукты', nameUz: 'Mevalar' } });
});

afterAll(async () => {
  await closeDatabase();
  rmSync(dataDir, { recursive: true, force: true });
});

describe('syncDeletedProducts', () => {
  it('deletes a product nothing here references', async () => {
    await product('PEACH');
    serve([{ barcode: 'PEACH', deletedAt: '2026-09-12T06:00:00.000Z' }]);

    await expect(syncDeletedProducts()).resolves.toBe(1);
    expect(await db().product.findUnique({ where: { barcode: 'PEACH' } })).toBeNull();
    expect(requested[0]).toBe(
      `https://vps.test/api/products/deleted?since=${encodeURIComponent(new Date(0).toISOString())}`,
    );
  });

  it('deactivates one that local history points at, and keeps the history', async () => {
    const p = await product('PLUM');
    await db().inventoryArrival.create({
      data: { productId: p.id, quantity: 3, cost: 500, totalCost: 1500, createdBy: 'admin' },
    });
    serve([{ barcode: 'PLUM', deletedAt: '2026-09-12T07:00:00.000Z' }]);

    await syncDeletedProducts();
    const plum = await db().product.findUnique({ where: { barcode: 'PLUM' } });
    expect(plum).toMatchObject({ active: false });
    expect(await db().inventoryArrival.count({ where: { productId: p.id } })).toBe(1);
  });

  it('moves its cursor to the newest server time seen, and asks from there', async () => {
    const cursor = await db().systemSetting.findUnique({ where: { key: 'last_product_delete_sync' } });
    expect(cursor?.value).toBe('2026-09-12T07:00:00.000Z');

    serve([]);
    await syncDeletedProducts();
    expect(requested[0]).toContain(`since=${encodeURIComponent('2026-09-12T07:00:00.000Z')}`);
  });

  it('leaves products the feed does not name alone', async () => {
    await product('APPLE');
    serve([{ barcode: 'NOT-HERE', deletedAt: '2026-09-12T08:00:00.000Z' }]);
    await expect(syncDeletedProducts()).resolves.toBe(0);
    expect(await db().product.findUnique({ where: { barcode: 'APPLE' } })).toMatchObject({ active: true });
  });

  it('treats a server without the feed (404) as nothing to do', async () => {
    serve(404);
    await expect(syncDeletedProducts()).resolves.toBe(0);
    expect(await db().product.findUnique({ where: { barcode: 'APPLE' } })).toMatchObject({ active: true });
  });

  it('does nothing on a satellite, whose catalog comes from its main', async () => {
    serve([{ barcode: 'APPLE', deletedAt: '2026-09-12T09:00:00.000Z' }]);
    const main: PullSource = { isVps: false, get: jest.fn() };
    await expect(syncDeletedProducts(main)).resolves.toBe(0);
    expect(main.get).not.toHaveBeenCalled();
    expect(await db().product.findUnique({ where: { barcode: 'APPLE' } })).toMatchObject({ active: true });
  });
});
