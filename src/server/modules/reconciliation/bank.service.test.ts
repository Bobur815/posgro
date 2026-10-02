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
import { BankTurnoverService, type BankTurnover } from './bank.service';
import { SalesFiscalService } from '../sales/sales-fiscal.service';

const D = (n: number) => new Prisma.Decimal(n);

type Where = Record<string, unknown>;

/** Split-payment lines by (method, fiscalised?) — absent = none. */
type Lines = Partial<Record<string, number>>;

function service(opts: { startDate?: Date | null; lines?: Lines } = {}) {
  // mixedLines() is a tagged $queryRaw: (strings, storeId, method, when). `when` is a Prisma.sql
  // fragment whose text says whether only FISCALIZED receipts count.
  const queryRaw = jest.fn(async (_s: TemplateStringsArray, _store: string, method: string, when: Prisma.Sql) => {
    const key = `${method}${when.sql.includes('FISCALIZED') ? ':fiscal' : ''}`;
    const n = opts.lines?.[key];
    return [{ total: n === undefined ? null : D(n) }];
  });
  const saleAggregate = jest.fn(async ({ where }: { where: Where }) => {
    // Unreported cash sales
    if (where.fiscalStatus === null)
      return { _count: { _all: 3 }, _sum: { finalAmount: D(45000) } };
    // Fiscalised cash, and fiscalised Click (fiscalised as cash, counted apart)
    if (where.fiscalStatus === 'FISCALIZED')
      return {
        _sum: { finalAmount: JSON.stringify(where).includes('"click"') ? D(80000) : D(500000) },
      };
    // Counter money by tender
    const tender = (where.paymentMethod as { equals: string }).equals;
    return { _sum: { paidAmount: tender === 'card' ? D(300000) : D(120000) } };
  });
  const prisma = {
    $queryRaw: queryRaw,
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

  it('answers "off" without the flag — 200, never a 404 a fail2ban jail would count', async () => {
    delete process.env.BANK_TURNOVER_ENABLED;
    const { svc, prisma } = service();
    await expect(svc.summary('S1', from, to)).resolves.toEqual({ enabled: false });
    expect(prisma.sale.aggregate).not.toHaveBeenCalled();
    // Writes stay closed: the page never offers them while the section is hidden.
    await expect(svc.createDeposit('S1', 'a', { amount: '1' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('adds card (counter + nasiya payments), UzQR, fiscalised cash and fiscalised Click', async () => {
    const { svc } = service();
    const r = (await svc.summary('S1', from, to)) as BankTurnover;
    expect(r.card.toString()).toBe('350000'); // 300 000 at the counter + 50 000 paid on a debt
    expect(r.uzqr.toString()).toBe('120000');
    expect(r.fiscalCash.toString()).toBe('500000');
    expect(r.fiscalClick.toString()).toBe('80000');
    expect(r.bankTurnover.toString()).toBe('1050000');
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

  it('reports nothing to deposit until a start date is set, then fiscalised cash + Click minus deposits', async () => {
    expect(((await service().svc.summary('S1', from, to)) as BankTurnover).running).toBeNull();

    const startDate = new Date('2026-09-15T00:00:00Z');
    const r = (await service({ startDate }).svc.summary('S1', from, to)) as BankTurnover;
    expect(r.running).toMatchObject({ startDate });
    expect(r.running!.fiscalClick.toString()).toBe('80000');
    expect(r.running!.toDeposit.toString()).toBe('380000'); // 500 000 + 80 000 − 200 000
  });

  it('counts Click only once fiscalised, by its fiscal tender or the sale tender', async () => {
    const { svc, prisma } = service();
    await svc.summary('S1', from, to);
    const call = prisma.sale.aggregate.mock.calls.find(
      ([a]) =>
        (a.where as Where).fiscalStatus === 'FISCALIZED' && JSON.stringify(a.where).includes('"click"'),
    )!;
    const where = JSON.stringify(call[0].where);
    expect(where).toContain('"fiscalTender":{"equals":"click"');
    expect(where).toContain('"paymentMethod":{"equals":"click"');
  });

  it('adds split-payment lines: counter lines by sale time, cash/Click lines once fiscalised', async () => {
    const { svc } = service({
      lines: { card: 40000, uzqr: 10000, 'cash:fiscal': 55000, 'click:fiscal': 15000 },
    });
    const r = (await svc.summary('S1', from, to)) as BankTurnover;
    expect(r.card.toString()).toBe('390000'); // 350 000 as before + 40 000 split card lines
    expect(r.uzqr.toString()).toBe('130000');
    expect(r.fiscalCash.toString()).toBe('555000');
    expect(r.fiscalClick.toString()).toBe('95000');
    expect(r.bankTurnover.toString()).toBe('1170000');
  });

  it('counts no split lines when there are none — unchanged figures', async () => {
    const r = (await service().svc.summary('S1', from, to)) as BankTurnover;
    expect(r.bankTurnover.toString()).toBe('1050000');
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
