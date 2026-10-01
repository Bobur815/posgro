import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * Deleting (voiding) a nasiya ledger row, against a real SQLite database.
 *
 * An admin may undo a payment or adjustment entered by mistake. The row must stay — the history has
 * to show what happened and that it was undone — while the balance, the allocator and every other
 * till stop counting it. What cannot be undone from the ledger is refused: a credit sale's charge
 * (that is a sale return) and money that already paid off receipts (a settlement is never reopened).
 */

const dataDir = mkdtempSync(join(tmpdir(), 'posgro-debt-void-'));
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
jest.mock('../sync/queue-manager', () => ({ getServerToken: () => 'token' }));
jest.mock('./settle-sale', () => ({
  fiscalizeSettledSale: jest.fn(async () => undefined),
}));
const addShiftMovement = jest.fn(async () => undefined);
let openShift: { id: string } | null = null;
jest.mock('./shifts', () => ({
  currentShift: jest.fn(async () => openShift),
  addShiftMovement: (...args: unknown[]) => addShiftMovement(...(args as [])),
}));

import { initializeDatabase, closeDatabase, getPrismaClient } from '../database/sqlite-client';
import { resetMissingEndpoints } from '../sync/missing-endpoints';
import { recordDebtPayment, voidDebtTransaction, debtorLedger } from './debtors';
import { pullDebtLedger } from '../sync/debt-ledger-sync';

const db = () => getPrismaClient();
const admin = { id: 'admin', phone: '998900000001' };

async function customer(debt = 0) {
  await db().user.create({
    data: {
      id: 'u1',
      phone: '998901234567',
      password: 'x',
      role: 'CLIENT',
      nameUz: 'Ali',
      nameRu: 'Али',
      storeId: 'S1',
      synced: true,
      debt,
    },
  });
}

/** A credit sale's charge, as commitSale writes it: on the ledger and on the balance. */
async function charge(id: string, amount: number) {
  await db().debtTransaction.create({
    data: {
      id,
      userId: 'u1',
      type: 'CHARGE',
      amount,
      saleId: `sale-${id}`,
      createdBy: 'cashier',
    },
  });
  await db().user.update({
    where: { id: 'u1' },
    data: { debt: { increment: amount } },
  });
}

const balance = async () => Number((await db().user.findUnique({ where: { id: 'u1' } })).debt);
const payments = () => db().debtTransaction.findMany({ where: { type: 'PAYMENT' } });

beforeAll(async () => {
  await initializeDatabase();
  await db().localConfig.upsert({
    where: { id: 'config' },
    update: { storeId: 'S1' },
    create: {
      id: 'config',
      storeId: 'S1',
      storeName: 'Test',
      terminalId: 'T1',
      apiUrl: 'https://vps.test/api',
    },
  });
});

beforeEach(async () => {
  resetMissingEndpoints();
  openShift = null;
  addShiftMovement.mockClear();
  await db().debtTransaction.deleteMany({});
  await db().user.deleteMany({});
  await db().$executeRawUnsafe(`DELETE FROM audit_logs WHERE action = 'void_debt_transaction'`);
});

afterAll(async () => {
  await closeDatabase();
  rmSync(dataDir, { recursive: true, force: true });
});

