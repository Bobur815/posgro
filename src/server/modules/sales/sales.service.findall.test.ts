import { Prisma } from '@prisma/client';
import { SalesService } from './sales.service';

const D = (v: string | number) => new Prisma.Decimal(v);

function service(sales: unknown[], lines: unknown[] = []) {
  const prisma = {
    sale: { findMany: jest.fn(async () => sales) },
    salePayment: { findMany: jest.fn(async () => lines) },
  };
  return { svc: new SalesService(prisma as never, {} as never, {} as never), prisma };
}

const sale = (over: Record<string, unknown>) => ({
  id: 's1',
  storeId: 'S1',
  receiptNumber: 'R1',
  finalAmount: D(10000),
  paymentMethod: 'cash',
  items: [],
  ...over,
});

describe('SalesService.findAll', () => {
  it('adds totalCost and margin from current product cost, per piece', async () => {
    const { svc } = service([
      sale({
        items: [
          { id: 'i1', quantity: D(2), piecesPerUnit: 1, product: { cost: D(2000) } },
          { id: 'i2', quantity: D(1), piecesPerUnit: 3, product: { cost: D(500) } },
          { id: 'i3', quantity: D(1), piecesPerUnit: 1, product: null },
        ],
      }),
    ]);
    const [s] = await svc.findAll('S1', {});
    expect(s.totalCost).toBe(5500);
    expect(s.margin).toBeCloseTo(45);
    // The product join is internal: items keep their old shape.
    expect(s.items[0]).not.toHaveProperty('product');
    expect(s.payments).toEqual([]);
  });

  it('a margin of 0 for a zero-value receipt, not NaN', async () => {
    const { svc } = service([sale({ finalAmount: D(0) })]);
    const [s] = await svc.findAll('S1', {});
    expect(s.margin).toBe(0);
  });

  it('attaches split-payment lines to mixed receipts only, scoped to the store', async () => {
    const { svc, prisma } = service(
      [
        sale({ receiptNumber: 'R1', paymentMethod: 'mixed' }),
        sale({ id: 's2', receiptNumber: 'R2' }),
      ],
      [
        { receiptNumber: 'R1', method: 'cash', amount: D(6000) },
        { receiptNumber: 'R1', method: 'card', amount: D(4000) },
      ],
    );
    const [mixed, cash] = await svc.findAll('S1', {});
    expect(prisma.salePayment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { storeId: 'S1', receiptNumber: { in: ['R1'] } } }),
    );
    expect(mixed.payments).toEqual([
      { method: 'cash', amount: D(6000) },
      { method: 'card', amount: D(4000) },
    ]);
    expect(cash.payments).toEqual([]);
  });

  it('skips the payment-lines query when no receipt is mixed', async () => {
    const { svc, prisma } = service([sale({})]);
    await svc.findAll('S1', {});
    expect(prisma.salePayment.findMany).not.toHaveBeenCalled();
  });
});
