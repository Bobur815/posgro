import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * Nasiya across tills, against a real SQLite database playing T2.
 *
 * The bug this guards: a debt taken on T1 never reached T2. T2 learned a customer's balance once,
 * when the user first arrived, and nothing after; the ledger went up to the server and never came
 * back down. So T2 showed a stale balance and an empty history, could not settle T1's credit
 * receipts, and those receipts were never fiscalized. On the way up, the till marked the first N
 * rows as sent when the server took N — losing any row the server skipped mid-batch.
 */

const dataDir = mkdtempSync(join(tmpdir(), 'posgro-debt-ledger-sync-'));
// Generous: database init alone can take tens of seconds when the whole suite runs in parallel.
jest.setTimeout(60_000);

jest.mock('electron', () => ({
  app: {
    getPath: () => dataDir,
    getAppPath: () => require('path').join(__dirname, '..', '..', '..'),
  },
}));
jest.mock('../config/app-config', () => ({
  getAppConfig: () => ({ vpsApiUrl: 'https://vps.test/api', terminalId: 'T2' }),
}));
jest.mock('./queue-manager', () => ({ getServerToken: () => 'token' }));
const fiscalizeSettledSale = jest.fn(async () => undefined);
jest.mock('../sales/settle-sale', () => ({ fiscalizeSettledSale }));

import { initializeDatabase, closeDatabase, getPrismaClient } from '../database/sqlite-client';
import { resetMissingEndpoints } from './missing-endpoints';
import { pullDebtLedger, type RemoteLedgerRow } from './debt-ledger-sync';
import { uploadNasiya } from './upload-sync';
import { allocatePayment } from '../sales/debt-ledger';

const db = () => getPrismaClient();

const remote = (over: Partial<RemoteLedgerRow> = {}): RemoteLedgerRow => ({
  id: 'c1',
  userId: 'u1',
  type: 'CHARGE',
  amount: '70000',
  paymentMethod: null,
  saleId: 's1',
  settledAt: null,
  dueDate: null,
  note: null,
  createdBy: 'cashier',
  createdAt: '2026-10-01T08:00:00.000Z',
  updatedAt: '2026-10-01T08:00:01.000Z',
  originTerminalId: 'T1',
  settleTender: null,
  settleFiscalize: null,
  ...over,
});

type Page = {
  rows: RemoteLedgerRow[];
  nextCursor: null;
  balanceFromLedger?: boolean;
};
let requests: string[] = [];
let posted: { url: string; body: unknown }[] = [];

/** The VPS: answers the ledger pull with `page`, and every POST with `postReply`. */
function serve(page: Page | 404, postReply: (url: string, body: unknown) => unknown = () => ({})) {
  requests = [];
  posted = [];
  global.fetch = jest.fn(async (url: string, init?: { method?: string; body?: string }) => {
    requests.push(String(url));
    if (init?.method === 'POST') {
      const body = JSON.parse(init.body ?? '{}');
      posted.push({ url: String(url), body });
      const reply = postReply(String(url), body);
      return {
        ok: true,
        status: 201,
        json: async () => reply,
        text: async () => '',
      };
    }
    if (page === 404)
      return {
        ok: false,
        status: 404,
        json: async () => ({}),
        text: async () => '',
      };
    return {
      ok: true,
      status: 200,
      json: async () => page,
      text: async () => '',
    };
  }) as unknown as typeof fetch;
}

const customer = (id: string, debt = 0) =>
  db().user.create({
    data: {
      id,
      phone: `99890${id.padStart(7, '0')}`.slice(0, 12),
      password: 'x',
      role: 'CLIENT',
      nameUz: id,
      nameRu: id,
      storeId: 'S1',
      synced: true,
      debt,
    },
  });

/** A credit sale rung up on THIS till, waiting for its payoff to be fiscalized. */
const creditSale = (id: string) =>
  db().sale.create({
    data: {
      id,
      receiptNumber: `R-${id}`,
      totalAmount: 70000,
      finalAmount: 70000,
      paidAmount: 0,
      debtAmount: 70000,
      debtUserId: 'u1',
      paymentMethod: 'debt',
      cashierId: 'cashier',
      cashierName: 'Kassir',
      terminalId: 'T2',
      fiscalStatus: 'DEFERRED_DEBT',
    },
  });

