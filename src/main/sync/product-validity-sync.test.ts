import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * Product.isValid on the till, against a real SQLite database: the fiscal service marks a rejected
 * product invalid, and a fiscalised one valid again, and queues a report; the upload sends the
 * queue and drops what the server took. The database is created by the real schema setup, so this
 * also proves Migrations 38/39 and the outbox table exist.
 */

const dataDir = mkdtempSync(join(tmpdir(), 'posgro-product-validity-'));
// Generous: database init alone can take tens of seconds when the whole suite runs in parallel.
jest.setTimeout(60_000);

jest.mock('electron', () => ({
  app: {
    getPath: () => dataDir,
    getAppPath: () => require('path').join(__dirname, '..', '..', '..'),
  },
}));
jest.mock('../config/app-config', () => ({
  getAppConfig: () => ({ vpsApiUrl: 'https://vps.test/api', terminalId: 'T1' }),
}));
jest.mock('./queue-manager', () => ({ getServerToken: () => 'token' }));
// product-validity imports the VCR client, which starts electron-log on import (tasks/lessons.md).
jest.mock('../logger', () => ({ log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

import { initializeDatabase, closeDatabase, getPrismaClient } from '../database/sqlite-client';
import { resetMissingEndpoints } from './missing-endpoints';
import { syncInvalidProducts } from './product-validity-sync';
import { markProductsInvalid, markProductsValid } from '../fiscal/product-validity';
import { syncProducts, type PullSource } from './products-sync';

const db = () => getPrismaClient();

type Item = { barcode: string; at: string; valid?: boolean; code?: number };
let posted: { path: string; items: Item[] }[] = [];
/** A fake VPS: `status` for both endpoints, or per endpoint (an old server 404s /validity). */
function serve(
  status: number | { validity: number; invalid: number },
  done: (barcodes: string[]) => string[] = (b) => b,
) {
  posted = [];
  global.fetch = jest.fn(async (url: string, init?: { body?: string }) => {
    const path = url.endsWith('/products/validity') ? 'validity' : 'invalid';
    const code = typeof status === 'number' ? status : status[path];
    const body = JSON.parse(init?.body ?? '{}');
    posted.push({ path, items: body.items ?? [] });
    const barcodes = (body.items ?? []).map((i: Item) => i.barcode);
    return { ok: code < 300, status: code, json: async () => ({ done: done(barcodes) }) };
  }) as unknown as typeof fetch;
}

const unsent = async () =>
  (
    (await db()
      .$queryRaw`SELECT barcode FROM product_invalid_reports WHERE sent_at IS NULL ORDER BY barcode`) as {
      barcode: string;
    }[]
  ).map((r) => r.barcode);

let productId = 0;
let categoryId = 0;

beforeAll(async () => {
  await initializeDatabase();
  const category = await db().category.create({
    data: { nameRu: 'Напитки', nameUz: 'Ichimliklar' },
  });
  const product = await db().product.create({
    data: {
      barcode: '4780047860466',
      nameRu: 'Сок',
      nameUz: 'Sharbat',
      price: 5000,
      categoryId: category.id,
    },
  });
  productId = product.id;
  categoryId = category.id;
});

beforeEach(async () => {
  resetMissingEndpoints();
  await db().$executeRaw`DELETE FROM product_invalid_reports`;
  await db().product.update({ where: { id: productId }, data: { isValid: true } });
});

afterAll(async () => {
  await closeDatabase();
  rmSync(dataDir, { recursive: true, force: true });
});

describe('a product REGOS rejected', () => {
  it('starts valid — the column default every existing product gets', async () => {
    const p = await db().product.findUnique({
      where: { id: productId },
      select: { isValid: true },
    });
    expect(p.isValid).toBe(true);
  });

  it('is marked invalid at once and queued for the server', async () => {
    await markProductsInvalid(
      [{ productId, barcode: '4780047860466' }],
      705511,
      new Date('2026-10-05T10:30:00Z'),
    );

    const p = await db().product.findUnique({
      where: { id: productId },
      select: { isValid: true },
    });
    expect(p.isValid).toBe(false);
    expect(await unsent()).toEqual(['4780047860466']);
  });

  it('is sent with when and why, and dropped from the queue once the server took it', async () => {
    await markProductsInvalid(
      [{ productId, barcode: '4780047860466' }],
      705511,
      new Date('2026-10-05T10:30:00Z'),
    );
    serve(200);

    await syncInvalidProducts();

    expect(posted).toEqual([
      {
        path: 'validity',
        items: [{ barcode: '4780047860466', at: '2026-10-05T10:30:00.000Z', valid: false, code: 705511 }],
      },
    ]);
    expect(await unsent()).toEqual([]);
  });

  // A server from before /products/validity still takes rejections through /products/invalid.
  it('falls back to the older endpoint for a rejection', async () => {
    await markProductsInvalid(
      [{ productId, barcode: '4780047860466' }],
      705511,
      new Date('2026-10-05T10:30:00Z'),
    );
    serve({ validity: 404, invalid: 200 });

    await syncInvalidProducts();

    expect(posted.map((p) => p.path)).toEqual(['validity', 'invalid']);
    expect(posted[1].items).toEqual([
      { barcode: '4780047860466', at: '2026-10-05T10:30:00.000Z', code: 705511 },
    ]);
    expect(await unsent()).toEqual([]);
  });

  // A server from before isValid: the till keeps the report and sends it once the server has it.
  it('stays queued against a server with neither endpoint', async () => {
    await markProductsInvalid([{ productId, barcode: '4780047860466' }], 705511);
    serve(404);

    await syncInvalidProducts();

    expect(await unsent()).toEqual(['4780047860466']);
  });

  it('stays queued when the server could not record it', async () => {
    await markProductsInvalid([{ productId, barcode: '4780047860466' }], 705511);
    serve(200, () => []);

    await syncInvalidProducts();

    expect(await unsent()).toEqual(['4780047860466']);
  });

  it('sends nothing when nothing is queued', async () => {
    serve(200);
    await syncInvalidProducts();
    expect(posted).toEqual([]);
  });
});

describe('a product on a fiscalised receipt', () => {
  it('becomes valid again at once and is queued for the server', async () => {
    await db().product.update({ where: { id: productId }, data: { isValid: false } });

    await markProductsValid([{ productId, barcode: '4780047860466' }], new Date('2026-10-09T09:00:00Z'));

    const p = await db().product.findUnique({ where: { id: productId }, select: { isValid: true } });
    expect(p.isValid).toBe(true);
    serve(200);
    await syncInvalidProducts();
    expect(posted[0]).toEqual({
      path: 'validity',
      items: [{ barcode: '4780047860466', at: '2026-10-09T09:00:00.000Z', valid: true }],
    });
    expect(await unsent()).toEqual([]);
  });

  it('reports a product once however many lines carried it', async () => {
    await db().product.update({ where: { id: productId }, data: { isValid: false } });
    await markProductsValid([
      { productId, barcode: '4780047860466' },
      { productId, barcode: '4780047860466' },
    ]);
    expect(await unsent()).toEqual(['4780047860466']);
  });

  // An old server cannot take it; the rejection-only fallback must leave it for the new endpoint.
  it('stays queued against a server from before /products/validity', async () => {
    await db().product.update({ where: { id: productId }, data: { isValid: false } });
    await markProductsValid([{ productId, barcode: '4780047860466' }]);
    serve({ validity: 404, invalid: 200 });

    await syncInvalidProducts();

    expect(posted.map((p) => p.path)).toEqual(['validity']);
    expect(await unsent()).toEqual(['4780047860466']);
  });
});

describe('isValid in the product pull', () => {
  /** A fake VPS answering the product pull with these rows. */
  // isVps false: the VPS-only housekeeping (id realignment) is not what is under test here.
  const source = (rows: Record<string, unknown>[]): PullSource => ({
    isVps: false,
    get: async () => ({ ok: true, statusText: "OK", json: async () => rows }),
  });
  const row = (over: Record<string, unknown> = {}) => ({
    id: productId,
    barcode: '4780047860466',
    nameRu: 'Сок',
    nameUz: 'Sharbat',
    price: 5000,
    stock: 10,
    minStock: 0,
    unit: 'шт',
    categoryId,
    active: true,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: new Date().toISOString(),
    ...over,
  });
  const isValid = async (barcode: string) =>
    (await db().product.findUnique({ where: { barcode }, select: { isValid: true } }))?.isValid;

  beforeEach(async () => {
    // Every pull starts from the beginning, so each case sees its own rows.
    await db().systemSetting.deleteMany({ where: { key: 'last_product_sync' } });
  });

  it('takes the store-wide answer from the server', async () => {
    await syncProducts(source([row({ isValid: false })]));
    expect(await isValid('4780047860466')).toBe(false);

    await syncProducts(source([row({ isValid: true })]));
    expect(await isValid('4780047860466')).toBe(true);
  });

  // A server that has not deployed isValid yet must not wipe what this till learned itself.
  it('keeps this till’s own value when the server sends none', async () => {
    await db().product.update({ where: { id: productId }, data: { isValid: false } });

    await syncProducts(source([row()]));

    expect(await isValid('4780047860466')).toBe(false);
  });

  it('creates a new product as valid when the server sends none', async () => {
    await syncProducts(source([row({ id: productId + 100, barcode: '4780047861784' })]));
    expect(await isValid('4780047861784')).toBe(true);
  });
});