describe('voidDebtTransaction', () => {
  it('keeps the row, stamps who and why, and puts the balance back', async () => {
    await customer();
    await charge('c1', 100000);
    await recordDebtPayment(
      { userId: 'u1', amount: 30000, paymentMethod: 'card' },
      'cashier',
      'T1',
    );
    const [p] = await payments();
    expect(await balance()).toBe(70000);

    await voidDebtTransaction(
      { userId: 'u1', transactionId: p.id, reason: 'не та сумма' },
      admin,
      'T1',
    );

    expect(await balance()).toBe(100000);
    expect(await db().debtTransaction.findUnique({ where: { id: p.id } })).toMatchObject({
      voidedBy: 'admin',
      voidReason: 'не та сумма',
      // Queued, so the server and the other tills learn of it.
      synced: false,
    });
    const ledger = await debtorLedger('u1');
    // Still in the history, and the screen's own check agrees with the stored balance.
    expect(ledger.transactions).toHaveLength(2);
    expect(ledger.ledgerBalance).toBe(100000);
    const audit = (await db().$queryRawUnsafe(
      `SELECT entity_id FROM audit_logs WHERE action = 'void_debt_transaction'`,
    )) as { entity_id: string }[];
    expect(audit.map((a) => a.entity_id)).toEqual([p.id]);
  });

  it('refuses money that already paid off a receipt', async () => {
    await customer();
    await charge('c1', 50000);
    await recordDebtPayment(
      { userId: 'u1', amount: 50000, paymentMethod: 'cash' },
      'cashier',
      'T1',
    );
    const [p] = await payments();

    await expect(
      voidDebtTransaction({ userId: 'u1', transactionId: p.id }, admin, 'T1'),
    ).rejects.toThrow('debtors.errors.void_payment_settled');
    expect(await balance()).toBe(0);
    expect((await db().debtTransaction.findUnique({ where: { id: p.id } })).voidedAt).toBeNull();
  });

  it("refuses a credit sale's charge — that is a sale return", async () => {
    await customer();
    await charge('c1', 50000);
    await expect(
      voidDebtTransaction({ userId: 'u1', transactionId: 'c1' }, admin, 'T1'),
    ).rejects.toThrow('debtors.errors.void_sale_charge');
  });

  it('refuses a second void, and a row of another person', async () => {
    await customer();
    await charge('c1', 100000);
    await recordDebtPayment({ userId: 'u1', amount: 1000, paymentMethod: 'card' }, 'cashier', 'T1');
    const [p] = await payments();
    await voidDebtTransaction({ userId: 'u1', transactionId: p.id }, admin, 'T1');

    await expect(
      voidDebtTransaction({ userId: 'u1', transactionId: p.id }, admin, 'T1'),
    ).rejects.toThrow('debtors.errors.already_voided');
    await expect(
      voidDebtTransaction({ userId: 'someone-else', transactionId: p.id }, admin, 'T1'),
    ).rejects.toThrow('debtors.errors.not_found');
  });

  it('takes a voided cash payment back out of the open shift', async () => {
    await customer();
    await charge('c1', 100000);
    openShift = { id: 'shift-1' };
    await recordDebtPayment(
      { userId: 'u1', amount: 20000, paymentMethod: 'cash' },
      'cashier',
      'T1',
    );
    addShiftMovement.mockClear();
    const [p] = await payments();

    await voidDebtTransaction({ userId: 'u1', transactionId: p.id }, admin, 'T1');
    expect(addShiftMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        smenaId: 'shift-1',
        type: 'PAY_OUT',
        amount: 20000,
      }),
    );
  });

  it('a voided payment no longer pays anything off', async () => {
    await customer();
    await charge('c1', 50000);
    await recordDebtPayment(
      { userId: 'u1', amount: 30000, paymentMethod: 'card' },
      'cashier',
      'T1',
    );
    const [p] = await payments();
    await voidDebtTransaction({ userId: 'u1', transactionId: p.id }, admin, 'T1');

    // 30 000 voided + 20 000 now is not 50 000: the receipt stays open.
    const { settledSales } = await recordDebtPayment(
      { userId: 'u1', amount: 20000, paymentMethod: 'card' },
      'cashier',
      'T1',
    );
    expect(settledSales).toEqual([]);
  });
});

describe('a void made on another till', () => {
  it('arrives with the pull and is never undone by a stale copy', async () => {
    await customer();
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
    const row = {
      id: 'p1',
      userId: 'u1',
      type: 'PAYMENT',
      amount: '-1000',
      paymentMethod: 'CASH',
      saleId: null,
      settledAt: null,
      dueDate: null,
      note: null,
      createdBy: 'x',
      createdAt: '2026-10-01T08:00:00.000Z',
      updatedAt: '2026-10-01T09:00:00.000Z',
      originTerminalId: 'T2',
      settleTender: null,
      settleFiscalize: null,
    };
    const serve = (rows: unknown[]) => {
      global.fetch = jest.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          rows,
          nextCursor: null,
          balanceFromLedger: false,
        }),
      })) as unknown as typeof fetch;
    };

    serve([
      {
        ...row,
        voidedAt: '2026-10-01T09:00:00.000Z',
        voidedBy: 'admin2',
        voidReason: 'дубль',
      },
    ]);
    await pullDebtLedger();
    expect(await db().debtTransaction.findUnique({ where: { id: 'p1' } })).toMatchObject({
      voidedBy: 'admin2',
      voidReason: 'дубль',
    });

    serve([{ ...row, updatedAt: '2026-10-01T10:00:00.000Z' }]);
    await pullDebtLedger();
    expect(
      (await db().debtTransaction.findUnique({ where: { id: 'p1' } })).voidedAt,
    ).not.toBeNull();
  });
});
