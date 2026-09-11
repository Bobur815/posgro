import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * Two tills in one process: a main terminal with its real LAN server and database, and a satellite
 * with a database of its own, talking to it over HTTP through the code the IPC handlers call.
 *
 * The satellite is loaded in an isolated module registry, so it has its own Prisma client pointed
 * at its own file — as it would on its own machine. This is as close to two monoblocks on a shop
 * LAN as a test can get; the one thing it cannot show is a real network and a real VCR.
 */

jest.setTimeout(60_000);

const mainDir = mkdtempSync(join(tmpdir(), 'posgro-e2e-main-'));
const satelliteDir = mkdtempSync(join(tmpdir(), 'posgro-e2e-satellite-'));
// Read by the electron mock at the moment a database opens, so each side opens its own.
let mockDataDir = mainDir;

jest.mock('electron', () => ({
  app: {
    getPath: () => mockDataDir,
    getAppPath: () => require('path').join(__dirname, '..', '..', '..'),
  },
}));
jest.mock('../logger', () => ({
  log: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  flushLogs: () => [],
}));
// No printer and no cash drawer here; what matters is that the satellite asks for them.
jest.mock('../printer/thermal-printer', () => ({
  printReceipt: jest.fn(async () => true),
  openCashDrawer: jest.fn(async () => undefined),
}));
jest.mock('../printer/smena-report-printer', () => ({
  printZXReport: jest.fn(async () => true),
}));

import * as bcrypt from 'bcryptjs';
import { initializeDatabase, closeDatabase, getPrismaClient } from '../database/sqlite-client';
import { startLocalServer, stopLocalServer } from '../local-server';

const PORT = 5397;
const SECRET = 'e2e-device-secret';
const WATER = '4780000000001';

/** The satellite's own copies of the modules, bound to its own database. */
type Satellite = {
  sqlite: typeof import('../database/sqlite-client');
  ops: typeof import('./satellite-ops');
  sync: typeof import('./main-sync');
  link: typeof import('./main-link');
  printer: { printReceipt: jest.Mock };
};
let sat: Satellite;
let mainWaterId = 0;

const mainDb = () => getPrismaClient();
const satDb = () => sat.sqlite.getPrismaClient();

function cartOf(localProductId: number, quantity: number) {
  return {
    items: [
      { productId: localProductId, productName: 'Вода', barcode: WATER, quantity, unitPrice: 5000, piecesPerUnit: 1 },
    ],
    paymentMethod: 'cash',
    discountAmount: 0,
  };
}

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    try {
      return JSON.parse(message.slice(message.indexOf('{'))).code;
    } catch {
      return message;
    }
  }
}

beforeAll(async () => {
  process.env.JWT_SECRET = 'integration-test-secret-key-32-chars';

  // ── The main ──
  await initializeDatabase();
  const m = mainDb();
  await m.systemSetting.create({ data: { key: 'local_web_port', value: String(PORT) } });
  await m.localConfig.create({
    data: { id: 'config', storeId: 'store-e2e', storeName: 'E2E', terminalId: 'T1', apiUrl: 'http://localhost', mode: 'ONLINE', isMain: true },
  });
  await m.user.create({
    data: {
      id: 'user-1',
      phone: '+998901112233',
      password: await bcrypt.hash('pass1234', 10),
      role: 'USER',
      nameRu: 'Кассир',
      nameUz: 'Kassir',
      storeId: 'store-e2e',
    },
  });
  const category = await m.category.create({ data: { nameRu: 'Напитки', nameUz: 'Ichimliklar' } });
  mainWaterId = (
    await m.product.create({
      data: { barcode: WATER, nameRu: 'Вода', nameUz: 'Suv', price: 5000, stock: 10, categoryId: category.id },
    })
  ).id;
  await m.pairedTerminal.create({ data: { terminalId: 'T2', secretHash: await bcrypt.hash(SECRET, 10) } });
  await startLocalServer();

  // ── The satellite ──
  jest.isolateModules(() => {
    sat = {
      sqlite: require('../database/sqlite-client'),
      ops: require('./satellite-ops'),
      sync: require('./main-sync'),
      link: require('./main-link'),
      printer: require('../printer/thermal-printer'),
    };
    require('../config/app-config').updateConfig({ terminalId: 'T2' });
  });
  mockDataDir = satelliteDir;
  await sat.sqlite.initializeDatabase();
  const s = satDb();
  await s.localConfig.create({
    data: {
      id: 'config',
      storeId: 'store-e2e',
      storeName: 'E2E',
      terminalId: 'T2',
      apiUrl: 'http://localhost',
      mode: 'ONLINE',
      isMain: false,
      mainTerminalUrl: `http://127.0.0.1:${PORT}/api`,
    },
  });
  await s.systemSetting.create({ data: { key: 'lan_device_secret', value: SECRET } });
  // A till that sold on its own before it was paired: its product ids are its own, so the main's
  // water will not get the main's id here. The satellite must still sell the right product.
  const oldCategory = await s.category.create({ data: { nameRu: 'Напитки', nameUz: 'Ichimliklar' } });
  await s.product.create({
    data: { id: mainWaterId, barcode: 'OLD-LOCAL-ONLY', nameRu: 'Старый', nameUz: 'Eski', price: 1, stock: 99, categoryId: oldCategory.id },
  });
}, 120_000);

