/**
 * Nasiya ledger replication between tills, server side.
 *
 * Two tills on one store write to one ledger: T1 rings up a credit sale, T2 takes the payment that
 * settles it, and either may re-send a stale copy later. The server merges rather than overwrites,
 * reports exactly which rows it took, and — only under DEBT_BALANCE_FROM_LEDGER — derives the
 * balance from the rows instead of trusting whichever till uploaded last.
 */
import { Prisma } from '@prisma/client';
import { DebtorsService, mergeLedgerRow } from './debtors.service';
import type { SyncDebtTransactionDto } from './dto/sync-debt.dto';

type Txn = {
  id: string;
  storeId: string;
  userId: string;
  amount: Prisma.Decimal;
  settledAt: Date | null;
  settleTender: string | null;
  settleFiscalize: boolean | null;
  originTerminalId: string | null;
};

function service(opts: { users?: { id: string; storeId: string }[]; txns?: Txn[] } = {}) {
  const users = opts.users ?? [{ id: 'u1', storeId: 'S1' }];
  const txns = new Map((opts.txns ?? []).map((t) => [t.id, { ...t }]));
  const prisma = {
    user: {
      findUnique: jest.fn(
        async ({ where }: { where: { id: string } }) =>
          users.find((u) => u.id === where.id) ?? null,
      ),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    debtTransaction: {
      findUnique: jest.fn(
        async ({ where }: { where: { id: string } }) => txns.get(where.id) ?? null,
      ),
      create: jest.fn(async ({ data }: { data: Txn }) => {
        txns.set(data.id, data);
        return data;
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<Txn> }) => {
        const updated = { ...txns.get(where.id)!, ...data };
        txns.set(where.id, updated);
        return updated;
      }),
      groupBy: jest.fn(async () => {
        const sums = new Map<string, Prisma.Decimal>();
        for (const t of txns.values()) {
          sums.set(t.userId, (sums.get(t.userId) ?? new Prisma.Decimal(0)).plus(t.amount));
        }
        return [...sums].map(([userId, amount]) => ({
          userId,
          _sum: { amount },
        }));
      }),
      findMany: jest.fn(async () => []),
    },
  };
  return { svc: new DebtorsService(prisma as never), prisma, txns };
}

const row = (over: Partial<SyncDebtTransactionDto> = {}): SyncDebtTransactionDto => ({
  id: 'c1',
  userId: 'u1',
  type: 'CHARGE',
  amount: '70000',
  saleId: 's1',
  createdBy: 'cashier',
  createdAt: '2026-10-01T08:00:00.000Z',
  ...over,
});

const stored = (over: Partial<Txn> = {}): Txn => ({
  id: 'c1',
  storeId: 'S1',
  userId: 'u1',
  amount: new Prisma.Decimal(70000),
  settledAt: null,
  settleTender: null,
  settleFiscalize: null,
  originTerminalId: 'T1',
  ...over,
});

const none = {
  settledAt: null,
  settleTender: null,
  settleFiscalize: null,
  originTerminalId: null,
  voidedAt: null,
  voidedBy: null,
  voidReason: null,
};

describe('mergeLedgerRow', () => {
  const early = new Date('2026-10-01T09:00:00Z');
  const late = new Date('2026-10-01T10:00:00Z');

  it('takes a settlement the stored row does not have yet, with how it was settled', () => {
    expect(
      mergeLedgerRow(
        { ...none, originTerminalId: 'T1' },
        {
          ...none,
          settledAt: late,
          settleTender: 'card',
          settleFiscalize: false,
        },
      ),
    ).toEqual({
      settledAt: late,
      settleTender: 'card',
      settleFiscalize: false,
    });
  });

  it('never clears a settlement — a stale re-send from the till that wrote the charge', () => {
    expect(mergeLedgerRow({ ...none, settledAt: late, originTerminalId: 'T1' }, none)).toBeNull();
  });

  it('lets the earliest settlement win, whichever till syncs last', () => {
    const a = {
      ...none,
      settledAt: late,
      settleTender: 'cash',
      originTerminalId: 'T1',
    };
    const b = {
      ...none,
      settledAt: early,
      settleTender: 'card',
      originTerminalId: 'T1',
    };
    expect(mergeLedgerRow(a, b)).toMatchObject({
      settledAt: early,
      settleTender: 'card',
    });
    expect(mergeLedgerRow(b, a)).toBeNull();
  });

  it('fills a missing origin and otherwise reports no change', () => {
    expect(mergeLedgerRow(none, { ...none, originTerminalId: 'T2' })).toEqual({
      originTerminalId: 'T2',
    });
    expect(
      mergeLedgerRow({ ...none, originTerminalId: 'T1' }, { ...none, originTerminalId: 'T2' }),
    ).toBeNull();
  });
});

