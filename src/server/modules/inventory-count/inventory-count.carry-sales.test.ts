import { Prisma } from '@prisma/client';
import { InventoryCountService, planCompletion, resultingStock } from './inventory-count.service';

// Store 1234, stocktake #3 ("Salqin ichimliklar", 8–11 Oct 2026): product 634 counted at 14, then
// 8 sold before the document was completed. Completion wrote 14 over live stock and the 8 sales
// vanished from the books. Under STOCKTAKE_CARRY_SALES the counted figure keeps them.

const D = (n: number) => new Prisma.Decimal(n);
type Line = Parameters<typeof planCompletion>[0][number];

const COUNTED_AT = new Date('2026-10-08T06:00:00.000Z');

function line(over: Partial<Omit<Line, 'expectedQty'>> & { expectedQty: number }): Line {
  return {
    id: 'L1',
    productId: 634,
    counted: true,
    countedQty: D(14),
    cost: D(5000),
    countedAt: COUNTED_AT,
    stockAtCount: D(438),
    ...over,
    expectedQty: D(over.expectedQty),
  };
}

describe('planCompletion — carrying movements after the count', () => {
  it('flag off: measured against expectedQty, no snapshot handed to the write', () => {
    const plan = planCompletion([line({ expectedQty: 441 })], false);
    expect(plan.rows[0]).toMatchObject({
      countedQty: '14',
      difference: '-427',
      stockAtCount: null,
      countedAt: null,
    });
  });

  it('flag on: measured against stock at the count, which already excludes earlier sales', () => {
    const plan = planCompletion([line({ expectedQty: 441 })], false, true);
    expect(plan.rows[0]).toMatchObject({
      countedQty: '14',
      difference: '-424', // 14 − 438: the 3 sold before counting are not shrinkage
      stockAtCount: '438',
      countedAt: COUNTED_AT,
    });
    expect(plan.totalValueDiff.toString()).toBe('-2120000');
  });

  it('flag on, line counted before the snapshot existed: behaves exactly as before', () => {
    const plan = planCompletion(
      [line({ expectedQty: 441, stockAtCount: null, countedAt: null })],
      false,
      true,
    );
    expect(plan.rows[0]).toMatchObject({ difference: '-427', stockAtCount: null, countedAt: null });
  });

  it('flag on: a write-off still zeroes the product, with no carry', () => {
    const plan = planCompletion(
      [
        line({ expectedQty: 441 }),
        line({ id: 'L2', productId: 2, counted: false, countedQty: null, expectedQty: 7 }),
      ],
      true,
      true,
    );
    expect(plan.rows.find((r) => r.itemId === 'L2')).toMatchObject({
      countedQty: '0',
      difference: '-7',
      writtenOff: true,
      stockAtCount: null,
    });
  });
});

describe('resultingStock', () => {
  it('no snapshot: the counted figure', () => {
    expect(resultingStock({ countedQty: '14', stockAtCount: null }, D(430)).toString()).toBe('14');
  });

  it('keeps what live stock did after the count: 8 sold → 6', () => {
    expect(resultingStock({ countedQty: '14', stockAtCount: '438' }, D(430)).toString()).toBe('6');
  });

  it('keeps arrivals after the count too', () => {
    expect(resultingStock({ countedQty: '14', stockAtCount: '438' }, D(462)).toString()).toBe('38');
  });

  it('never goes below zero', () => {
    expect(resultingStock({ countedQty: '2', stockAtCount: '10' }, D(3)).toString()).toBe('0');
  });

  it('product not found under the lock: the counted figure', () => {
    expect(resultingStock({ countedQty: '14', stockAtCount: '438' }, null).toString()).toBe('14');
  });
});

describe('InventoryCountService — count snapshot and completion write', () => {
  const OLD_ENV = process.env.STOCKTAKE_CARRY_SALES;
  afterEach(() => {
    if (OLD_ENV === undefined) delete process.env.STOCKTAKE_CARRY_SALES;
    else process.env.STOCKTAKE_CARRY_SALES = OLD_ENV;
  });

  function setup(live: number) {
    const item = {
      id: 'L1',
      countId: 'C1',
      productId: 634,
      counted: true,
      countedQty: D(14),
      expectedQty: D(441),
      cost: D(5000),
      countedAt: COUNTED_AT,
      stockAtCount: D(438),
    };
    // Tagged-template calls: rebuilt with Prisma.sql so nested joins flatten into `values`.
    const executed: Prisma.Sql[] = [];
    const tx = {
      $queryRaw: jest.fn(async () => [{ id: 634, stock: D(live) }]),
      $executeRaw: jest.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
        executed.push(Prisma.sql(strings, ...values));
        return 1;
      }),
      inventoryCount: { update: jest.fn(async ({ data }: { data: object }) => data) },
    };
    const prisma = {
      inventoryCount: {
        findUnique: jest.fn(async () => ({
          id: 'C1',
          storeId: 'S1',
          status: 'IN_PROGRESS',
          items: [item],
        })),
      },
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    };
    const svc = new InventoryCountService(prisma as never, { enabled: false } as never);
    // The first statement is the products UPDATE, the second the count lines.
    const productWrite = () => executed[0].values;
    const lineWrite = () => executed[1].values;
    return { svc, tx, productWrite, lineWrite };
  }

  const user = { id: 'U1', nameRu: 'Admin' };

  it('flag off: writes the counted figure, stamps completion time, takes no lock', async () => {
    delete process.env.STOCKTAKE_CARRY_SALES;
    const { svc, tx, productWrite } = setup(430);

    await svc.complete('S1', 'C1', user);

    expect(tx.$queryRaw).not.toHaveBeenCalled();
    expect(productWrite()).toEqual([634, '14', null, 'S1']);
  });

  it('flag on: keeps the 8 sold after the count, watermark at the count moment', async () => {
    process.env.STOCKTAKE_CARRY_SALES = 'true';
    const { svc, tx, productWrite, lineWrite } = setup(430);

    await svc.complete('S1', 'C1', user);

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(productWrite()).toEqual([634, '6', COUNTED_AT.toISOString(), 'S1']);
    // The line keeps the physical figure, its variance measured at the count.
    expect(lineWrite()).toEqual(['L1', '-424', '14', false]);
  });

  it('counting a line records when, and the live stock at that moment', async () => {
    const update = jest.fn(async ({ data }: { data: object }) => ({ id: 'L1', ...data }));
    const prisma = {
      inventoryCount: {
        findUnique: jest.fn(async () => ({
          id: 'C1',
          storeId: 'S1',
          status: 'IN_PROGRESS',
          totalItems: 1,
          scope: 'FULL',
          categoryId: null,
          categoryIds: [],
        })),
        update: jest.fn(async () => ({})),
      },
      inventoryCountItem: {
        findUnique: jest.fn(async () => ({ countId: 'C1', productId: 634 })),
        update,
        count: jest.fn(async () => 1),
      },
      product: { findUnique: jest.fn(async () => ({ stock: D(438) })) },
    };
    const svc = new InventoryCountService(prisma as never, {} as never);

    await svc.setItemCount('S1', 'C1', 'L1', 14);

    const data = update.mock.calls[0][0].data as { stockAtCount: Prisma.Decimal; countedAt: Date };
    expect(data).toMatchObject({ countedQty: 14, counted: true });
    expect(data.stockAtCount.toString()).toBe('438');
    expect(data.countedAt).toBeInstanceOf(Date);
  });
});
