import { copyFileSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { createServer, type Server } from 'http';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * A planned handoff of the main role (tasks/LAN_MAIN_TERMINAL_PLAN.md §11.4), end to end: the old
 * main (O) with its real LAN server and database, and a satellite (S) with its own database in an
 * isolated module registry, as in `satellite.e2e.test.ts`.
 *
 * S takes over; the swap its restart would do is done here by closing its database, applying the
 * pending takeover and opening it again. Then S serves, and O — now S's satellite — sells through
 * it.
 */

jest.setTimeout(60_000);

const mainDir = mkdtempSync(join(tmpdir(), 'posgro-handoff-main-'));
const satelliteDir = mkdtempSync(join(tmpdir(), 'posgro-handoff-satellite-'));
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
jest.mock('../printer/thermal-printer', () => ({
  printReceipt: jest.fn(async () => true),
  openCashDrawer: jest.fn(async () => undefined),
}));
jest.mock('../printer/smena-report-printer', () => ({
  printZXReport: jest.fn(async () => true),
}));

import * as bcrypt from 'bcryptjs';
import { initializeDatabase, closeDatabase, getPrismaClient } from '../database/sqlite-client';
import { getLocalServerStatus, startLocalServer, stopLocalServer } from '../local-server';
import {
  FREEZE_MS,
  __resetHandoff,
  __setFreezeMs,
  getHandoffState,
  issueHandoffCode,
} from '../local-server/handoff';
import { commitSale } from '../sales/commit-sale';
import { settleSale } from '../sales/settle-sale';
import { openShift } from '../sales/shifts';
import { fetchTerminalToken } from './main-terminal-client';

const PORT = 5411;
const URL = `http://127.0.0.1:${PORT}/api`;
const SECRET = 'handoff-e2e-device-secret';
const SECRET_T3 = 'handoff-e2e-third-till-secret';
const SUPER = 'super-admin-pw';
const WATER = '4780000000002';

type Satellite = {
  sqlite: typeof import('../database/sqlite-client');
  ops: typeof import('./satellite-ops');
  sync: typeof import('./main-sync');
  link: typeof import('./main-link');
  takeover: typeof import('./takeover');
  server: typeof import('../local-server');
};
let sat: Satellite;
let mainWaterId = 0;

const mainDb = () => getPrismaClient();
const satDb = () => sat.sqlite.getPrismaClient();

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

async function satelliteCart() {
  const water = await satDb().product.findUnique({ where: { barcode: WATER } });
  return {
    items: [
      { productId: water.id, productName: 'Вода', barcode: WATER, quantity: 1, unitPrice: 5000, piecesPerUnit: 1 },
    ],
    paymentMethod: 'cash',
    discountAmount: 0,
  };
}

/** O selling at its own till, as its IPC handler does: commit, then settle. */
async function sellAtMain() {
  const result = await commitSale(
    {
      items: [
        { productId: mainWaterId, productName: 'Вода', barcode: WATER, quantity: 1, unitPrice: 5000, piecesPerUnit: 1 },
      ],
      paymentMethod: 'cash',
      discountAmount: 0,
    },
    { terminalId: 'T1', cashierId: 'user-1', cashierName: 'Кассир' },
  );
  await settleSale(result.sale.id, {}, 'T1');
  return result;
}

const put = (db: any, key: string, value: string) =>
  db.systemSetting.upsert({ where: { key }, update: { value }, create: { key, value } });

beforeAll(async () => {
  process.env.JWT_SECRET = 'integration-test-secret-key-32-chars';

  // ── O, the main ──
  await initializeDatabase();
  const m = mainDb();
  await put(m, 'local_web_port', String(PORT));
  await put(m, 'printer_name', 'O-printer');
  await put(m, 'receipt_header', 'The shop');
  await m.localConfig.create({
    data: {
      id: 'config', storeId: 'store-h', storeName: 'Handoff', terminalId: 'T1', apiUrl: 'http://localhost',
      mode: 'ONLINE', isMain: true, lanLineage: 'L-h', mainGeneration: 2,
      superAdminPassword: await bcrypt.hash(SUPER, 10),
    },
  });
  await m.user.create({
    data: {
      id: 'user-1', phone: '+998901112244', password: await bcrypt.hash('pass1234', 10), role: 'USER',
      nameRu: 'Кассир', nameUz: 'Kassir', storeId: 'store-h',
    },
  });
  const category = await m.category.create({ data: { nameRu: 'Напитки', nameUz: 'Ichimliklar' } });
  mainWaterId = (
    await m.product.create({
      data: { barcode: WATER, nameRu: 'Вода', nameUz: 'Suv', price: 5000, stock: 20, categoryId: category.id },
    })
  ).id;
  await m.pairedTerminal.create({ data: { terminalId: 'T2', secretHash: await bcrypt.hash(SECRET, 10) } });
  await m.pairedTerminal.create({ data: { terminalId: 'T3', secretHash: await bcrypt.hash(SECRET_T3, 10) } });
  await openShift('T1', { id: 'user-1', nameRu: 'Кассир' }, 0);
  await startLocalServer();

  // ── S, the satellite that will take over ──
  jest.isolateModules(() => {
    sat = {
      sqlite: require('../database/sqlite-client'),
      ops: require('./satellite-ops'),
      sync: require('./main-sync'),
      link: require('./main-link'),
      takeover: require('./takeover'),
      server: require('../local-server'),
    };
    require('../config/app-config').updateConfig({ terminalId: 'T2' });
  });
  mockDataDir = satelliteDir;
  await sat.sqlite.initializeDatabase();
  const s = satDb();
  await s.localConfig.create({
    data: {
      id: 'config', storeId: 'store-h', storeName: 'Handoff', terminalId: 'T2', apiUrl: 'http://localhost',
      mode: 'ONLINE', isMain: false, mainTerminalUrl: URL, lanLineage: 'L-h', mainGeneration: 2,
      superAdminPassword: await bcrypt.hash(SUPER, 10),
    },
  });
  await put(s, 'lan_device_secret', SECRET);
  await put(s, 'printer_name', 'S-printer');
  await put(s, 'cash_drawer_enabled', 'true');

  // A day's trading before the handoff: two sales rung up at S, one at O.
  await sat.sync.syncWithMain();
  await sat.ops.login('+998901112244', 'pass1234');
  await sat.ops.openShift(0);
  await sat.ops.createSale(await satelliteCart());
  await sat.ops.createSale(await satelliteCart());
  await sellAtMain();
}, 120_000);

afterAll(async () => {
  __setFreezeMs(FREEZE_MS);
  __resetHandoff();
  await sat?.server.stopLocalServer();
  await stopLocalServer();
  await sat?.sqlite.closeDatabase();
  await closeDatabase();
  rmSync(mainDir, { recursive: true, force: true });
  rmSync(satelliteDir, { recursive: true, force: true });
});

describe('the write freeze (§11.4)', () => {
  const begin = async () => {
    const { code } = issueHandoffCode();
    return sat.link.mainRequest('POST', '/terminal/handoff/begin', { body: { code } });
  };

  it('refuses every sale while a handoff is under way, and lets go when it is abandoned', async () => {
    const begun: any = await begin();
    expect(getHandoffState().inProgress).toBe(true);

    expect(await codeOf(sellAtMain())).toBe('MAIN_HANDING_OFF');
    expect(await codeOf(sat.ops.createSale(await satelliteCart()))).toBe('MAIN_HANDING_OFF');

    await sat.link.mainRequest('POST', '/terminal/handoff/abort', {
      headers: { 'X-Handoff-Token': begun.handoff_token },
    });
    expect(getHandoffState().inProgress).toBe(false);
    await expect(sellAtMain()).resolves.toMatchObject({ replayed: false });
  });

  it('lapses by itself when the new main never confirms', async () => {
    __setFreezeMs(300);
    try {
      await begin();
      expect(await codeOf(sellAtMain())).toBe('MAIN_HANDING_OFF');
      await new Promise((r) => setTimeout(r, 500));
      expect(getHandoffState().inProgress).toBe(false);
      await expect(sellAtMain()).resolves.toMatchObject({ replayed: false });
    } finally {
      __setFreezeMs(FREEZE_MS);
    }
  });

  it('will not begin on a wrong code', async () => {
    issueHandoffCode();
    expect(
      await codeOf(sat.link.mainRequest('POST', '/terminal/handoff/begin', { body: { code: '000000x' } })),
    ).toBe('Handoff code is wrong or has expired');
    expect(getHandoffState().inProgress).toBe(false);
  });
});

describe('taking over the main role (§11.4)', () => {
  let salesAtO = 0;
  let stockAtO = 0;

  beforeAll(async () => {
    __resetHandoff();
    salesAtO = await mainDb().sale.count();
    stockAtO = Number((await mainDb().product.findUnique({ where: { id: mainWaterId } })).stock);
  });

  it('is refused with the wrong super-admin password, before the main is asked anything', async () => {
    const { code } = issueHandoffCode();
    expect(await codeOf(sat.takeover.takeOverAsMain('nope', { code, newMainUrl: URL }))).toBe(
      'settings.superAdminPasswordWrong',
    );
    expect(getHandoffState()).toMatchObject({ inProgress: false, code });
  });

  it('moves the truth over, and turns the old main into its satellite', async () => {
    const { code } = issueHandoffCode();
    await sat.takeover.takeOverAsMain(SUPER, { code, newMainUrl: URL });

    // O: a satellite of S, one generation on, holding the secret S minted for it.
    const o = await mainDb().localConfig.findUnique({ where: { id: 'config' } });
    expect(o).toMatchObject({ isMain: false, mainTerminalUrl: URL, lanLineage: 'L-h', mainGeneration: 3 });
    expect(await mainDb().pairedTerminal.count()).toBe(0);
    expect(await mainDb().systemSetting.findUnique({ where: { key: 'lan_device_secret' } })).not.toBeNull();
    // …and it stops serving, so S can take the address.
    for (let i = 0; i < 50 && getLocalServerStatus().running; i++) await new Promise((r) => setTimeout(r, 20));
    expect(getLocalServerStatus().running).toBe(false);

    expect(sat.takeover.readTakeoverMarker()).toMatchObject({ state: 'confirmed', generation: 3 });
  });

  it('swaps the copy in at its next start', async () => {
    await sat.sqlite.closeDatabase();
    sat.link.resetMainLink();
    expect(await sat.takeover.applyPendingTakeover()).toBe('swapped');
    await sat.sqlite.initializeDatabase();

    expect(sat.takeover.readTakeoverMarker()).toBeNull();
    expect(existsSync(join(satelliteDir, 'pos-local.pre-handoff.db'))).toBe(true);
  });

  it('is now the main, holding everything the old main held', async () => {
    const s = await satDb().localConfig.findUnique({ where: { id: 'config' } });
    expect(s).toMatchObject({ terminalId: 'T2', isMain: true, mainTerminalUrl: null, lanLineage: 'L-h', mainGeneration: 3 });

    // Every sale, from every till — and the stock they left.
    expect(await satDb().sale.count()).toBe(salesAtO);
    const water = await satDb().product.findUnique({ where: { barcode: WATER } });
    expect(water.id).toBe(mainWaterId);
    expect(Number(water.stock)).toBe(stockAtO);
    // The shop's settings came along; this machine's printer and drawer stayed its own.
    const read = async (key: string) => (await satDb().systemSetting.findUnique({ where: { key } }))?.value;
    expect(await read('receipt_header')).toBe('The shop');
    expect(await read('printer_name')).toBe('S-printer');
    expect(await read('cash_drawer_enabled')).toBe('true');
    expect(await read('lan_device_secret')).toBeUndefined();
    expect(await read('lan_signing_secret')).toBeUndefined();

    // The old main is paired with it now; it is no longer paired with itself.
    const paired = (await satDb().pairedTerminal.findMany()).map((r: { terminalId: string }) => r.terminalId);
    expect(paired.sort()).toEqual(['T1', 'T3']);
  });

  it("serves the old main's other satellites on the credentials they already hold", async () => {
    await sat.server.startLocalServer();
    const grant = await fetchTerminalToken(URL, 'T3', SECRET_T3);
    expect(grant).toMatchObject({ lineage: 'L-h', generation: 3 });
  });

  it('lets the old main sell through it, as its satellite', async () => {
    // O's own modules — the ones its restart would load as a satellite.
    const oOps: typeof import('./satellite-ops') = require('./satellite-ops');
    const oSync: typeof import('./main-sync') = require('./main-sync');
    await oSync.syncWithMain();
    await oOps.login('+998901112244', 'pass1234');

    const water = await mainDb().product.findUnique({ where: { barcode: WATER } });
    const sale: any = await oOps.createSale({
      items: [{ productId: water.id, productName: 'Вода', barcode: WATER, quantity: 1, unitPrice: 5000, piecesPerUnit: 1 }],
      paymentMethod: 'cash',
      discountAmount: 0,
    });

    const onS = await satDb().sale.findUnique({ where: { id: sale.id } });
    expect(onS.terminalId).toBe('T1');
    expect(Number((await satDb().product.findUnique({ where: { barcode: WATER } })).stock)).toBe(stockAtO - 1);
  });
});

/**
 * §11.6: after a handoff, the other tills still hold the old address. Their pairing travelled with
 * the database, so pointing them at the new one needs no code — only proof that it is the same
 * shop's current main and that it knows them. Run here on O, which is S's satellite by now.
 */
describe('repointing a satellite (§11.6)', () => {
  const roles = (): typeof import('./role-change') => require('./role-change');
  let fake: Server;
  let fakeInfo: Record<string, unknown> = {};

  beforeAll(async () => {
    fake = createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ service: 'posgro-terminal', role: 'main', store_id: 'store-h', terminal_id: 'TX', ...fakeInfo }));
    });
    await new Promise<void>((r) => fake.listen(5413, '127.0.0.1', () => r()));
  });
  afterAll(() => new Promise<void>((r) => fake.close(() => r())));

  it('refuses a main of another lineage', async () => {
    fakeInfo = { lineage: 'L-other', generation: 9 };
    expect(await codeOf(roles().repointMain(SUPER, 'http://127.0.0.1:5413/api'))).toBe('settings.repointOtherLineage');
  });

  it('refuses a main older than the one it has seen', async () => {
    fakeInfo = { lineage: 'L-h', generation: 2 };
    expect(await codeOf(roles().repointMain(SUPER, 'http://127.0.0.1:5413/api'))).toBe('settings.mainTerminal_superseded');
  });

  it('refuses a main that does not know it', async () => {
    fakeInfo = { lineage: 'L-h', generation: 3 };
    expect(await codeOf(roles().repointMain(SUPER, 'http://127.0.0.1:5413/api'))).toBe('settings.repointNotPaired');
    // Nothing was written.
    expect((await mainDb().localConfig.findUnique({ where: { id: 'config' } })).mainTerminalUrl).toBe(URL);
  });

  it('points at the current main on the credential it already holds', async () => {
    await expect(roles().repointMain(SUPER, `${URL}/`)).resolves.toEqual({ mainTerminalId: 'T2' });
    const o = await mainDb().localConfig.findUnique({ where: { id: 'config' } });
    expect(o).toMatchObject({ mainTerminalUrl: URL, lanLineage: 'L-h', mainGeneration: 3 });
    // A different machine's clock: the catalog starts over.
    expect(await mainDb().systemSetting.findUnique({ where: { key: 'last_product_sync' } })).toBeNull();
  });
});

