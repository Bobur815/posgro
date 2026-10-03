/**
 * Switching a store to DEBT_BALANCE_FROM_LEDGER: stored balances must become the ledger's sum at
 * start-up, not only for the people whose next operation happens to arrive.
 *
 * The case this guards is production store 1234 (2026-10-03): the stored balance was T1's charges
 * only, T2's were in the ledger but missing from the total.
 */
import { Prisma } from '@prisma/client';
import { DebtorsService } from './debtors.service';

const D = (v: number) => new Prisma.Decimal(v);

type Row = { storeId: string; userId: string; amount: Prisma.Decimal; voided?: boolean };
type U = { id: string; storeId: string; debt: Prisma.Decimal };

function service(rows: Row[], users: U[]) {
  const updates: { id: string; debt: Prisma.Decimal }[] = [];
  const prisma = {
    debtTransaction: {
      groupBy: jest.fn(async (args: { where?: { voidedAt: null }; _sum?: unknown }) => {
        const live = args.where ? rows.filter((r) => !r.voided) : rows;
        const by = new Map<string, Row[]>();
        for (const r of live)
          by.set(`${r.storeId}:${r.userId}`, [...(by.get(`${r.storeId}:${r.userId}`) ?? []), r]);
        return [...by.values()].map((g) => ({
          storeId: g[0].storeId,
          userId: g[0].userId,
          ...(args._sum ? { _sum: { amount: g.reduce((s, r) => s.plus(r.amount), D(0)) } } : {}),
        }));
      }),
    },
    user: {
      findMany: jest.fn(async () => users),
      updateMany: jest.fn(
        async ({ where, data }: { where: { id: string }; data: { debt: Prisma.Decimal } }) => {
          updates.push({ id: where.id, debt: data.debt });
          return { count: 1 };
        },
      ),
    },
  };
  return { svc: new DebtorsService(prisma as never), updates, prisma };
}

describe('DebtorsService.alignAllBalances', () => {
  it("adds the other till's charges a stale stored total left out", async () => {
    const { svc, updates } = service(
      [
        { storeId: '1234', userId: 'staff', amount: D(391568) }, // T1's charges
        { storeId: '1234', userId: 'staff', amount: D(374520) }, // T2's charges
      ],
      [{ id: 'staff', storeId: '1234', debt: D(391568) }],
    );
    const res = await svc.alignAllBalances();
    expect(res).toEqual({ checked: 1, corrected: 1, withoutLedger: 0 });
    expect(updates).toEqual([{ id: 'staff', debt: D(766088) }]);
  });

  it('changes nothing when balances already match — a second start is a no-op', async () => {
    const { svc, updates } = service(
      [
        { storeId: 'S', userId: 'a', amount: D(5000) },
        { storeId: 'S', userId: 'a', amount: D(-2000) },
      ],
      [{ id: 'a', storeId: 'S', debt: D(3000) }],
    );
    expect((await svc.alignAllBalances()).corrected).toBe(0);
    expect(updates).toEqual([]);
  });

  it('counts voided rows as nothing, and zeroes a person whose only row was voided', async () => {
    const { svc, updates } = service(
      [{ storeId: 'S', userId: 'v', amount: D(9000), voided: true }],
      [{ id: 'v', storeId: 'S', debt: D(9000) }],
    );
    await svc.alignAllBalances();
    expect(updates).toEqual([{ id: 'v', debt: D(0) }]);
  });

  it('leaves a balance with no ledger rows behind it alone', async () => {
    const { svc, updates } = service([], [{ id: 'old', storeId: 'S', debt: D(12000) }]);
    expect(await svc.alignAllBalances()).toEqual({ checked: 0, corrected: 0, withoutLedger: 1 });
    expect(updates).toEqual([]);
  });
});

describe('DebtorsService.onApplicationBootstrap', () => {
  const prev = process.env.DEBT_BALANCE_FROM_LEDGER;
  afterEach(() => {
    process.env.DEBT_BALANCE_FROM_LEDGER = prev;
  });

  it('does nothing while the flag is off', async () => {
    delete process.env.DEBT_BALANCE_FROM_LEDGER;
    const { svc, prisma } = service([], []);
    await svc.onApplicationBootstrap();
    expect(prisma.debtTransaction.groupBy).not.toHaveBeenCalled();
  });

  it('aligns on start with the flag on, and never throws', async () => {
    process.env.DEBT_BALANCE_FROM_LEDGER = 'true';
    const { svc, updates, prisma } = service(
      [{ storeId: 'S', userId: 'a', amount: D(100) }],
      [{ id: 'a', storeId: 'S', debt: D(0) }],
    );
    await svc.onApplicationBootstrap();
    expect(updates).toEqual([{ id: 'a', debt: D(100) }]);

    prisma.debtTransaction.groupBy.mockRejectedValueOnce(new Error('db down'));
    await expect(svc.onApplicationBootstrap()).resolves.toBeUndefined();
  });
});
