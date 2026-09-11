import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * A main terminal answering its satellites, end to end: a real SQLite database, the real HTTP
 * server, and two paired tills (T2, T3) talking to it the way a satellite will.
 *
 * The properties that matter are all about who may do what to whose data, and about two tills
 * racing — so they are asserted over the wire, where the router's guards actually run.
 */

const dataDir = mkdtempSync(join(tmpdir(), 'posgro-satellite-'));

// Real SQLite, bcrypt and a real HTTP server, on a machine running every other suite at once — see
// the note in local-server.integration.test.ts.
jest.setTimeout(30_000);

// electron-log wants a running Electron at import time. The router reaches it through the fiscal
// service a satellite's sale is settled by; quiet and inspectable here instead.
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

import * as bcrypt from 'bcryptjs';
import { initializeDatabase, closeDatabase, getPrismaClient } from '../database/sqlite-client';
import { startLocalServer, stopLocalServer } from './index';
import { __resetPinThrottles } from './routes/satellite';
import { setServerToken, clearServerToken } from '../sync/queue-manager';
import { syncSales } from '../sync/sales-sync';
import { log } from '../logger';

const PORT = 5398;
const BASE = `http://127.0.0.1:${PORT}/api`;
const SECRETS: Record<string, string> = { T2: 'secret-of-t2', T3: 'secret-of-t3' };

let productId = 0;
let lastUnitId = 0;

type Reply = { status: number; json: any };

async function call(
  method: string,
  path: string,
  opts: { device?: string; session?: string; body?: unknown } = {},
): Promise<Reply> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.device ? { Authorization: `Bearer ${opts.device}` } : {}),
      ...(opts.session ? { 'X-User-Session': opts.session } : {}),
    },
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

/** A device token, obtained the way a satellite does: its stored secret for a one-hour token. */
async function device(terminalId: 'T2' | 'T3'): Promise<string> {
  const res = await call('POST', '/terminal/token', {
    body: { terminalId, secret: SECRETS[terminalId] },
  });
  expect(res.status).toBe(201);
  return res.json.token;
}

async function login(dev: string, phone = '+998900000002', password = 'cashier1'): Promise<string> {
  const res = await call('POST', '/terminal/auth/login', { device: dev, body: { phone, password } });
  expect(res.status).toBe(201);
  return res.json.session;
}

async function stockOf(id: number): Promise<number> {
  return Number((await getPrismaClient().product.findUnique({ where: { id } })).stock);
}

const BARCODES = { water: '4780000000001', lastUnit: '4780000000009' };

/**
 * A cart as a satellite sends it: products named by barcode. The `productId` is the satellite's own
 * and deliberately nonsense here — the main must never act on it.
 */
function cart(barcode: string, quantity = 1, extra: Record<string, unknown> = {}) {
  return {
    items: [
      { productId: 999_999, productBarcode: barcode, productName: 'Вода', barcode, quantity, unitPrice: 5000 },
    ],
    paymentMethod: 'cash',
    ...extra,
  };
}

/** The structured refusal a 409 carries, as the satellite's renderer will read it. */
function refusal(reply: Reply): string | undefined {
  try {
    return JSON.parse(reply.json.message).code;
  } catch {
    return undefined;
  }
}

beforeAll(async () => {
  process.env.JWT_SECRET = 'integration-test-secret-key-32-chars';
  await initializeDatabase();
  const prisma = getPrismaClient();

  await prisma.systemSetting.upsert({
    where: { key: 'local_web_port' },
    update: { value: String(PORT) },
    create: { key: 'local_web_port', value: String(PORT) },
  });
  // An ONLINE main — the case the LAN server did not serve at all before satellites existed.
  await prisma.localConfig.upsert({
    where: { id: 'config' },
    update: {},
    create: {
      id: 'config',
      storeId: 'store-test',
      storeName: 'Test Shop',
      terminalId: 'T1',
      apiUrl: 'http://localhost',
      mode: 'ONLINE',
      isMain: true,
    },
  });

  await prisma.user.create({
    data: {
      id: 'user-cashier',
      phone: '+998900000002',
      password: await bcrypt.hash('cashier1', 10),
      pin: await bcrypt.hash('1234', 10),
      role: 'USER',
      nameRu: 'Кассир',
      nameUz: 'Kassir',
      storeId: 'store-test',
    },
  });
  await prisma.user.create({
    data: {
      id: 'user-gone',
      phone: '+998900000003',
      password: await bcrypt.hash('gone1234', 10),
      role: 'USER',
      nameRu: 'Уволен',
      nameUz: 'Ketgan',
      storeId: 'store-test',
    },
  });

  for (const [terminalId, secret] of Object.entries(SECRETS)) {
    await prisma.pairedTerminal.create({
      data: { terminalId, secretHash: await bcrypt.hash(secret, 10) },
    });
  }

  const category = await prisma.category.create({ data: { nameRu: 'Напитки', nameUz: 'Ichimliklar' } });
  productId = (
    await prisma.product.create({
      data: { barcode: '4780000000001', nameRu: 'Вода', nameUz: 'Suv', price: 5000, stock: 20, categoryId: category.id },
    })
  ).id;
  lastUnitId = (
    await prisma.product.create({
      data: { barcode: '4780000000009', nameRu: 'Последний', nameUz: 'Oxirgi', price: 5000, stock: 1, categoryId: category.id },
    })
  ).id;

  await startLocalServer();
}, 120_000);

