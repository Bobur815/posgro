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
import { markDueDateChanged, readDirtyDueDates } from './debt-due-dates';

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
  await db().systemSetting.deleteMany({
    where: { key: { in: ['debt_due_dates_dirty', 'debt_ledger_balance_mode'] } },
  });
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
    // No due date: this till did not set it, so the server's copy stands (debt-due-dates.ts).
    expect(byId['server-owned']).toEqual({ id: 'server-owned', phone: '998901010101', debt: 5000 });
    expect(byId['edited-here']).toMatchObject({ nameRu: 'Правка', role: 'USER', active: true, password: 'hash' });
    expect((await db().user.findUnique({ where: { id: 'edited-here' } })).synced).toBe(true);
  });
});

describe('nasiya fields between tills', () => {
  const due = new Date('2026-11-01T00:00:00.000Z');

  it('leaves the balance out once the server derives it from the ledger', async () => {
    await local({ id: 'c1', phone: '998901212121', role: 'CLIENT', debt: 40000 });
    await db().systemSetting.create({ data: { key: 'debt_ledger_balance_mode', value: 'ledger' } });
    serve([]);

    await uploadUsers(db(), token);
    const [sent] = (posted[0] as { users: Record<string, unknown>[] }).users;
    // The bug: every till sent its own total for every customer, and the last one won.
    expect(sent).not.toHaveProperty('debt');
  });

  it('sends a due date only from the till that set it, then stops', async () => {
    await local({ id: 'c2', phone: '998902323232', role: 'CLIENT', debtDueDate: due });
    await markDueDateChanged(db(), 'c2');
    serve([]);

    await uploadUsers(db(), token);
    const [first] = (posted[0] as { users: Record<string, unknown>[] }).users;
    expect(first.debtDueDate).toBe(due.toISOString());
    expect(await readDirtyDueDates(db())).toEqual({});

    serve([]);
    await uploadUsers(db(), token);
    const [second] = (posted[0] as { users: Record<string, unknown>[] }).users;
    expect(second).not.toHaveProperty('debtDueDate');
  });

  it('keeps a due date queued when the upload fails', async () => {
    await local({ id: 'c3', phone: '998903434343', role: 'CLIENT', debtDueDate: due });
    await markDueDateChanged(db(), 'c3');
    global.fetch = jest.fn(async () => ({
      ok: false, status: 500, statusText: 'x', json: async () => ({}), text: async () => 'boom',
    })) as unknown as typeof fetch;

    await uploadUsers(db(), token);
    expect(Object.keys(await readDirtyDueDates(db()))).toEqual(['c3']);
  });

  it("takes another till's due date on the pull, but not over one set here and unsent", async () => {
    const serverDue = '2026-12-15T00:00:00.000Z';
    await local({ id: 'c4', phone: '998904545454', role: 'CLIENT', debtDueDate: null, debt: 7000 });
    await local({ id: 'c5', phone: '998905656565', role: 'CLIENT', debtDueDate: due });
    await markDueDateChanged(db(), 'c5');
    serve([
      { ...serverUser({ id: 'c4', phone: '998904545454', role: 'CLIENT' }), debtDueDate: serverDue, debt: 1 } as ServerUser,
      { ...serverUser({ id: 'c5', phone: '998905656565', role: 'CLIENT' }), debtDueDate: serverDue } as ServerUser,
    ]);

    await syncUsers();
    const c4 = await db().user.findUnique({ where: { id: 'c4' } });
    expect(new Date(c4.debtDueDate).toISOString()).toBe(serverDue);
    // The balance is never taken from the pull: the ledger owns it.
    expect(Number(c4.debt)).toBe(7000);
    const c5 = await db().user.findUnique({ where: { id: 'c5' } });
    expect(new Date(c5.debtDueDate).toISOString()).toBe(due.toISOString());
  });
});