beforeAll(async () => {
  await initializeDatabase();
  await db().localConfig.upsert({
    where: { id: 'config' },
    update: { storeId: 'S1' },
    create: {
      id: 'config',
      storeId: 'S1',
      storeName: 'Test',
      terminalId: 'T2',
      apiUrl: 'https://vps.test/api',
    },
  });
});

beforeEach(async () => {
  resetMissingEndpoints();
  fiscalizeSettledSale.mockClear();
  await db().debtTransaction.deleteMany({});
  await db().saleItem.deleteMany({});
  await db().sale.deleteMany({});
  await db().user.deleteMany({});
  await db().systemSetting.deleteMany({
    where: { key: { in: ['debt_ledger_cursor', 'debt_ledger_balance_mode'] } },
  });
});

afterAll(async () => {
  await closeDatabase();
  rmSync(dataDir, { recursive: true, force: true });
});

describe('pullDebtLedger', () => {
  it("brings T1's charge to T2 as history, marked as already on the server", async () => {
    await customer('u1');
    serve({ rows: [remote()], nextCursor: null });

    await pullDebtLedger();
    expect(await db().debtTransaction.findUnique({ where: { id: 'c1' } })).toMatchObject({
      type: 'CHARGE',
      saleId: 's1',
      originTerminalId: 'T1',
      synced: true,
    });
  });

  it('keeps a settlement made here when a stale copy arrives, and takes an earlier one', async () => {
    await customer('u1');
    const mine = new Date('2026-10-01T10:00:00Z');
    await db().debtTransaction.create({
      data: {
        id: 'c1',
        userId: 'u1',
        type: 'CHARGE',
        amount: 70000,
        createdBy: 'x',
        settledAt: mine,
      },
    });

    serve({ rows: [remote()], nextCursor: null });
    await pullDebtLedger();
    expect((await db().debtTransaction.findUnique({ where: { id: 'c1' } })).settledAt).toEqual(
      mine,
    );

    serve({
      rows: [remote({ settledAt: '2026-10-01T09:00:00.000Z', settleTender: 'card' })],
      nextCursor: null,
    });
    await pullDebtLedger();
    expect(await db().debtTransaction.findUnique({ where: { id: 'c1' } })).toMatchObject({
      settledAt: new Date('2026-10-01T09:00:00.000Z'),
      settleTender: 'card',
    });
  });

  it('stops at a person this till does not have yet and resumes from there', async () => {
    await customer('u1');
    serve({
      rows: [
        remote({ id: 'a', updatedAt: '2026-10-01T08:00:01.000Z' }),
        remote({
          id: 'b',
          userId: 'later',
          updatedAt: '2026-10-01T08:00:02.000Z',
        }),
        remote({ id: 'c', updatedAt: '2026-10-01T08:00:03.000Z' }),
      ],
      nextCursor: null,
    });

    await pullDebtLedger();
    expect(await db().debtTransaction.count()).toBe(1);

    serve({ rows: [], nextCursor: null });
    await pullDebtLedger();
    expect(requests[0]).toContain('afterId=a');
  });

  it("leaves the stored balance alone until the server's ledger flag is on", async () => {
    await customer('u1', 12345);
    serve({ rows: [remote()], nextCursor: null, balanceFromLedger: false });
    await pullDebtLedger();
    expect(Number((await db().user.findUnique({ where: { id: 'u1' } })).debt)).toBe(12345);
  });

  it('with the flag, sets every balance to its ledger — including rows pulled before', async () => {
    await customer('u1', 12345);
    serve({ rows: [remote()], nextCursor: null, balanceFromLedger: false });
    await pullDebtLedger();

    // Nothing new on this page, but the switch just turned on: the old rows still count.
    serve({ rows: [], nextCursor: null, balanceFromLedger: true });
    await pullDebtLedger();
    expect(Number((await db().user.findUnique({ where: { id: 'u1' } })).debt)).toBe(70000);
  });

  it('fiscalizes a receipt held here once another till has settled it', async () => {
    await customer('u1');
    await creditSale('s1');
    serve({
      rows: [
        remote({
          settledAt: '2026-10-01T09:00:00.000Z',
          settleTender: 'card',
          settleFiscalize: true,
        }),
      ],
      nextCursor: null,
    });

    await pullDebtLedger();
    expect(fiscalizeSettledSale).toHaveBeenCalledWith('s1', 'card');
  });

  it('does not fiscalize when the shop chose "without fiscalization", or the sale is elsewhere', async () => {
    await customer('u1');
    await creditSale('s1');
    serve({
      rows: [
        remote({
          settledAt: '2026-10-01T09:00:00.000Z',
          settleFiscalize: false,
        }),
        remote({
          id: 'c2',
          saleId: 'not-here',
          settledAt: '2026-10-01T09:00:00.000Z',
        }),
      ],
      nextCursor: null,
    });

    await pullDebtLedger();
    expect(fiscalizeSettledSale).not.toHaveBeenCalled();
  });

  it('changes nothing against a server from before the endpoint', async () => {
    await customer('u1', 500);
    serve(404);
    await pullDebtLedger();
    expect(await db().debtTransaction.count()).toBe(0);
    expect(Number((await db().user.findUnique({ where: { id: 'u1' } })).debt)).toBe(500);

    // And it does not ask again on the next cycle: a 404 per cycle is what fail2ban bans.
    serve(404);
    await pullDebtLedger();
    expect(requests).toHaveLength(0);
  });
});

