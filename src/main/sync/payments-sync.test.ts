import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * Split-payment lines going up, against a real SQLite database: only for sales the server has,
 * a receipt's lines together, and nothing marked sent that the server did not record.
 */

const dataDir = mkdtempSync(join(tmpdir(), 'posgro-payments-sync-'));
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

import { initializeDatabase, closeDatabase, getPrismaClient } from '../database/sqlite-client';
import { resetMissingEndpoints } from './missing-endpoints';
import { syncSalePayments } from './payments-sync';

const db = () => getPrismaClient();

type Posted = {
  sales: { receiptNumber: string; payments: { method: string; amount: string }[] }[];
};
let posted: Posted[] = [];
function serve(status: number, synced: (receipts: string[]) => string[] = (r) => r) {
  posted = [];
  global.fetch = jest.fn(async (_url: string, init?: { body?: string }) => {
    const body = JSON.parse(init?.body ?? '{}') as Posted;
    posted.push(body);
    return {
      ok: status < 300,
      status,
      json: async () => ({ synced: synced(body.sales.map((s) => s.receiptNumber)) }),
    };
  }) as unknown as typeof fetch;
}

async function splitSale(id: string, synced: boolean, lines: Array<[string, number]>) {
  await db().$executeRawUnsafe(
    `INSERT INTO sales (id, receipt_number, total_amount, final_amount, paid_amount, payment_method,
                        cashier_id, cashier_name, terminal_id, synced)
     VALUES (?, ?, 100000, 100000, 100000, 'mixed', 'c1', 'Cashier', 'T1', ?)`,
    id,
    `R-${id}`,
    synced ? 1 : 0,
  );
  for (const [method, amount] of lines) {
    await db().$executeRawUnsafe(
      `INSERT INTO sale_payments (id, sale_id, method, amount) VALUES (?, ?, ?, ?)`,
      `${id}-${method}`,
      id,
      method,
      amount,
    );
  }
}

const unsent = async () =>
  (
    (await db().$queryRawUnsafe(`SELECT id FROM sale_payments WHERE synced = 0 ORDER BY id`)) as {
      id: string;
    }[]
  ).map((r) => r.id);

beforeAll(async () => {
  await initializeDatabase();
});
afterAll(async () => {
  await closeDatabase();
});
beforeEach(() => resetMissingEndpoints());

describe('syncSalePayments', () => {
  it("sends a synced sale's lines together and marks them sent", async () => {
    await splitSale('a', true, [
      ['cash', 55000],
      ['card', 45000],
    ]);
    await splitSale('b', false, [
      ['cash', 50000],
      ['click', 50000],
    ]);
    serve(201);
    await syncSalePayments();

    expect(posted).toHaveLength(1);
    expect(posted[0].sales).toEqual([
      {
        receiptNumber: 'R-a',
        payments: expect.arrayContaining([
          { method: 'cash', amount: '55000.00' },
          { method: 'card', amount: '45000.00' },
        ]),
      },
    ]);
    // b's sale has not reached the server yet: its lines wait.
    expect(await unsent()).toEqual(['b-cash', 'b-click']);
  });

  it('keeps the lines unsent on an older server (404) and does not ask again at once', async () => {
    await db().$executeRawUnsafe(`UPDATE sales SET synced = 1 WHERE id = 'b'`);
    serve(404);
    await syncSalePayments();
    expect(await unsent()).toEqual(['b-cash', 'b-click']);

    serve(201);
    await syncSalePayments();
    expect(posted).toHaveLength(0); // backing off after the 404
  });

  it('leaves a receipt the server did not record unsent', async () => {
    serve(201, () => []);
    await syncSalePayments();
    expect(posted).toHaveLength(1);
    expect(await unsent()).toEqual(['b-cash', 'b-click']);

    serve(201);
    await syncSalePayments();
    expect(await unsent()).toEqual([]);
  });
});
