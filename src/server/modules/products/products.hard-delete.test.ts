import { ProductsService } from './products.service';

/**
 * Deleting a product must clear every table whose foreign key would refuse it — and do so in one
 * transaction. The stock ledger (`stock_movements`, RESTRICT) was missed when it was added, so on
 * staging the delete failed at the last step after its sale lines, emptied sales and arrivals had
 * already gone.
 */

type Call = { table: string; op: string };

function build(failAt?: string) {
  const calls: Call[] = [];
  const table = (name: string) => ({
    findMany: jest.fn(async () => {
      calls.push({ table: name, op: 'findMany' });
      return [{ saleId: 's1' }, { saleId: 's1' }, { saleId: 's2' }];
    }),
    deleteMany: jest.fn(async () => {
      calls.push({ table: name, op: 'deleteMany' });
      if (failAt === name) throw new Error(`FK on ${name}`);
      return { count: 1 };
    }),
    delete: jest.fn(async () => {
      calls.push({ table: name, op: 'delete' });
      if (failAt === name) throw new Error(`FK on ${name}`);
      return {};
    }),
  });
  const tx = {
    saleItem: table('saleItem'),
    sale: table('sale'),
    inventoryArrival: table('inventoryArrival'),
    inventoryCountItem: table('inventoryCountItem'),
    stockMovement: table('stockMovement'),
    product: table('product'),
  };
  let inTransaction = false;
  const prisma = {
    // Outside the transaction nothing may be written: every delete goes through `tx`.
    ...Object.fromEntries(Object.keys(tx).map((k) => [k, {}])),
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => {
      inTransaction = true;
      try {
        return await fn(tx);
      } finally {
        inTransaction = false;
      }
    }),
  };
  const service = new ProductsService(prisma as any);
  jest.spyOn(service, 'findById').mockResolvedValue({ id: 7, storeId: 'st' } as any);
  return { service, calls, prisma, isInTransaction: () => inTransaction };
}

describe('ProductsService.hardDelete', () => {
  it('clears the stock ledger before deleting the product', async () => {
    const { service, calls } = build();
    await expect(service.hardDelete(7, 'st')).resolves.toEqual({ success: true });

    const order = calls.map((c) => `${c.table}.${c.op}`);
    expect(order).toContain('stockMovement.deleteMany');
    expect(order.indexOf('stockMovement.deleteMany')).toBeLessThan(order.indexOf('product.delete'));
    expect(order[order.length - 1]).toBe('product.delete');
  });

  it('clears every referencing table before the product, not only the ledger', async () => {
    const { service, calls } = build();
    await service.hardDelete(7, 'st');
    const before = calls.slice(0, -1).map((c) => c.table);
    for (const t of ['saleItem', 'sale', 'inventoryArrival', 'inventoryCountItem', 'stockMovement']) {
      expect(before).toContain(t);
    }
  });

  it('runs every delete inside one transaction, so a refusal undoes the rest', async () => {
    const { service, prisma } = build('product');
    await expect(service.hardDelete(7, 'st')).rejects.toThrow('FK on product');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
