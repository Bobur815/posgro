/**
 * Write-offs on the till, against a real SQLite file: the shared module the POS page and the
 * dashboard route both call. Booted the way local-server.integration.test.ts boots, without
 * Electron.
 */
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const dataDir = mkdtempSync(join(tmpdir(), 'posgro-write-offs-'));

jest.setTimeout(60_000);

jest.mock('../logger', () => ({
  log: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  flushLogs: () => [],
}));

jest.mock('electron', () => ({
  app: {
    getPath: () => dataDir,
    getAppPath: () => join(__dirname, '..', '..', '..'),
  },
}));

import { initializeDatabase, closeDatabase, getPrismaClient } from '../database/sqlite-client';
import { createWriteOff, getWriteOff, listWriteOffs, parseWriteOffInput } from './write-offs';

const admin = { id: 'user-admin' };
let milk = 0;
let cheese = 0;

async function setMode(mode: 'OFFLINE_ONLY' | 'ONLINE', isMain = true) {
  await getPrismaClient().localConfig.update({ where: { id: 'config' }, data: { mode, isMain } });
}

async function stockOf(id: number): Promise<number> {
  const p = await getPrismaClient().product.findUnique({ where: { id } });
  return Number(p.stock);
}

beforeAll(async () => {
  await initializeDatabase();
  const prisma = getPrismaClient();
  await prisma.localConfig.upsert({
    where: { id: 'config' },
    update: { mode: 'OFFLINE_ONLY' },
    create: {
      id: 'config',
      storeId: 'store-test',
      storeName: 'Test Shop',
      terminalId: 'T1',
      apiUrl: 'http://localhost',
      mode: 'OFFLINE_ONLY',
    },
  });
  await prisma.user.create({
    data: {
      id: admin.id,
      phone: '+998900000001',
      password: 'x',
      role: 'ADMIN',
      nameRu: 'Админ',
      nameUz: 'Admin',
      active: true,
      storeId: 'store-test',
    },
  });
  const category = await prisma.category.create({
    data: { nameRu: 'Молочка', nameUz: 'Sut mahsulotlari' },
  });
  milk = (
    await prisma.product.create({
      data: {
        barcode: '4780000000011',
        nameRu: 'Молоко',
        nameUz: 'Sut',
        price: 12000,
        cost: 9000,
        stock: 10,
        unit: 'шт',
        categoryId: category.id,
      },
    })
  ).id;
  cheese = (
    await prisma.product.create({
      data: {
        barcode: '4780000000028',
        nameRu: 'Сыр',
        nameUz: 'Pishloq',
        price: 90000,
        stock: 2.5,
        unit: 'кг',
        categoryId: category.id,
      },
    })
  ).id;
});

afterAll(async () => {
  await closeDatabase();
  rmSync(dataDir, { recursive: true, force: true });
});

describe('createWriteOff on an OFFLINE_ONLY main terminal', () => {
  it('posts the document, numbers it and takes the goods out of stock', async () => {
    const result = await createWriteOff(
      {
        reason: 'EXPIRY',
        items: [
          { productId: milk, quantity: 3 },
          { productId: cheese, quantity: 0.5 },
        ],
      },
      admin,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      number: 1,
      reason: 'EXPIRY',
      createdByName: 'Админ',
      totalItems: 2,
    });
    expect(Number(result.value.totalValue)).toBe(27000); // 3 × 9000; cheese has no cost
    expect(result.value.items).toHaveLength(2);
    expect(await stockOf(milk)).toBe(7);
    expect(await stockOf(cheese)).toBe(2);
  });

  it('returns the same document for a retried id and takes nothing twice', async () => {
    const input = {
      id: 'client-retry',
      reason: 'DAMAGE' as const,
      items: [{ productId: milk, quantity: 1 }],
    };
    const first = await createWriteOff(input, admin);
    const again = await createWriteOff(input, admin);
    expect(first.ok && again.ok && again.value.id).toBe('client-retry');
    expect(first.ok && again.ok && again.value.number).toBe(first.ok ? first.value.number : -1);
    expect(await stockOf(milk)).toBe(6);
  });

  it('refuses more than in stock and leaves stock and numbering alone', async () => {
    const before = await listWriteOffs({});
    const result = await createWriteOff(
      { reason: 'DAMAGE', items: [{ productId: milk, quantity: 7 }] },
      admin,
    );
    expect(result).toMatchObject({
      ok: false,
      status: 400,
      refusal: { code: 'EXCEEDS_STOCK', stock: '6', quantity: '7' },
    });
    expect(await stockOf(milk)).toBe(6);
    expect((await listWriteOffs({})).total).toBe(before.total);
  });

  it('requires a note for OTHER and keeps it', async () => {
    const missing = await createWriteOff(
      { reason: 'OTHER', items: [{ productId: milk, quantity: 1 }] },
      admin,
    );
    expect(missing).toMatchObject({ ok: false, refusal: { code: 'NOTE_REQUIRED' } });
    const ok = await createWriteOff(
      { reason: 'OTHER', note: ' Kalamush ', items: [{ productId: milk, quantity: 1 }] },
      admin,
    );
    expect(ok.ok && ok.value.note).toBe('Kalamush');
  });

  it('lists newest first, filters by reason and finds one by id', async () => {
    const all = await listWriteOffs({});
    expect(all.rows.map((r) => r.number)).toEqual(
      [...all.rows.map((r) => r.number)].sort((a, b) => b - a),
    );
    const damage = await listWriteOffs({ reason: 'DAMAGE' });
    expect(damage.rows.every((r) => r.reason === 'DAMAGE')).toBe(true);
    const one = await getWriteOff(all.rows[0].id);
    expect(one.ok).toBe(true);
    expect(await getWriteOff('nope')).toMatchObject({ ok: false, status: 404 });
  });
});

describe('where write-offs are refused', () => {
  afterEach(() => setMode('OFFLINE_ONLY'));

  it('refuses on an ONLINE store, which writes off on the web', async () => {
    await setMode('ONLINE');
    const result = await createWriteOff(
      { reason: 'DAMAGE', items: [{ productId: milk, quantity: 1 }] },
      admin,
    );
    expect(result).toMatchObject({ ok: false, status: 403 });
    expect(await stockOf(milk)).toBe(5);
  });

  it('refuses on a satellite, whose stock lives on its main', async () => {
    await setMode('OFFLINE_ONLY', false);
    const result = await createWriteOff(
      { reason: 'DAMAGE', items: [{ productId: milk, quantity: 1 }] },
      admin,
    );
    expect(result).toMatchObject({ ok: false, status: 403 });
  });
});

describe('parseWriteOffInput', () => {
  it('accepts a well-formed body and rejects the rest', () => {
    expect(
      parseWriteOffInput({ reason: 'EXPIRY', items: [{ productId: '5', quantity: '1.5' }] }),
    ).toEqual({
      id: undefined,
      reason: 'EXPIRY',
      note: null,
      items: [{ productId: 5, quantity: 1.5 }],
    });
    expect(parseWriteOffInput({ reason: 'LOST', items: [{ productId: 1, quantity: 1 }] })).toBe(
      'Invalid reason',
    );
    expect(parseWriteOffInput({ reason: 'EXPIRY', items: [] })).toBe('items must list 1–500 lines');
    expect(parseWriteOffInput({ reason: 'EXPIRY', items: [{ productId: 1.5, quantity: 1 }] })).toBe(
      'Invalid line',
    );
  });
});
