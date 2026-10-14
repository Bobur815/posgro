import { Prisma } from '@prisma/client';
import { InventoryCountService, scopeCategoryIds } from './inventory-count.service';

// A CATEGORY document can cover several categories; older dashboards still send one `categoryId`.

interface Product {
  id: number;
  storeId: string;
  active: boolean;
  categoryId: number;
  nameRu: string;
  nameUz: string;
  barcode: string;
  unit: string;
  stock: Prisma.Decimal;
  cost: Prisma.Decimal | null;
}

interface CreateData {
  scope: string;
  categoryId: number | null;
  categoryIds: number[];
  totalItems: number;
  items: { create: Array<{ productId: number }> };
}

const product = (id: number, categoryId: number, storeId = 'S1'): Product => ({
  id,
  storeId,
  active: true,
  categoryId,
  nameRu: `P${id}`,
  nameUz: `P${id}`,
  barcode: `B${id}`,
  unit: 'шт',
  stock: new Prisma.Decimal(5),
  cost: null,
});

const user = { id: 'U1', nameRu: 'Админ' };

function setup(products: Product[], categories: Array<{ id: number; storeId: string }>) {
  const created: CreateData[] = [];
  const prisma = {
    inventoryCount: {
      findFirst: jest.fn(async () => null),
      aggregate: jest.fn(async () => ({ _max: { number: 4 } })),
      create: jest.fn(async ({ data }: { data: CreateData }) => {
        created.push(data);
        return {
          id: 'C1',
          number: 5,
          status: 'DRAFT',
          scope: data.scope,
          totalItems: data.totalItems,
        };
      }),
    },
    category: {
      count: jest.fn(
        async ({ where }: { where: { id: { in: number[] }; storeId: string } }) =>
          categories.filter((c) => where.id.in.includes(c.id) && c.storeId === where.storeId)
            .length,
      ),
    },
    product: {
      findMany: jest.fn(
        async ({
          where,
        }: {
          where: { storeId: string; active: boolean; categoryId?: { in: number[] } };
        }) =>
          products.filter(
            (p) =>
              p.storeId === where.storeId &&
              p.active === where.active &&
              (!where.categoryId || where.categoryId.in.includes(p.categoryId)),
          ),
      ),
    },
  };
  const svc = new InventoryCountService(prisma as never, {} as never);
  return { svc, prisma, created };
}

const cats = [
  { id: 1, storeId: 'S1' },
  { id: 2, storeId: 'S1' },
  { id: 3, storeId: 'S1' },
  { id: 9, storeId: 'S2' },
];
const shelf = [product(1, 1), product(2, 2), product(3, 3), product(4, 2)];

describe('InventoryCountService.create — categories', () => {
  it('snapshots the products of every chosen category', async () => {
    const { svc, created } = setup(shelf, cats);
    await svc.create('S1', { scope: 'CATEGORY', categoryIds: [1, 2] }, user);

    expect(created[0].items.create.map((i) => i.productId).sort()).toEqual([1, 2, 4]);
    expect(created[0]).toMatchObject({ categoryIds: [1, 2], categoryId: null, totalItems: 3 });
  });

  it('a single category also fills categoryId, the way older documents read', async () => {
    const { svc, created } = setup(shelf, cats);
    await svc.create('S1', { scope: 'CATEGORY', categoryIds: [2] }, user);
    expect(created[0]).toMatchObject({ categoryIds: [2], categoryId: 2, totalItems: 2 });
  });

  it('still accepts the old single categoryId, merged with categoryIds', async () => {
    const { svc, created } = setup(shelf, cats);
    await svc.create('S1', { scope: 'CATEGORY', categoryId: 3 }, user);
    expect(created[0]).toMatchObject({ categoryIds: [3], categoryId: 3, totalItems: 1 });

    await svc.create('S1', { scope: 'CATEGORY', categoryId: 1, categoryIds: [1, 3] }, user);
    expect(created[1].categoryIds.sort()).toEqual([1, 3]);
  });

  it("refuses another store's category and an empty selection", async () => {
    const { svc, prisma } = setup(shelf, cats);
    await expect(
      svc.create('S1', { scope: 'CATEGORY', categoryIds: [1, 9] }, user),
    ).rejects.toThrow('Category not found');
    await expect(svc.create('S1', { scope: 'CATEGORY', categoryIds: [] }, user)).rejects.toThrow(
      'required',
    );
    expect(prisma.inventoryCount.create).not.toHaveBeenCalled();
  });

  it('FULL scope stores no categories', async () => {
    const { svc, created } = setup(shelf, cats);
    await svc.create('S1', { scope: 'FULL', categoryIds: [1] }, user);
    expect(created[0]).toMatchObject({ categoryIds: [], categoryId: null, totalItems: 4 });
  });
});

describe('scopeCategoryIds', () => {
  it('prefers categoryIds and falls back to the legacy categoryId', () => {
    expect(scopeCategoryIds({ categoryId: null, categoryIds: [1, 2] })).toEqual([1, 2]);
    expect(scopeCategoryIds({ categoryId: 7, categoryIds: [] })).toEqual([7]);
    expect(scopeCategoryIds({ categoryId: null, categoryIds: [] })).toEqual([]);
  });
});
