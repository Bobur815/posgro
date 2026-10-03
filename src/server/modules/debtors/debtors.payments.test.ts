import { DebtorsService } from './debtors.service';

function service() {
  const findMany = jest.fn(async () => []);
  const prisma = { debtTransaction: { findMany } };
  return { svc: new DebtorsService(prisma as never), findMany };
}

type Args = { where: Record<string, unknown> };
const whereOf = (fn: jest.Mock) => (fn.mock.calls[0] as unknown as [Args])[0].where;

describe('DebtorsService.paymentsInRange', () => {
  it('reads live PAYMENT rows of this store within the period', async () => {
    const { svc, findMany } = service();
    const from = new Date('2026-10-03T00:00:00Z');
    const to = new Date('2026-10-03T23:59:59Z');
    await svc.paymentsInRange('S1', { from, to });
    expect(whereOf(findMany)).toEqual({
      storeId: 'S1',
      type: 'PAYMENT',
      voidedAt: null,
      createdAt: { gte: from, lte: to },
    });
  });

  it('applies no date filter when none is given', async () => {
    const { svc, findMany } = service();
    await svc.paymentsInRange('S1');
    expect(whereOf(findMany)).not.toHaveProperty('createdAt');
  });
});
