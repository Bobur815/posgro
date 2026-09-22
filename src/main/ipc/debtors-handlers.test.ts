/**
 * Who the debtors list is allowed to contain.
 *
 * The requirement is that staff can run a tab for their own store, and the schema always allowed
 * it — `debt` hangs off `User` whatever the role. What did not allow it was this handler, which
 * filtered the list to `role: 'CLIENT'`. That had two consequences: a cashier could never be
 * picked at the till, and — the sharper one — a cashier who already owed money never appeared on
 * the debtors page, so the debt was real and invisible at the same time.
 */

const handlers = new Map<string, (...args: unknown[]) => unknown>();
jest.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (...a: unknown[]) => unknown) => handlers.set(channel, fn),
  },
}));

const prismaMock = {
  user: { findMany: jest.fn(async () => [] as unknown[]) },
};
jest.mock('../database/sqlite-client', () => ({ getPrismaClient: () => prismaMock }));
jest.mock('../config/app-config', () => ({ getAppConfig: () => ({ terminalId: 'T1' }) }));
jest.mock('./auth-handlers', () => ({
  getCurrentUser: () => ({ id: 'u-staff', role: 'USER' }),
}));
jest.mock('../lan/satellite-guard', () => ({ assertNotSatellite: async () => undefined }));
let onSatellite = false;
jest.mock('../lan/role', () => ({ isSatellite: async () => onSatellite }));
const mainDebtors = jest.fn(async (_opts: unknown) => [{ id: 'main-user', nameRu: 'Нодира' }]);
jest.mock('../lan/satellite-ops', () => ({ listDebtors: (opts: unknown) => mainDebtors(opts) }));
jest.mock('../sales/debt-ledger', () => ({
  allocatePayment: jest.fn(async () => []),
  recomputeBalance: jest.fn(async () => 0),
  signedAmount: jest.fn((_t: string, n: number) => n),
}));
jest.mock('../sales/settle-sale', () => ({ fiscalizeSettledSale: jest.fn() }));
jest.mock('../sales/shifts', () => ({ addShiftMovement: jest.fn(), currentShift: jest.fn() }));

import { setupDebtorsHandlers } from './debtors-handlers';

const row = (over: Record<string, unknown>) => ({
  id: 'u1',
  phone: '998900000001',
  nameRu: 'Клиент',
  nameUz: 'Mijoz',
  role: 'CLIENT',
  debt: 0,
  debtDueDate: null,
  active: true,
  createdAt: new Date(),
  ...over,
});

function list() {
  setupDebtorsHandlers();
  const fn = handlers.get('debtors:list');
  if (!fn) throw new Error('debtors:list was not registered');
  return fn as (event: unknown, opts?: Record<string, unknown>) => Promise<unknown[]>;
}

/** The `where` the listing query actually ran with. */
const whereOf = () =>
  (prismaMock.user.findMany.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0]
    .where;

beforeEach(() => {
  jest.clearAllMocks();
  handlers.clear();
  onSatellite = false;
});

describe('who can be given a tab', () => {
  // A satellite holds no users; the ids a credit sale committed on the main must name are the main's.
  it('asks the main on a satellite, and reads nothing of its own', async () => {
    onSatellite = true;
    const rows = await list()(null, { search: 'Нод', includeStaff: true });

    expect(rows).toEqual([{ id: 'main-user', nameRu: 'Нодира' }]);
    expect(mainDebtors).toHaveBeenCalledWith({ search: 'Нод', includeStaff: true });
    expect(prismaMock.user.findMany).not.toHaveBeenCalled();
  });

  it('lists customers only by default', async () => {
    // The debtors page's "show all" means "every customer", not "every person on the till" —
    // listing the whole staff there is noise when the job is chasing debts.
    await list()(null);

    expect(whereOf().role).toBe('CLIENT');
    expect(whereOf().active).toBe(true);
  });

  it('includes staff when the caller is choosing who to give a tab to', async () => {
    await list()(null, { includeStaff: true });

    expect(whereOf()).not.toHaveProperty('role');
  });

  it('returns staff alongside customers, each carrying its role', async () => {
    prismaMock.user.findMany.mockResolvedValueOnce([
      row({ id: 'u1', role: 'CLIENT', nameRu: 'Алишер', debt: 50_000 }),
      row({ id: 'u2', role: 'USER', nameRu: 'Алишер', debt: 30_000 }),
      row({ id: 'u3', role: 'ADMIN', nameRu: 'Бобур', debt: 0 }),
    ]);

    const rows = (await list()(null)) as Array<{ id: string; role: string; debt: number }>;

    expect(rows.map((r) => r.id)).toEqual(['u1', 'u2', 'u3']);
    // The role travels to the renderer: two people share a name here, and only the tag tells the
    // cashier which one works at the shop.
    expect(rows.map((r) => r.role)).toEqual(['CLIENT', 'USER', 'ADMIN']);
    expect(rows[1].debt).toBe(30_000);
  });

  it('never lets a role filter hide a real debt', async () => {
    // The load-bearing rule. A cashier who owes money has to appear on the screen whose whole
    // purpose is showing who owes money — that was the original bug, and scoping the "show all"
    // toggle back to customers must not quietly reintroduce it.
    await list()(null, { withDebtOnly: true });

    expect(whereOf().debt).toEqual({ gt: 0 });
    expect(whereOf()).not.toHaveProperty('role');
  });

  it('searches by name or phone within whatever scope was asked for', async () => {
    await list()(null, { search: 'Али', includeStaff: true });

    const where = whereOf() as { OR?: unknown[] };
    expect(where.OR).toHaveLength(3);
    expect(whereOf()).not.toHaveProperty('role');
  });
});