/**
 * A takeover whose confirmation never arrived. The copy waits beside the database; at startup the
 * old main is asked where it stands, and only a clear answer decides.
 */
describe('recovering an unconfirmed takeover', () => {
  const stage = (oldMainUrl: string, generation: number) => {
    const staged = join(satelliteDir, 'pos-local.handoff.db');
    copyFileSync(join(satelliteDir, 'pos-local.db'), staged);
    writeFileSync(
      join(satelliteDir, 'handoff-pending.json'),
      JSON.stringify({ state: 'staged', staged, oldMainUrl, lineage: 'L-h', generation, at: new Date().toISOString() }),
    );
    return staged;
  };

  it('throws the copy away when the old main is still the main', async () => {
    // S is serving as the main at generation 3: a copy claiming generation 4 was never confirmed.
    const staged = stage(URL, 4);
    expect(await sat.takeover.applyPendingTakeover()).toBe('discarded');
    expect(existsSync(staged)).toBe(false);
    expect(sat.takeover.readTakeoverMarker()).toBeNull();
  });

  it('waits for the operator when the old main does not answer', async () => {
    const staged = stage('http://127.0.0.1:1/api', 4);
    expect(await sat.takeover.applyPendingTakeover()).toBe('pending');
    expect(existsSync(staged)).toBe(true);
    expect(sat.takeover.getPendingTakeover()).toMatchObject({ oldMainUrl: 'http://127.0.0.1:1/api' });

    await sat.takeover.resolvePendingTakeover(SUPER, 'discard');
    expect(existsSync(staged)).toBe(false);
    expect(sat.takeover.readTakeoverMarker()).toBeNull();
  });

  it('finishes when the old main answers as a satellite', async () => {
    const satelliteNow: Server = createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ service: 'posgro-terminal', role: 'satellite', store_id: 'store-h', terminal_id: 'T1' }));
    });
    await new Promise<void>((r) => satelliteNow.listen(5412, '127.0.0.1', () => r()));
    try {
      stage('http://127.0.0.1:5412/api', 4);
      await sat.server.stopLocalServer();
      await sat.sqlite.closeDatabase();
      expect(await sat.takeover.applyPendingTakeover()).toBe('swapped');
      await sat.sqlite.initializeDatabase();
      expect(sat.takeover.readTakeoverMarker()).toBeNull();
    } finally {
      await new Promise<void>((r) => satelliteNow.close(() => r()));
    }
  });
});
