/**
 * Bank turnover: card + UzQR + fiscalised cash, and the fiscalised cash still to deposit.
 *
 * The figures are sums, so what matters is which rows each sum takes: counter money is paidAmount
 * (the part left on a tab never reached the bank there), nasiya payments are stored negative,
 * voided deposits and voided payments count for nothing, and a cash receipt counts as fiscalised
 * cash by the tender on its fiscal receipt.
 */
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BankTurnoverService } from './bank.service';
import { SalesFiscalService } from '../sales/sales-fiscal.service';

const D = (n: number) => new Prisma.Decimal(n);

type Where = Record<string, unknown>;

function service(opts: { startDate?: Date | null } = {}) {
  const saleAggregate = jest.fn(async ({ where }: { where: Where }) => {
    // Unreported cash sales
    if (where.fiscalStatus === null)
      return { _count: { _all: 3 }, _sum: { finalAmount: D(45000) } };
    // Fiscalised cash
    if (where.fiscalStatus === 'FISCALIZED') return { _sum: { finalAmount: D(500000) } };
    // Counter money by tender
    const tender = (where.paymentMethod as { equals: string }).equals;
    return { _sum: { paidAmount: tender === 'card' ? D(300000) : D(120000) } };
  });
  const prisma = {
    sale: {
      aggregate: saleAggregate,
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    debtTransaction: {
      aggregate: jest.fn(async ({ where }: { where: Where }) => ({
        _sum: {
          amount: (where.paymentMethod as { equals: string }).equals === 'card' ? D(-50000) : null,
        },
      })),
    },
    cashBankDeposit: {
      aggregate: jest.fn(async () => ({ _sum: { amount: D(200000) } })),
      findMany: jest.fn(async () => []),
      create: jest.fn(async ({ data }: { data: Where }) => ({
        id: 'd1',
        ...data,
      })),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    store: {
      findUnique: jest.fn(async () => ({
        bankCashStartDate: opts.startDate ?? null,
      })),
      update: jest.fn(async () => ({})),
    },
  };
  return { svc: new BankTurnoverService(prisma as never), prisma };
}

const from = new Date('2026-09-01T00:00:00Z');
const to = new Date('2026-09-30T23:59:59Z');

describe('BankTurnoverService', () => {
  const OLD = process.env.BANK_TURNOVER_ENABLED;
  beforeEach(() => {
    process.env.BANK_TURNOVER_ENABLED = 'true';
  });
  afterAll(() => {
    process.env.BANK_TURNOVER_ENABLED = OLD;
  });

  it('is not there at all without the flag', async () => {
    delete process.env.BANK_TURNOVER_ENABLED;
    const { svc } = service();
    await expect(svc.summary('S1', from, to)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.createDeposit('S1', 'a', { amount: '1' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('adds card (counter + nasiya payments), UzQR and fiscalised cash', async () => {
    const { svc } = service();
    const r = await svc.summary('S1', from, to);
    expect(r.card.toString()).toBe('350000'); // 300 000 at the counter + 50 000 paid on a debt
    expect(r.uzqr.toString()).toBe('120000');
    expect(r.fiscalCash.toString()).toBe('500000');
    expect(r.bankTurnover.toString()).toBe('970000');
    expect(r.deposited.toString()).toBe('200000');
    expect(r.unreported).toEqual({ count: 3, amount: D(45000) });
  });

  it('takes counter money as paidAmount and ignores voided debt payments', async () => {
    const { svc, prisma } = service();
    await svc.summary('S1', from, to);
    expect(prisma.sale.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ _sum: { paidAmount: true } }),
    );
    expect(prisma.debtTransaction.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ type: 'PAYMENT', voidedAt: null }),
      }),
    );
  });

  it('counts fiscalised cash by the fiscal tender, falling back to the sale tender', async () => {
    const { svc, prisma } = service();
    await svc.summary('S1', from, to);
    const call = prisma.sale.aggregate.mock.calls.find(
      ([a]) => (a.where as Where).fiscalStatus === 'FISCALIZED',
    )!;
    expect(JSON.stringify(call[0].where)).toContain('"fiscalTender":null');
    expect(JSON.stringify(call[0].where)).toContain('"fiscalizedAt":null');
  });

  it('reports nothing to deposit until a start date is set, then fiscalised cash minus deposits', async () => {
    expect((await service().svc.summary('S1', from, to)).running).toBeNull();

    const startDate = new Date('2026-09-15T00:00:00Z');
    const r = await service({ startDate }).svc.summary('S1', from, to);
    expect(r.running).toMatchObject({ startDate });
    expect(r.running!.toDeposit.toString()).toBe('300000');
  });

  it('sums only deposits that were not voided', async () => {
    const { svc, prisma } = service();
    await svc.summary('S1', from, to);
    expect(prisma.cashBankDeposit.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ voidedAt: null }),
      }),
    );
  });

  it('refuses a zero, negative or sub-tiyin deposit', async () => {
    const { svc } = service();
    for (const amount of ['0', '-5', '1.234']) {
      await expect(svc.createDeposit('S1', 'a', { amount })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    }
    await expect(svc.createDeposit('S1', 'a', { amount: '1500000.50' })).resolves.toMatchObject({
      storeId: 'S1',
      createdById: 'a',
    });
  });

  it('voids only a live deposit of this store', async () => {
    const { svc, prisma } = service();
    prisma.cashBankDeposit.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(svc.voidDeposit('S1', 'a', 'other-store')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.cashBankDeposit.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'other-store', storeId: 'S1', voidedAt: null },
      }),
    );
  });
});

describe('SalesFiscalService.syncFromTerminal', () => {
  it('records by (store, receiptNumber) and names only the receipts it found', async () => {
    const updateMany = jest
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const svc = new SalesFiscalService({ sale: { updateMany } } as never);

    const res = await svc.syncFromTerminal('S1', [
      {
        receiptNumber: 'R1',
        fiscalStatus: 'FISCALIZED',
        fiscalizedAt: '2026-10-01T10:00:00.000Z',
        fiscalTender: 'CASH',
      },
      { receiptNumber: 'R2', fiscalStatus: 'FISCALIZED' },
    ]);

    expect(res).toEqual({ synced: ['R1'] });
    expect(updateMany).toHaveBeenNthCalledWith(1, {
      where: { storeId: 'S1', receiptNumber: 'R1' },
      data: {
        fiscalStatus: 'FISCALIZED',
        fiscalizedAt: new Date('2026-10-01T10:00:00.000Z'),
        fiscalTender: 'cash',
      },
    });
  });
});