afterAll(async () => {
  await stopLocalServer();
  await sat?.sqlite.closeDatabase();
  await closeDatabase();
  rmSync(mainDir, { recursive: true, force: true });
  rmSync(satelliteDir, { recursive: true, force: true });
});

describe('a satellite and its main', () => {
  let localWaterId = 0;
  let session = '';

  it('pulls the catalog from the main, never the VPS', async () => {
    await sat.sync.syncWithMain();

    const water = await satDb().product.findUnique({ where: { barcode: WATER } });
    expect(water).not.toBeNull();
    expect(Number(water.stock)).toBe(10);
    localWaterId = water.id;
    // The id the main uses was already taken here — which is the case the barcode mapping exists for.
    expect(localWaterId).not.toBe(mainWaterId);

    // …and reported in, as the dashboard's terminal list expects.
    const row = await mainDb().pairedTerminal.findUnique({ where: { terminalId: 'T2' } });
    expect(row.lastSeenAt).not.toBeNull();
  });

  it('signs a cashier in against the main', async () => {
    const { user, token } = await sat.ops.login('+998901112233', 'pass1234');
    expect(user).toMatchObject({ id: 'user-1', role: 'USER' });
    session = token;
  });

  it('opens its shift on the main, and keeps a copy', async () => {
    const shift: any = await sat.ops.openShift(50_000);
    expect(shift.terminalId).toBe('T2');
    expect(await mainDb().smena.findUnique({ where: { id: shift.id } })).not.toBeNull();
    expect(await satDb().smena.findUnique({ where: { id: shift.id } })).not.toBeNull();
  });

  it('sells through the main, then caches and prints the sale here', async () => {
    const sale: any = await sat.ops.createSale(cartOf(localWaterId, 2));

    // Committed on the main, under the satellite's own receipt numbers…
    expect(sale.receiptNumber.startsWith('T2')).toBe(true);
    const onMain = await mainDb().sale.findUnique({ where: { id: sale.id }, include: { items: true } });
    expect(onMain.terminalId).toBe('T2');
    expect(onMain.items[0].productId).toBe(mainWaterId);
    expect(Number((await mainDb().product.findUnique({ where: { id: mainWaterId } })).stock)).toBe(8);

    // …cached here against this till's own product, with the main's stock figure…
    const cached = await satDb().sale.findUnique({ where: { id: sale.id }, include: { items: true } });
    expect(cached.items[0].productId).toBe(localWaterId);
    expect(cached.synced).toBe(true);
    expect(Number((await satDb().product.findUnique({ where: { id: localWaterId } })).stock)).toBe(8);

    // …and printed at this till.
    expect(sat.printer.printReceipt).toHaveBeenCalledWith(sale.id);
  });

  it('never touches the product whose id the main uses, on this till', async () => {
    const old = await satDb().product.findUnique({ where: { id: mainWaterId } });
    expect(old.barcode).toBe('OLD-LOCAL-ONLY');
    expect(Number(old.stock)).toBe(99);
  });

  it('returns a sale through the main, and forgets its copy', async () => {
    const sale: any = await sat.ops.createSale(cartOf(localWaterId, 1));
    await sat.ops.deleteSale(sale.id);

    expect(await mainDb().sale.findUnique({ where: { id: sale.id } })).toBeNull();
    expect(await satDb().sale.findUnique({ where: { id: sale.id } })).toBeNull();
    expect(Number((await satDb().product.findUnique({ where: { id: localWaterId } })).stock)).toBe(8);
  });

  it('carries the main’s refusals through unchanged', async () => {
    expect(await codeOf(sat.ops.createSale(cartOf(localWaterId, 500)))).toBe('INSUFFICIENT_STOCK');
  });

  /**
   * The failure that makes the idempotency key necessary: the main commits, and the answer never
   * arrives. The satellite retries; the main recognises the sale and hands it back. Sold once.
   */
  it('sells once when the answer to a committed sale is lost on the way back', async () => {
    const realFetch = global.fetch;
    let dropped = 0;
    global.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const res = await realFetch(url, init);
      if (!dropped && String(url).endsWith('/terminal/sales')) {
        dropped++;
        throw new TypeError('fetch failed');
      }
      return res;
    }) as typeof fetch;

    const before = Number((await mainDb().product.findUnique({ where: { id: mainWaterId } })).stock);
    try {
      const sale: any = await sat.ops.createSale(cartOf(localWaterId, 1));
      expect(dropped).toBe(1);
      expect(await mainDb().sale.count({ where: { id: sale.id } })).toBe(1);
    } finally {
      global.fetch = realFetch;
    }
    expect(Number((await mainDb().product.findUnique({ where: { id: mainWaterId } })).stock)).toBe(before - 1);
  });

  // Deactivated on the main: stopped at this till on the very next request, not at session expiry.
  it('stops a cashier the main has deactivated, at once', async () => {
    await mainDb().user.update({ where: { id: 'user-1' }, data: { active: false } });
    try {
      expect(await codeOf(sat.ops.createSale(cartOf(localWaterId, 1)))).toBe('MAIN_SESSION_EXPIRED');
    } finally {
      await mainDb().user.update({ where: { id: 'user-1' }, data: { active: true } });
    }
    // The session is gone; signing in again is what brings it back.
    session = (await sat.ops.login('+998901112233', 'pass1234')).token;
  });

  describe('with the main switched off', () => {
    beforeAll(async () => {
      await stopLocalServer();
    });

    it('refuses to sell rather than sell from its own copy (§5.9)', async () => {
      const stock = async () =>
        Number((await satDb().product.findUnique({ where: { id: localWaterId } })).stock);
      const before = await stock();

      expect(await codeOf(sat.ops.createSale(cartOf(localWaterId, 1)))).toBe('MAIN_UNREACHABLE');
      expect(sat.link.getMainLinkStatus().reachable).toBe(false);
      // Its cached stock was not touched by the refused sale.
      expect(await stock()).toBe(before);
    });

    it('still shows the open shift and its takings, read-only', async () => {
      const shift: any = await sat.ops.getCurrentShift();
      expect(shift).toMatchObject({ terminalId: 'T2', status: 'OPEN' });
      // Everything this till sold and kept — 2 + 1 at 5000 — from its own copy.
      expect(shift.stats.cashSalesAmount).toBe(15_000);
    });

    // §6.9: a session that was open when the main went away survives a restart, read-only.
    it('keeps an already-open session across a restart', async () => {
      sat.link.resetMainLink();
      const user = await sat.ops.restoreSession(session);
      expect(user).toMatchObject({ id: 'user-1' });
    });

    it('offers no PIN login, rather than a PIN pad that cannot work', async () => {
      expect(await sat.ops.isPinConfigured()).toBe(false);
    });
  });
});