describe('mergeLedgerRow — voids', () => {
  const at = new Date('2026-10-01T11:00:00Z');

  it('takes a void made on another till, with who and why', () => {
    expect(
      mergeLedgerRow(none, { ...none, voidedAt: at, voidedBy: 'admin', voidReason: 'ошибка' }),
    ).toEqual({ voidedAt: at, voidedBy: 'admin', voidReason: 'ошибка' });
  });

  it('never un-voids a row — a stale copy from a till that has not seen the void yet', () => {
    expect(mergeLedgerRow({ ...none, voidedAt: at, voidedBy: 'admin' }, none)).toBeNull();
  });
});

describe('DebtorsService.syncFromTerminal', () => {
  const OLD_ENV = process.env.DEBT_BALANCE_FROM_LEDGER;
  afterEach(() => {
    process.env.DEBT_BALANCE_FROM_LEDGER = OLD_ENV;
  });

  it('names exactly the rows it took, so a skip mid-batch cannot mark the wrong row', async () => {
    const { svc } = service();
    const res = await svc.syncFromTerminal('S1', [
      row({ id: 'a' }),
      row({ id: 'b', userId: 'not-yet-uploaded' }),
      row({ id: 'c' }),
    ]);
    expect(res).toEqual({ synced: 2, skipped: 1, syncedIds: ['a', 'c'] });
  });

  it("refuses another store's user, and a row id another store already holds", async () => {
    const { svc, prisma } = service({
      users: [
        { id: 'u1', storeId: 'S1' },
        { id: 'u2', storeId: 'S2' },
      ],
      txns: [stored({ id: 'foreign', storeId: 'S2' })],
    });
    const res = await svc.syncFromTerminal('S1', [
      row({ id: 'x', userId: 'u2' }),
      row({ id: 'foreign' }),
    ]);
    expect(res).toMatchObject({ synced: 0, skipped: 2 });
    expect(prisma.debtTransaction.create).not.toHaveBeenCalled();
    expect(prisma.debtTransaction.update).not.toHaveBeenCalled();
  });

  it('a stale re-send keeps the settlement another till recorded, and writes nothing', async () => {
    const settled = new Date('2026-10-01T10:00:00Z');
    const { svc, prisma, txns } = service({
      txns: [
        stored({
          settledAt: settled,
          settleTender: 'cash',
          settleFiscalize: true,
        }),
      ],
    });
    const res = await svc.syncFromTerminal('S1', [row()]);
    expect(res.syncedIds).toEqual(['c1']);
    expect(prisma.debtTransaction.update).not.toHaveBeenCalled();
    expect(txns.get('c1')!.settledAt).toEqual(settled);
  });

  it('records a settlement made on another till', async () => {
    const { svc, txns } = service({ txns: [stored()] });
    await svc.syncFromTerminal('S1', [
      row({
        settledAt: '2026-10-01T10:00:00.000Z',
        settleTender: 'card',
        settleFiscalize: false,
      }),
    ]);
    expect(txns.get('c1')).toMatchObject({
      settleTender: 'card',
      settleFiscalize: false,
    });
  });

  it('leaves the balance alone without the flag', async () => {
    delete process.env.DEBT_BALANCE_FROM_LEDGER;
    const { svc, prisma } = service();
    await svc.syncFromTerminal('S1', [row()]);
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it('with the flag, sets the balance to the ledger sum of the people it touched', async () => {
    process.env.DEBT_BALANCE_FROM_LEDGER = 'true';
    const { svc, prisma } = service({ txns: [stored({ id: 'c0' })] });
    await svc.syncFromTerminal('S1', [
      row({ id: 'p1', type: 'PAYMENT', amount: '-20000', saleId: undefined }),
    ]);
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'u1', storeId: 'S1' },
      data: { debt: new Prisma.Decimal(50000) },
    });
  });
});

describe('DebtorsService.pullLedger', () => {
  it('pages on (updatedAt, id) within the store, oldest change first', async () => {
    const { svc, prisma } = service();
    const after = new Date('2026-10-01T10:00:00Z');
    await svc.pullLedger('S1', { updatedAfter: after, afterId: 'c5' }, 50);
    expect(prisma.debtTransaction.findMany).toHaveBeenCalledWith({
      where: {
        storeId: 'S1',
        OR: [{ updatedAt: { gt: after } }, { updatedAt: after, id: { gt: 'c5' } }],
      },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take: 50,
    });
  });

  it('has no next cursor once a page comes back short', async () => {
    const { svc } = service();
    expect((await svc.pullLedger('S1', {})).nextCursor).toBeNull();
  });
});