afterAll(async () => {
  await stopLocalServer();
  await closeDatabase();
  rmSync(dataDir, { recursive: true, force: true });
});

describe('who may call', () => {
  const personRoutes: Array<[string, string]> = [
    ['GET', '/terminal/auth/session'],
    ['POST', '/terminal/sales'],
    ['POST', '/terminal/smena/open'],
    ['GET', '/terminal/smena/current'],
  ];

  it('refuses a dashboard login on every satellite route', async () => {
    const dash = await call('POST', '/auth/login', {
      body: { phone: '+998900000002', password: 'cashier1' },
    });
    expect(dash.status).toBe(201);

    for (const [method, path] of [...personRoutes, ['GET', '/terminal/sync/products']] as const) {
      expect((await call(method, path, { device: dash.json.token })).status).toBe(401);
    }
  });

  it.each(personRoutes)('%s %s needs a person as well as the device', async (method, path) => {
    const res = await call(method, path, {
      device: await device('T2'),
      ...(method === 'GET' ? {} : { body: {} }),
    });
    expect(res.status).toBe(401);
    expect(res.json.message).toBe('SESSION_REQUIRED');
  });

  // A session is bound to the till that logged in: copied to another, it opens nothing.
  it('refuses a session carried to another till', async () => {
    const session = await login(await device('T2'));
    const res = await call('GET', '/terminal/auth/session', { device: await device('T3'), session });
    expect(res.status).toBe(401);
    expect(res.json.message).toBe('SESSION_REQUIRED');
  });

  // Deactivating someone on the main stops them at every till now, not when the session expires.
  it('drops a session the moment its user is deactivated', async () => {
    const dev = await device('T2');
    const session = await login(dev, '+998900000003', 'gone1234');
    expect((await call('GET', '/terminal/auth/session', { device: dev, session })).status).toBe(200);

    await getPrismaClient().user.update({ where: { id: 'user-gone' }, data: { active: false } });
    expect((await call('GET', '/terminal/auth/session', { device: dev, session })).status).toBe(401);
  });
});

describe('login at a satellite', () => {
  beforeEach(() => __resetPinThrottles());

  it('answers a password with a session for that person', async () => {
    const dev = await device('T2');
    const session = await login(dev);
    const me = await call('GET', '/terminal/auth/session', { device: dev, session });
    expect(me.json.user).toMatchObject({ id: 'user-cashier', role: 'USER' });
    expect(me.json.user).not.toHaveProperty('password');
  });

  it('speaks the login screen’s language for a wrong password', async () => {
    const res = await call('POST', '/terminal/auth/login', {
      device: await device('T2'),
      body: { phone: '+998900000002', password: 'nope' },
    });
    expect(res.status).toBe(401);
    expect(res.json.message).toBe('auth.errors.invalid_password');
  });

  it('logs in by PIN, and says whether PIN login is offered at all', async () => {
    const dev = await device('T2');
    expect((await call('GET', '/terminal/auth/pin-configured', { device: dev })).json).toEqual({
      configured: true,
    });
    const res = await call('POST', '/terminal/auth/pin', { device: dev, body: { pin: '1234' } });
    expect(res.status).toBe(201);
    expect(res.json.user.id).toBe('user-cashier');
    expect(res.json.session).toBeTruthy();
  });

  it('refuses a wrong PIN', async () => {
    const res = await call('POST', '/terminal/auth/pin', {
      device: await device('T2'),
      body: { pin: '9999' },
    });
    expect(res.status).toBe(401);
    expect(res.json.message).toBe('auth.errors.invalid_pin');
  });

  /**
   * §6.10: four digits over a wire. After five wrong guesses the till is locked out — even the
   * right PIN is refused — and only that till: one being hammered must not lock the shop out.
   */
  it('locks out the till that keeps guessing, and only that till', async () => {
    const t2 = await device('T2');
    for (let i = 0; i < 5; i++) {
      await call('POST', '/terminal/auth/pin', { device: t2, body: { pin: '0000' } });
    }

    const locked = await call('POST', '/terminal/auth/pin', { device: t2, body: { pin: '1234' } });
    expect(locked.status).toBe(429);
    expect(locked.json.message).toBe('auth.errors.pin_locked');

    const other = await call('POST', '/terminal/auth/pin', {
      device: await device('T3'),
      body: { pin: '1234' },
    });
    expect(other.status).toBe(201);

    // …and a shop can see it happening, against the till it came from.
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('wrong PIN from terminal T2'));
  });

  it('keeps PIN guessing closed to anyone without a paired device', async () => {
    expect((await call('POST', '/terminal/auth/pin', { body: { pin: '1234' } })).status).toBe(401);
  });
});

