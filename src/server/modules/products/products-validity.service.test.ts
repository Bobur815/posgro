import { ProductsValidityService } from './products-validity.service';
import type { PrismaService } from '../../prisma/prisma.service';

/**
 * Product.isValid from a till's report: REGOS rejected the product on a receipt, so it is invalid
 * until the next arrival. Tills report late (offline) and retry, so both must be safe.
 */

function setup(opts: { product?: { id: number } | null; newerArrival?: boolean } = {}) {
  const prisma = {
    product: {
      findUnique: jest
        .fn()
        .mockResolvedValue(opts.product === undefined ? { id: 7 } : opts.product),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    inventoryArrival: {
      findFirst: jest.fn().mockResolvedValue(opts.newerArrival ? { id: 'arr-1' } : null),
    },
  };
  const service = new ProductsValidityService(prisma as unknown as PrismaService);
  return { prisma, service };
}

const report = { barcode: '4780047860466', at: '2026-10-05T10:30:00.000Z', code: 701003 };

describe('ProductsValidityService.reportInvalid', () => {
  it('marks the store’s product invalid and tells the till it is done', async () => {
    const { prisma, service } = setup();

    await expect(service.reportInvalid('store-1', [report])).resolves.toEqual({
      done: [report.barcode],
    });

    expect(prisma.product.findUnique.mock.calls[0][0].where).toEqual({
      storeId_barcode: { storeId: 'store-1', barcode: report.barcode },
    });
    expect(prisma.product.updateMany).toHaveBeenCalledWith({
      where: { id: 7, isValid: true },
      data: { isValid: false },
    });
  });

  // An offline till's late report must not undo a delivery recorded since.
  it('leaves the product valid when an arrival came after the rejection', async () => {
    const { prisma, service } = setup({ newerArrival: true });

    await expect(service.reportInvalid('store-1', [report])).resolves.toEqual({
      done: [report.barcode],
    });

    expect(prisma.inventoryArrival.findFirst.mock.calls[0][0].where).toEqual({
      storeId: 'store-1',
      productId: 7,
      createdAt: { gt: new Date(report.at) },
    });
    expect(prisma.product.updateMany).not.toHaveBeenCalled();
  });

  // Otherwise a till holding a product the store deleted would retry it forever.
  it('is done with a barcode the store does not have', async () => {
    const { prisma, service } = setup({ product: null });

    await expect(service.reportInvalid('store-1', [report])).resolves.toEqual({
      done: [report.barcode],
    });
    expect(prisma.product.updateMany).not.toHaveBeenCalled();
  });

  // The till keeps what is not done and sends it again next cycle.
  it('does not report a failed write as done, and carries on with the rest', async () => {
    const { prisma, service } = setup();
    prisma.product.updateMany.mockRejectedValueOnce(new Error('db down'));
    const second = { ...report, barcode: '4780047861784' };

    await expect(service.reportInvalid('store-1', [report, second])).resolves.toEqual({
      done: [second.barcode],
    });
  });
});
