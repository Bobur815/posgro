import { ProductsService } from './products.service';

/**
 * The dashboard patches its product list in place from the create/update response instead of
 * re-downloading the whole catalog, so that response must carry the same relations as the list
 * (`GET /products` includes category and supplier) — otherwise the row loses its supplier name.
 */

type Args = { include?: Record<string, boolean> };

function build() {
  const prisma = {
    product: {
      findFirst: jest.fn(async () => null),
      findUnique: jest.fn(async () => ({ id: 7, storeId: 's1' })),
      aggregate: jest.fn(async () => ({ _max: { storeProductCode: 3, id: 5 } })),
      create: jest.fn(async (_args: Args) => ({ id: 8 })),
      update: jest.fn(async (_args: Args) => ({ id: 7 })),
    },
    deletedProduct: { deleteMany: jest.fn(async () => ({ count: 0 })) },
  };
  // Only the delegates the two methods touch are stubbed.
  const service = new ProductsService(prisma as never);
  return { prisma, service };
}

describe('ProductsService create/update response', () => {
  it('create includes category and supplier', async () => {
    const { prisma, service } = build();
    await service.create('s1', {
      barcode: '4780000000001',
      nameUz: 'a',
      nameRu: 'a',
      price: 1000,
      categoryId: 1,
    } as never);
    expect(prisma.product.create.mock.calls[0][0].include).toEqual({
      category: true,
      supplier: true,
    });
  });

  it('update includes category and supplier', async () => {
    const { prisma, service } = build();
    await service.update(7, 's1', { price: 2000 } as never);
    expect(prisma.product.update.mock.calls[0][0].include).toEqual({
      category: true,
      supplier: true,
    });
  });
});