describe('selling from a satellite', () => {
  let t2 = '';
  let t2Session = '';
  let t3 = '';
  let t3Session = '';

  beforeAll(async () => {
    t2 = await device('T2');
    t2Session = await login(t2);
    t3 = await device('T3');
    t3Session = await login(t3);
  });

  it('refuses a sale before the till has opened its shift', async () => {
    const res = await call('POST', '/terminal/sales', { device: t2, session: t2Session, body: cart(BARCODES.water) });
    expect(res.status).toBe(409);
    expect(refusal(res)).toBe('NO_SMENA_OPEN');
  });

  it('opens a shift that belongs to the satellite, once', async () => {
    const opened = await call('POST', '/terminal/smena/open', {
      device: t2,
      session: t2Session,
      body: { initialCash: 100000 },
    });
    expect(opened.status).toBe(201);
    expect(opened.json).toMatchObject({ terminalId: 'T2', cashierId: 'user-cashier', status: 'OPEN' });

    const again = await call('POST', '/terminal/smena/open', { device: t2, session: t2Session, body: {} });
    expect(again.status).toBe(409);
    expect(again.json.message).toBe('SMENA_ALREADY_OPEN');

    const current = await call('GET', '/terminal/smena/current', { device: t2, session: t2Session });
    expect(current.json.smena.id).toBe(opened.json.id);
  });

  it('commits the sale here, under the satellite’s own receipt numbers', async () => {
    const before = await stockOf(productId);
    const res = await call('POST', '/terminal/sales', {
      device: t2,
      session: t2Session,
      body: cart(BARCODES.water, 2, { id: 'sat-sale-1' }),
    });

    expect(res.status).toBe(201);
    expect(res.json.sale).toMatchObject({ id: 'sat-sale-1', terminalId: 'T2', cashierId: 'user-cashier' });
    expect(res.json.sale.receiptNumber.startsWith('T2')).toBe(true);
    // Fiscalization is off here, so the sale comes back settled as DISABLED rather than PENDING.
    expect(res.json.sale.fiscalStatus).toBe('DISABLED');
    expect(await stockOf(productId)).toBe(before - 2);
    expect(res.json.stock).toEqual([
      expect.objectContaining({ productId, stock: before - 2 }),
    ]);
  });

  // The response to a committed sale can be lost; the retry must not sell again.
  it('answers a retry with the same receipt, and sells nothing twice', async () => {
    const before = await stockOf(productId);
    const res = await call('POST', '/terminal/sales', {
      device: t2,
      session: t2Session,
      body: cart(BARCODES.water, 2, { id: 'sat-sale-1' }),
    });
    expect(res.status).toBe(201);
    expect(res.json.replayed).toBe(true);
    expect(await stockOf(productId)).toBe(before);
  });

  /**
   * The satellite's ids are its own. Every cart here carries productId 999999 — which names nothing
   * on the main — and the sales above still took stock from the right product, because the main
   * resolves by barcode. This pins the other half: an id that *does* exist here, on a line whose
   * barcode names a different product, sells the barcode's product and leaves the id's alone.
   */
  it('sells the product the barcode names, whatever id the satellite sent', async () => {
    const water = await stockOf(productId);
    const last = await stockOf(lastUnitId);

    const body = cart(BARCODES.water);
    body.items[0].productId = lastUnitId;
    const res = await call('POST', '/terminal/sales', { device: t2, session: t2Session, body });

    expect(res.status).toBe(201);
    expect(await stockOf(productId)).toBe(water - 1);
    expect(await stockOf(lastUnitId)).toBe(last);
  });

  it('refuses a line with no barcode, and one the main does not stock', async () => {
    const body = cart(BARCODES.water);
    delete (body.items[0] as Record<string, unknown>).productBarcode;
    expect((await call('POST', '/terminal/sales', { device: t2, session: t2Session, body })).status).toBe(400);

    const unknown = await call('POST', '/terminal/sales', {
      device: t2,
      session: t2Session,
      body: cart('0000000000000'),
    });
    expect(unknown.status).toBe(409);
    expect(refusal(unknown)).toBe('PRODUCT_NOT_FOUND');
  });

  /** §3, across the wire: two tills, one unit, one winner. */
  it('lets only one of two tills have the last unit', async () => {
    await call('POST', '/terminal/smena/open', { device: t3, session: t3Session, body: { initialCash: 0 } });

    const [a, b] = await Promise.all([
      call('POST', '/terminal/sales', { device: t2, session: t2Session, body: cart(BARCODES.lastUnit) }),
      call('POST', '/terminal/sales', { device: t3, session: t3Session, body: cart(BARCODES.lastUnit) }),
    ]);

    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(refusal(a.status === 409 ? a : b)).toBe('INSUFFICIENT_STOCK');
    expect(await stockOf(lastUnitId)).toBe(0);
  });

  it('lets a till remove only the sales it rang up', async () => {
    const foreign = await call('DELETE', '/terminal/sales/sat-sale-1', { device: t3, session: t3Session });
    expect(foreign.status).toBe(403);

    const before = await stockOf(productId);
    const own = await call('DELETE', '/terminal/sales/sat-sale-1', { device: t2, session: t2Session });
    expect(own.status).toBe(200);
    expect(await stockOf(productId)).toBe(before + 2);
  });

  it('closes its own shift and no other till’s', async () => {
    const shift = (await call('GET', '/terminal/smena/current', { device: t2, session: t2Session })).json.smena;

    const foreign = await call('POST', '/terminal/smena/close', {
      device: t3,
      session: t3Session,
      body: { smenaId: shift.id, finalCash: 0 },
    });
    expect(foreign.status).toBe(409);

    const own = await call('POST', '/terminal/smena/close', {
      device: t2,
      session: t2Session,
      body: { smenaId: shift.id, finalCash: 100000 },
    });
    expect(own.status).toBe(201);
    expect(own.json.smena.status).toBe('CLOSED');
    expect(own.json.stats).toHaveProperty('cashSalesAmount');
  });
});

