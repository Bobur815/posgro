import { ProductsValidityService } from './products-validity.service';
import type { PrismaService } from '../../prisma/prisma.service';

/**
 * Product.isValid from tills' reports: false once REGOS rejected the product on a receipt, true
 * once a receipt with it was fiscalised. Tills report late (offline) and retry, so the newest
 * report wins and a repeated one changes nothing.
 */

interface Stored {
  id: number;
  isValid: boolean;
  validityAt: Date | null;
  updatedAt: Date;
}

const UPDATED = new Date('2026-10-01T00:00:00.000Z');

function setup(product: Partial<Stored> | null = {}) {
  const row: Stored | null =
    product === null
      ? null
      : { id: 7, isValid: true, validityAt: null, updatedAt: UPDATED, ...product };
  const prisma = {
    product: {
      findUnique: jest.fn().mockResolvedValue(row),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const service = new ProductsValidityService(prisma as unknown as PrismaService);
  return { prisma, service };
}

const AT = '2026-10-09T10:30:00.000Z';
const rejected = { barcode: '4780047860466', at: AT, valid: false, code: 701003 };
const fiscalised = { barcode: '4780047860466', at: AT, valid: true };
const guard = (at: string) => ({
  id: 7,
  OR: [{ validityAt: null }, { validityAt: { lt: new Date(at) } }],
});

describe('ProductsValidityService.reportValidity', () => {
  it('marks the store’s product invalid and tells the till it is done', async () => {
    const { prisma, service } = setup();

    await expect(service.reportValidity('store-1', [rejected])).resolves.toEqual({
      done: [rejected.barcode],
    });

    expect(prisma.product.findUnique.mock.calls[0][0].where).toEqual({
      storeId_barcode: { storeId: 'store-1', barcode: rejected.barcode },
    });
    expect(prisma.product.updateMany).toHaveBeenCalledWith({
      where: guard(AT),
      data: { isValid: false, validityAt: new Date(AT) },
    });
  });

  it('makes an invalid product valid again once a receipt with it is fiscalised', async () => {
    const { prisma, service } = setup({
      isValid: false,
      validityAt: new Date('2026-10-08T00:00:00Z'),
    });

    await service.reportValidity('store-1', [fiscalised]);

    expect(prisma.product.updateMany).toHaveBeenCalledWith({
      where: guard(AT),
      data: { isValid: true, validityAt: new Date(AT) },
    });
  });

  // Otherwise every fiscalised receipt would make every till re-pull its products.
  it('records a same-answer report without bumping updatedAt', async () => {
    const { prisma, service } = setup({ isValid: true });

    await service.reportValidity('store-1', [fiscalised]);

    expect(prisma.product.updateMany).toHaveBeenCalledWith({
      where: guard(AT),
      data: { validityAt: new Date(AT), updatedAt: UPDATED },
    });
  });

  // An offline till's late report must not undo a newer one from another till.
  it('ignores a report older than the one that stands', async () => {
    const { prisma, service } = setup({
      isValid: true,
      validityAt: new Date('2026-10-09T11:00:00Z'),
    });

    await expect(service.reportValidity('store-1', [rejected])).resolves.toEqual({
      done: [rejected.barcode],
    });
    expect(prisma.product.updateMany).not.toHaveBeenCalled();
  });

  it('applies a batch oldest first, so a later fiscalisation wins over a rejection', async () => {
    const { prisma, service } = setup();
    const later = { ...fiscalised, at: '2026-10-09T12:00:00.000Z' };

    await service.reportValidity('store-1', [later, rejected]);

    const calls = prisma.product.updateMany.mock.calls.map((c) => c[0].data);
    expect(calls[0]).toMatchObject({ validityAt: new Date(AT) });
    expect(calls[1]).toMatchObject({ validityAt: new Date(later.at) });
  });

  // Otherwise a till holding a product the store deleted would retry it forever.
  it('is done with a barcode the store does not have', async () => {
    const { prisma, service } = setup(null);

    await expect(service.reportValidity('store-1', [rejected])).resolves.toEqual({
      done: [rejected.barcode],
    });
    expect(prisma.product.updateMany).not.toHaveBeenCalled();
  });

  // The till keeps what is not done and sends it again next cycle.
  it('does not report a failed write as done, and carries on with the rest', async () => {
    const { prisma, service } = setup();
    prisma.product.updateMany.mockRejectedValueOnce(new Error('db down'));
    const second = { ...rejected, barcode: '4780047861784' };

    await expect(service.reportValidity('store-1', [rejected, second])).resolves.toEqual({
      done: [second.barcode],
    });
  });

  it('holds back a barcode while any of its reports in the batch failed', async () => {
    const { prisma, service } = setup();
    prisma.product.updateMany.mockRejectedValueOnce(new Error('db down'));
    const later = { ...fiscalised, at: '2026-10-09T12:00:00.000Z' };

    await expect(service.reportValidity('store-1', [rejected, later])).resolves.toEqual({
      done: [],
    });
  });
});

describe('ProductsValidityService.reportInvalid (tills from before /validity)', () => {
  it('records each item as a rejection', async () => {
    const { prisma, service } = setup();

    await expect(
      service.reportInvalid('store-1', [{ barcode: rejected.barcode, at: AT, code: 701003 }]),
    ).resolves.toEqual({ done: [rejected.barcode] });
    expect(prisma.product.updateMany).toHaveBeenCalledWith({
      where: guard(AT),
      data: { isValid: false, validityAt: new Date(AT) },
    });
  });
});
