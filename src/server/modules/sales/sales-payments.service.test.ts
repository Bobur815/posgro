import { Prisma } from '@prisma/client';
import { SalesPaymentsService } from './sales-payments.service';

function service(opts: { failOn?: string } = {}) {
  const deleteMany = jest.fn((args: unknown) => ({ op: 'delete', args }));
  const createMany = jest.fn((args: unknown) => ({ op: 'create', args }));
  const $transaction = jest.fn(
    async (ops: Array<{ args: { where?: { receiptNumber: string } } }>) => {
      if (opts.failOn && ops[0].args.where?.receiptNumber === opts.failOn) throw new Error('boom');
      return ops;
    },
  );
  const prisma = { salePayment: { deleteMany, createMany }, $transaction };
  return { svc: new SalesPaymentsService(prisma as never), deleteMany, createMany, $transaction };
}

describe('SalesPaymentsService.syncFromTerminal', () => {
  it("replaces a receipt's lines in one transaction — a resend is idempotent", async () => {
    const { svc, deleteMany, createMany, $transaction } = service();
    const res = await svc.syncFromTerminal('S1', [
      {
        receiptNumber: 'R1',
        payments: [
          { method: 'cash', amount: '55000' },
          { method: 'card', amount: '45000.00' },
        ],
      },
    ]);
    expect(res).toEqual({ synced: ['R1'] });
    expect($transaction).toHaveBeenCalledTimes(1);
    expect(deleteMany).toHaveBeenCalledWith({ where: { storeId: 'S1', receiptNumber: 'R1' } });
    expect(createMany).toHaveBeenCalledWith({
      data: [
        { storeId: 'S1', receiptNumber: 'R1', method: 'cash', amount: new Prisma.Decimal(55000) },
        { storeId: 'S1', receiptNumber: 'R1', method: 'card', amount: new Prisma.Decimal(45000) },
      ],
    });
  });

  it('merges a duplicated tender instead of tripping the unique key', async () => {
    const { svc, createMany } = service();
    await svc.syncFromTerminal('S1', [
      {
        receiptNumber: 'R1',
        payments: [
          { method: 'cash', amount: '10000' },
          { method: 'cash', amount: '5000.50' },
        ],
      },
    ]);
    expect(createMany).toHaveBeenCalledWith({
      data: [
        {
          storeId: 'S1',
          receiptNumber: 'R1',
          method: 'cash',
          amount: new Prisma.Decimal('15000.5'),
        },
      ],
    });
  });

  it('names only the receipts it recorded', async () => {
    const { svc } = service({ failOn: 'R2' });
    const line = [{ method: 'cash', amount: '1' }];
    const res = await svc.syncFromTerminal('S1', [
      { receiptNumber: 'R1', payments: line },
      { receiptNumber: 'R2', payments: line },
    ]);
    expect(res).toEqual({ synced: ['R1'] });
  });
});
