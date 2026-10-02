/**
 * Paying a debt off, with and without fiscal receipts.
 *
 * When a payment clears the whole balance the till asks whether to fiscalize the receipts it
 * closes, and "no" is a legitimate answer. The handler must then leave those sales alone — they
 * stay DEFERRED_DEBT — while the payment itself is recorded exactly as before.
 */

const handlers = new Map<string, (...args: unknown[]) => unknown>();
jest.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (...a: unknown[]) => unknown) => handlers.set(channel, fn),
  },
}));

const debtor = { id: 'c1', phone: '998900000001', nameRu: 'Клиент', nameUz: 'Mijoz', role: 'CLIENT', debt: 0, debtDueDate: null, active: true, createdAt: new Date() };
const tx = {
  debtTransaction: { create: jest.fn(async () => ({})) },
  user: { update: jest.fn(async () => ({})) },
};
const prismaMock = {
  user: { findUnique: jest.fn(async () => debtor) },
  $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
};
jest.mock('../database/sqlite-client', () => ({ getPrismaClient: () => prismaMock }));
jest.mock('../config/app-config', () => ({ getAppConfig: () => ({ terminalId: 'T1' }) }));
jest.mock('./auth-handlers', () => ({ getCurrentUser: () => ({ id: 'u-staff', role: 'USER' }) }));
jest.mock('../lan/satellite-guard', () => ({ assertNotSatellite: async () => undefined }));
// Not a satellite: these payments are this till's own (a satellite's go to its main).
jest.mock('../lan/role', () => ({ isSatellite: async () => false }));
jest.mock('../sales/debt-ledger', () => ({
  allocatePayment: jest.fn(async () => ['sale-1', 'sale-2']),
  recomputeBalance: jest.fn(async () => 0),
  signedAmount: jest.fn((_t: string, n: number) => -n),
}));
const fiscalizeSettledSale = jest.fn(async () => undefined);
jest.mock('../sales/settle-sale', () => ({
  fiscalizeSettledSale: (...a: unknown[]) => fiscalizeSettledSale(...(a as [])),
}));
jest.mock('../sales/shifts', () => ({ addShiftMovement: jest.fn(), currentShift: jest.fn(async () => null) }));

import { setupDebtorsHandlers } from './debtors-handlers';

function pay(data: Record<string, unknown>) {
  setupDebtorsHandlers();
  const fn = handlers.get('debtors:recordPayment');
  if (!fn) throw new Error('debtors:recordPayment was not registered');
  return (fn as (e: unknown, d: unknown) => Promise<{ settledSales: string[] }>)(null, data);
}

beforeEach(() => jest.clearAllMocks());

describe('debtors:recordPayment fiscalization choice', () => {
  it('fiscalizes every settled sale by default', async () => {
    const res = await pay({ userId: 'c1', amount: 50000, paymentMethod: 'cash' });
    expect(res.settledSales).toEqual(['sale-1', 'sale-2']);
    expect(fiscalizeSettledSale.mock.calls).toEqual([
      ['sale-1', 'cash'],
      ['sale-2', 'cash'],
    ]);
  });

  it('records the payment but fiscalizes nothing when told not to', async () => {
    const res = await pay({ userId: 'c1', amount: 50000, paymentMethod: 'card', fiscalize: false });
    expect(res.settledSales).toEqual(['sale-1', 'sale-2']);
    expect(tx.debtTransaction.create).toHaveBeenCalledTimes(1);
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { debt: { decrement: 50000 } },
    });
    expect(fiscalizeSettledSale).not.toHaveBeenCalled();
  });
});

describe('debtors:recordPayment with Click', () => {
  const shifts = require('../sales/shifts') as { addShiftMovement: jest.Mock; currentShift: jest.Mock };

  beforeEach(() => shifts.currentShift.mockResolvedValue({ id: 'smena-1' }));

  it('records CLICK, fiscalizes the settled receipts as click, and puts nothing in the drawer', async () => {
    await pay({ userId: 'c1', amount: 50000, paymentMethod: 'click' });
    expect(tx.debtTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ paymentMethod: 'CLICK' }) }),
    );
    // settle-sale writes the tender onto the sale; buildPayments sends 'click' to REGOS as cash.
    expect(fiscalizeSettledSale.mock.calls).toEqual([
      ['sale-1', 'click'],
      ['sale-2', 'click'],
    ]);
    expect(shifts.addShiftMovement).not.toHaveBeenCalled();
  });

  it('still records a cash payment as a drawer PAY_IN', async () => {
    await pay({ userId: 'c1', amount: 50000, paymentMethod: 'cash' });
    expect(shifts.addShiftMovement).toHaveBeenCalledWith(
      expect.objectContaining({ smenaId: 'smena-1', type: 'PAY_IN', amount: 50000 }),
    );
  });
});
