import { InventoryService } from './inventory.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { ProductsService } from '../products/products.service';
import type { StockMovementService } from '../stock-movement/stock-movement.service';

/**
 * An inventory arrival leaves Product.isValid alone: only a fiscalised receipt makes a product
 * valid again (ProductsValidityService). Both ways an arrival reaches the VPS.
 */

function setup() {
  const product = {
    id: 7,
    storeId: 'store-1',
    stock: 10,
    price: 5000,
    nameRu: 'Сок',
    nameUz: 'Sharbat',
  };
  const tx = {
    inventoryArrival: { create: jest.fn().mockResolvedValue({ id: 'arr-1' }) },
    product: { update: jest.fn().mockResolvedValue(product) },
  };
  const prisma = {
    product: {
      findUnique: jest.fn().mockResolvedValue(product),
      update: jest.fn().mockResolvedValue(product),
    },
    inventoryArrival: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'arr-1', createdAt: new Date() }),
    },
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const stockMovements = { emit: jest.fn(), emitStandalone: jest.fn() };
  const service = new InventoryService(
    prisma as unknown as PrismaService,
    {} as ProductsService,
    stockMovements as unknown as StockMovementService,
  );
  return { prisma, tx, service };
}

describe('an arrival does not touch Product.isValid', () => {
  it('when recorded on the dashboard', async () => {
    const { prisma, service } = setup();

    await service.createArrival(
      'store-1',
      { productId: 7, quantity: 5, cost: 4000 } as never,
      'user-1',
    );

    expect(prisma.product.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 7 } }),
    );
    expect(prisma.product.update.mock.calls[0][0].data).not.toHaveProperty('isValid');
  });

  it('when uploaded by a till', async () => {
    const { tx, service } = setup();

    await service.syncBulkArrivals('store-1', [
      {
        id: 'arr-1',
        productBarcode: '4780047860466',
        quantity: 5,
        cost: 4000,
        createdBy: 'user-1',
        createdAt: '2026-10-05T10:00:00.000Z',
      },
    ]);

    expect(tx.product.update).toHaveBeenCalledTimes(1);
    expect(tx.product.update.mock.calls[0][0].data).not.toHaveProperty('isValid');
  });
});