describe('the catalog a satellite pulls', () => {
  it('serves products changed since a cursor, in the main’s own order', async () => {
    const dev = await device('T2');
    const all = await call('GET', '/terminal/sync/products', { device: dev });
    expect(all.status).toBe(200);
    expect(all.json.length).toBeGreaterThanOrEqual(2);
    // The VPS shape, which the satellite's existing parser expects: raw rows, category name joined.
    expect(all.json[0]).toHaveProperty('category.nameUz');

    const newest = all.json[all.json.length - 1].updatedAt;
    const since = await call('GET', `/terminal/sync/products?updatedAfter=${encodeURIComponent(newest)}`, {
      device: dev,
    });
    expect(since.json).toEqual([]);
  });

  it('serves the store’s settings and none of this machine’s own', async () => {
    const res = await call('GET', '/terminal/sync/settings', { device: await device('T2') });
    expect(res.status).toBe(200);
    expect(res.json).toHaveProperty('local_web_port');
    expect(res.json).not.toHaveProperty('lan_signing_secret');
  });

  // Login goes to the main, so a satellite needs no copy of anyone's password hash — none is served.
  it('has no route that would hand out the users table', async () => {
    expect((await call('GET', '/terminal/sync/users', { device: await device('T2') })).status).toBe(404);
  });
});

/**
 * Once satellite sales live on the main, the main uploads them. They must reach the server under
 * the till that rang them up — the receipt number already says T2, and a shift reconciles per
 * terminal — not under the main's own id.
 */
describe('uploading a satellite’s sale from the main', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    clearServerToken();
  });

  it('files it under the satellite', async () => {
    const t2 = await device('T2');
    const session = await login(t2);
    await call('POST', '/terminal/smena/open', { device: t2, session, body: { initialCash: 0 } });
    const sale = await call('POST', '/terminal/sales', { device: t2, session, body: cart(BARCODES.water) });
    expect(sale.status).toBe(201);

    const sent: any[] = [];
    global.fetch = jest.fn(async (_url: unknown, init?: RequestInit) => {
      sent.push(JSON.parse(String(init?.body)));
      return new Response('{}', { status: 201 });
    }) as typeof fetch;
    setServerToken('header.eyJzdG9yZUlkIjoic3RvcmUtdGVzdCJ9.sig');

    await syncSales();

    const mine = sent.find((s) => s.id === sale.json.sale.id);
    expect(mine?.terminalId).toBe('T2');
  });
});
