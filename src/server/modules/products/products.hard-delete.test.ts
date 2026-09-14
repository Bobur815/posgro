import { ProductsService } from './products.service';

/**
 * Deleting a product must clear every table whose foreign key would refuse it — and do so in one
 * transaction. The stock ledger (`stock_movements`, RESTRICT) was missed when it was added, so on
 * staging the delete failed at the last step after its sale lines, emptied sales and arrivals had
 * already gone.
 *
 * It must also leave a deletion record, so terminals drop their copy and cannot upload it back.
 */

type Call = { table: string; op: string; args?: any };

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
      return { id: 7, storeId: 'st', barcode: 'B7' };
    }),
    create: jest.fn(async (args: any) => {
      calls.push({ table: name, op: 'create', args });
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
    deletedProduct: table('deletedProduct'),
  };
  const prisma = {
    // Outside the transaction nothing may be written: every delete goes through `tx`.
    ...Object.fromEntries(Object.keys(tx).map((k) => [k, {}])),
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const service = new ProductsService(prisma as any);
  const findById = jest.spyOn(service, 'findById').mockResolvedValue({ id: 7, storeId: 'st' } as any);
  return { service, calls, prisma, findById };
}

describe('ProductsService.hardDelete', () => {
  it('clears the stock ledger before deleting the product', async () => {
    const { service, calls } = build();
    await expect(service.hardDelete(7, 'st')).resolves.toEqual({ success: true });

    const order = calls.map((c) => `${c.table}.${c.op}`);
    expect(order).toContain('stockMovement.deleteMany');
    expect(order.indexOf('stockMovement.deleteMany')).toBeLessThan(order.indexOf('product.delete'));
  });

  it('clears every referencing table before the product, not only the ledger', async () => {
    const { service, calls } = build();
    await service.hardDelete(7, 'st');
    const order = calls.map((c) => c.table);
    const productAt = order.indexOf('product');
    for (const t of ['saleItem', 'sale', 'inventoryArrival', 'inventoryCountItem', 'stockMovement']) {
      expect(order.indexOf(t)).toBeGreaterThanOrEqual(0);
      expect(order.indexOf(t)).toBeLessThan(productAt);
    }
  });

  it('records the deletion with the barcode of the row it deleted, in the same transaction', async () => {
    const { service, calls } = build();
    await service.hardDelete(7, 'st');
    const record = calls.find((c) => c.table === 'deletedProduct' && c.op === 'create');
    expect(record?.args).toEqual({ data: { storeId: 'st', barcode: 'B7', productId: 7 } });
    // After the product is gone, as the last write.
    expect(calls[calls.length - 1]).toBe(record);
  });

  it('resolves the product by its DB id, which is what the dashboard sends', async () => {
    const { service, findById } = build();
    await service.hardDelete(7, 'st');
    expect(findById).toHaveBeenCalledWith(7, 'st', true);
  });

  it('runs every delete inside one transaction, so a refusal undoes the rest', async () => {
    const { service, prisma, calls } = build('product');
    await expect(service.hardDelete(7, 'st')).rejects.toThrow('FK on product');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(calls.some((c) => c.table === 'deletedProduct')).toBe(false);
  });
});