describe('uploadNasiya', () => {
  const row = (id: string, userId = 'u1') =>
    db().debtTransaction.create({
      data: { id, userId, type: 'CHARGE', amount: 1000, createdBy: 'x' },
    });

  it('marks exactly the rows the server took, never the first N', async () => {
    await customer('u1');
    await row('a');
    await row('b');
    await row('c');
    serve({ rows: [], nextCursor: null }, (url) =>
      url.endsWith('/debtors/sync-bulk') ? { synced: 2, skipped: 1, syncedIds: ['a', 'c'] } : {},
    );

    await uploadNasiya({ staffUploaded: false });
    const synced = await db().debtTransaction.findMany({
      where: { synced: true },
    });
    expect(synced.map((r: { id: string }) => r.id).sort()).toEqual(['a', 'c']);
  });

  it('against an older server, marks rows only when it took the whole batch', async () => {
    await customer('u1');
    await row('a');
    await row('b');
    serve({ rows: [], nextCursor: null }, (url) =>
      url.endsWith('/debtors/sync-bulk') ? { synced: 1, skipped: 1 } : {},
    );

    await uploadNasiya({ staffUploaded: false });
    expect(await db().debtTransaction.count({ where: { synced: true } })).toBe(0);
  });

  it('sends customers from any session, and the origin and settlement with each row', async () => {
    await customer('u1');
    await row('a');
    serve({ rows: [], nextCursor: null }, (url) =>
      url.endsWith('/debtors/sync-bulk') ? { synced: 1, syncedIds: ['a'] } : {},
    );

    await uploadNasiya({ staffUploaded: false });
    expect(posted.map((p) => p.url)).toEqual([
      'https://vps.test/api/users/clients/sync-bulk',
      'https://vps.test/api/debtors/sync-bulk',
    ]);
    expect(posted[1].body).toMatchObject({
      transactions: [{ id: 'a', originTerminalId: 'T2' }],
    });
  });

  it('re-sends a charge once it is settled, with how it was paid', async () => {
    await customer('u1');
    await db().debtTransaction.create({
      data: {
        id: 'c1',
        userId: 'u1',
        type: 'CHARGE',
        amount: 1000,
        createdBy: 'x',
        synced: true,
      },
    });
    await db().debtTransaction.create({
      data: {
        id: 'p1',
        userId: 'u1',
        type: 'PAYMENT',
        amount: -1000,
        createdBy: 'x',
        synced: true,
      },
    });

    await allocatePayment(db(), 'u1', { tender: 'card', fiscalize: false });
    expect(await db().debtTransaction.findUnique({ where: { id: 'c1' } })).toMatchObject({
      synced: false,
      settleTender: 'card',
      settleFiscalize: false,
    });
  });
});
