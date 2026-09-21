import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * Users between the till and the server, against a real SQLite database.
 *
 * The server owns who a user is. The bug this guards: an admin-signed-in till uploaded every
 * local user in full on each cycle, the server took the till's copy over its own, and the pull
 * that followed brought the till's stale copy back — so a dashboard edit never reached that till,
 * and a user deleted on the dashboard came back. A phone number changed on the dashboard also
 * broke the pull outright (looked up by the new phone, then died creating a duplicate id).
 */

const dataDir = mkdtempSync(join(tmpdir(), 'posgro-users-sync-'));
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
const token = `h.${Buffer.from(JSON.stringify({ storeId: 'S1' })).toString('base64')}.s`;
jest.mock('./queue-manager', () => ({ getServerToken: () => token }));

import { initializeDatabase, closeDatabase, getPrismaClient } from '../database/sqlite-client';
import { syncUsers } from './products-sync';
import { uploadUsers } from './upload-sync';

const db = () => getPrismaClient();

type ServerUser = { id: string; phone: string; password: string; role: string; nameUz: string; nameRu: string; active: boolean };
const serverUser = (over: Partial<ServerUser>): ServerUser => ({
  id: 'u-x',
  phone: '998900000000',
  password: 'hash',
  role: 'USER',
  nameUz: 'Kassir',
  nameRu: 'Кассир',
  active: true,
  ...over,
});

let posted: unknown[] = [];
function serve(users: ServerUser[]) {
  posted = [];
  global.fetch = jest.fn(async (url: string, init?: { body?: string }) => {
    if (init?.body) posted.push(JSON.parse(init.body));
    const body = String(url).endsWith('/users/sync') ? users : { created: 0, updated: 0, errors: [] };
    return { ok: true, status: 200, statusText: 'OK', json: async () => body, text: async () => '' };
  }) as unknown as typeof fetch;
}

const local = (over: Record<string, unknown>) =>
  db().user.create({
    data: { phone: '998900000000', password: 'hash', role: 'USER', nameUz: 'Eski', nameRu: 'Старый', storeId: 'S1', synced: true, ...over },
  });

beforeAll(async () => {
  await initializeDatabase();
  await db().localConfig.upsert({
    where: { id: 'config' },
    update: { storeId: 'S1' },
    create: { id: 'config', storeId: 'S1', storeName: 'Test', terminalId: 'T1', apiUrl: 'https://vps.test/api' },
  });
});

beforeEach(async () => {
  await db().debtTransaction.deleteMany({});
  await db().user.deleteMany({});
});

afterAll(async () => {
  await closeDatabase();
  rmSync(dataDir, { recursive: true, force: true });
});

describe('syncUsers (pull)', () => {
  it('lets the server copy win over one this till has already sent', async () => {
    await local({ id: 'u1', phone: '998901111111', role: 'USER', active: true });
    serve([serverUser({ id: 'u1', phone: '998901111111', nameRu: 'Новое имя', role: 'ADMIN', active: false })]);

    await syncUsers();
    const row = await db().user.findUnique({ where: { id: 'u1' } });
    expect(row).toMatchObject({ nameRu: 'Новое имя', role: 'ADMIN', active: false, synced: true });
  });

  it('follows a phone number changed on the dashboard instead of failing on the id', async () => {
    await local({ id: 'u2', phone: '998902222222' });
    serve([serverUser({ id: 'u2', phone: '998903333333', nameRu: 'Переименован' })]);

    await syncUsers();
    expect(await db().user.count()).toBe(1);
    expect(await db().user.findUnique({ where: { id: 'u2' } })).toMatchObject({
      phone: '998903333333',
      nameRu: 'Переименован',
    });
  });

  it('keeps an edit made here until it has been uploaded', async () => {
    await local({ id: 'u3', phone: '998904444444', nameRu: 'Правка на кассе', synced: false });
    serve([serverUser({ id: 'u3', phone: '998904444444', nameRu: 'Старое с сервера' })]);

    await syncUsers();
    expect((await db().user.findUnique({ where: { id: 'u3' } })).nameRu).toBe('Правка на кассе');
  });

  it('removes a user deleted on the server, deactivating one that has history here', async () => {
    await local({ id: 'keep', phone: '998905555555' });
    await local({ id: 'gone', phone: '998906666666' });
    await local({ id: 'history', phone: '998907777777' });
    await local({ id: 'fresh', phone: '998908888888', synced: false });
    await db().debtTransaction.create({
      data: { userId: 'history', type: 'CHARGE', amount: 1000, createdBy: 'keep' },
    });
    serve([serverUser({ id: 'keep', phone: '998905555555' })]);

    await syncUsers();
    expect(await db().user.findUnique({ where: { id: 'gone' } })).toBeNull();
    expect(await db().user.findUnique({ where: { id: 'history' } })).toMatchObject({ active: false });
    // Created here and not uploaded yet: the server cannot have deleted what it never had.
    expect(await db().user.findUnique({ where: { id: 'fresh' } })).not.toBeNull();
  });

  it('creates a user it does not have yet, marked as the server copy', async () => {
    serve([serverUser({ id: 'new', phone: '998909999999' })]);
    await syncUsers();
    expect(await db().user.findUnique({ where: { id: 'new' } })).toMatchObject({ synced: true });
  });
});

describe('uploadUsers', () => {
  it('sends a profile only for users changed here, then hands them back to the server', async () => {
    await local({ id: 'server-owned', phone: '998901010101', debt: 5000 });
    await local({ id: 'edited-here', phone: '998902020202', nameRu: 'Правка', synced: false });
    serve([]);

    await uploadUsers(db(), token);

    const { users } = posted[0] as { users: Record<string, unknown>[] };
    const byId = Object.fromEntries(users.map((u) => [u.id, u]));
    expect(byId['server-owned']).toEqual({
      id: 'server-owned',
      phone: '998901010101',
      debt: 5000,
      debtDueDate: null,
    });
    expect(byId['edited-here']).toMatchObject({ nameRu: 'Правка', role: 'USER', active: true, password: 'hash' });
    expect((await db().user.findUnique({ where: { id: 'edited-here' } })).synced).toBe(true);
  });
});
