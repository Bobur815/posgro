/**
 * Which receipts a non-admin sees in the POS sales history (`sales:getAll`, `sales:getById`).
 *
 * Their own — and every receipt still waiting to be fiscalized, whoever rang it up: the till's
 * "not fiscalized" badge counts the whole store, and any cashier may send one. Editing and
 * deleting are not widened with it (commit-sale's assertMayTouch).
 */

const handlers = new Map<string, (...args: unknown[]) => unknown>();
jest.mock('electron', () => ({
  ipcMain: { handle: (channel: string, fn: (...args: unknown[]) => unknown) => handlers.set(channel, fn) },
}));

let currentUser: { id: string; role: string } | null = { id: 'u-cashier', role: 'USER' };
jest.mock('./auth-handlers', () => ({ getCurrentUser: () => currentUser }));

const prismaMock = {
  sale: {
    findMany: jest.fn(async (_args: { where: Record<string, unknown> }) => [] as unknown[]),
    findUnique: jest.fn(async (): Promise<unknown> => null),
  },
};
jest.mock('../database/sqlite-client', () => ({ getPrismaClient: () => prismaMock }));
jest.mock('../config/app-config', () => ({ getAppConfig: () => ({ terminalId: 'T1' }) }));
jest.mock('../sync/queue-manager', () => ({ getServerToken: () => null }));
jest.mock('../fiscal/regos-vcr-service', () => ({ regosVcrService: {} }));
jest.mock('../printer/thermal-printer', () => ({ printReceipt: jest.fn() }));
jest.mock('../sales/commit-sale', () => ({ commitSale: jest.fn(), deleteSale: jest.fn(), updateSale: jest.fn() }));
jest.mock('../sales/settle-sale', () => ({ settleSale: jest.fn() }));
jest.mock('../lan/role', () => ({ isSatellite: async () => false }));
jest.mock('../lan/satellite-ops', () => ({}));

import { setupSalesHandlers } from './sales-handlers';

setupSalesHandlers();
const getAll = handlers.get('sales:getAll')!;
const getById = handlers.get('sales:getById')!;
const whereOf = () => prismaMock.sale.findMany.mock.calls.at(-1)![0].where;

beforeEach(() => {
  jest.clearAllMocks();
  currentUser = { id: 'u-cashier', role: 'USER' };
});

describe('the sales history a cashier sees', () => {
  it('holds their own receipts and every one still waiting to be fiscalized', async () => {
    await getAll(null, {});
    expect(whereOf().OR).toEqual([
      { cashierId: 'u-cashier' },
      { fiscalStatus: { in: ['FAILED', 'PENDING'] } },
    ]);
    expect(whereOf()).not.toHaveProperty('cashierId');
  });

  it('cannot be widened to another cashier by a filter', async () => {
    await getAll(null, { cashierId: 'u-other' });
    expect(whereOf()).not.toHaveProperty('cashierId');
  });

  it('is everything for an admin', async () => {
    currentUser = { id: 'u-admin', role: 'ADMIN' };
    await getAll(null, {});
    expect(whereOf()).not.toHaveProperty('OR');
    expect(whereOf()).not.toHaveProperty('cashierId');
  });
});

describe('opening one receipt', () => {
  const sale = (over: Record<string, unknown>) => ({ id: 's1', cashierId: 'u-other', fiscalStatus: 'FISCALIZED', items: [], ...over });

  it("opens a colleague's receipt that still needs fiscalizing", async () => {
    prismaMock.sale.findUnique.mockResolvedValueOnce(sale({ fiscalStatus: 'FAILED' }));
    await expect(getById(null, 's1')).resolves.toMatchObject({ id: 's1' });
  });

  it("refuses a colleague's receipt that is already fiscalized", async () => {
    prismaMock.sale.findUnique.mockResolvedValueOnce(sale({}));
    await expect(getById(null, 's1')).rejects.toThrow('Unauthorized');
  });
});
