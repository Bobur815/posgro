import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * Fiscal state of uploaded sales, against a real SQLite database.
 *
 * The server needs it for bank turnover (fiscalised cash), and cannot get it from the sale upload:
 * a sale is sent before the fiscal device answers, and a credit sale is fiscalized only at payoff.
 */

const dataDir = mkdtempSync(join(tmpdir(), 'posgro-fiscal-sync-'));
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

import { initializeDatabase, closeDatabase, getPrismaClient } from '../database/sqlite-client';
import { resetMissingEndpoints } from './missing-endpoints';
import { syncFiscalStatus } from './fiscal-status-sync';

const db = () => getPrismaClient();

let posted: { sales: { receiptNumber: string; fiscalTender: string }[] }[] = [];
function serve(status: number, synced: (receipts: string[]) => string[] = (r) => r) {
  posted = [];
  global.fetch = jest.fn(async (_url: string, init?: { body?: string }) => {
    const body = JSON.parse(init?.body ?? '{}');
    posted.push(body);
    const receipts = (body.sales ?? []).map((s: { receiptNumber: string }) => s.receiptNumber);
    return {
      ok: status < 300,
      status,
      json: async () => ({ synced: synced(receipts) }),
    };
  }) as unknown as typeof fetch;
}

const sale = (id: string, over: Record<string, unknown> = {}) =>
  db().sale.create({
    data: {
      id,
      receiptNumber: `R-${id}`,
      totalAmount: 10000,
      finalAmount: 10000,
      paidAmount: 10000,
      paymentMethod: 'cash',
      cashierId: 'cashier',
      cashierName: 'Kassir',
      terminalId: 'T1',
      fiscalStatus: 'FISCALIZED',
      regosFiscalAt: new Date('2026-10-01T10:00:00Z'),
      synced: true,
      fiscalSynced: false,
      ...over,
    },
  });

const flag = async (id: string) =>
  (
    await db().sale.findUnique({
      where: { id },
      select: { fiscalSynced: true },
    })
  ).fiscalSynced;

beforeAll(async () => {
  await initializeDatabase();
});

beforeEach(async () => {
  resetMissingEndpoints();
  await db().saleItem.deleteMany({});
  await db().sale.deleteMany({});
});

afterAll(async () => {
  await closeDatabase();
  rmSync(dataDir, { recursive: true, force: true });
});

describe('syncFiscalStatus', () => {
  it('sends a fiscalized, uploaded sale with its fiscal tender, then marks it sent', async () => {
    await sale('a', { paymentMethod: 'card' });
    serve(201);

    await syncFiscalStatus();
    expect(posted[0].sales).toEqual([
      expect.objectContaining({
        receiptNumber: 'R-a',
        fiscalStatus: 'FISCALIZED',
        fiscalTender: 'card',
      }),
    ]);
    expect(await flag('a')).toBe(true);
  });

  it('waits for the sale itself to reach the server first', async () => {
    await sale('a', { synced: false });
    serve(201);

    await syncFiscalStatus();
    expect(posted).toHaveLength(0);
    expect(await flag('a')).toBe(false);
  });

  it('keeps the flag against a server from before the endpoint', async () => {
    await sale('a');
    serve(404);

    await syncFiscalStatus();
    expect(await flag('a')).toBe(false);
  });

  it('does not let a receipt the server no longer has block the ones behind it', async () => {
    await sale('gone', { createdAt: new Date('2026-09-01T00:00:00Z') });
    await sale('b');
    serve(201, (receipts) => receipts.filter((r) => r !== 'R-gone'));

    await syncFiscalStatus();
    expect(await flag('gone')).toBe(true);
    expect(await flag('b')).toBe(true);
  });

  it('leaves a sale that was never fiscalized alone', async () => {
    await sale('a', { fiscalSynced: true, fiscalStatus: 'PENDING' });
    serve(201);

    await syncFiscalStatus();
    expect(posted).toHaveLength(0);
  });
});
