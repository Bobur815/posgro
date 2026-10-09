import { Prisma } from '@prisma/client';
import { InventoryCountService } from './inventory-count.service';

// A product moved into a CATEGORY document's category after the document was made must get a
// line — found live in store 1234: seven drinks fixed into "Напитки" mid-count never appeared.

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
interface Item {
  id: string;
  countId: string;
  productId: number;
  barcode: string;
  counted: boolean;
  countedQty: Prisma.Decimal | number | null;
  expectedQty: Prisma.Decimal;
}
interface Count {
  id: string;
  storeId: string;
  status: 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  scope: 'FULL' | 'CATEGORY';
  categoryId: number | null;
  totalItems: number;
  countedItems: number;
}

const D = (n: number) => new Prisma.Decimal(n);
const product = (id: number, over: Partial<Product> = {}): Product => ({
  id,
  storeId: 'S1',
  active: true,
  categoryId: 1,
  nameRu: `P${id}`,
  nameUz: `P${id}`,
  barcode: `B${id}`,
  unit: 'шт',
  stock: D(5),
  cost: D(1000),
  ...over,
});

function setup(count: Partial<Count>, products: Product[], items: Item[]) {
  const doc: Count = {
    id: 'C1',
    storeId: 'S1',
    status: 'IN_PROGRESS',
    scope: 'CATEGORY',
    categoryId: 1,
    totalItems: items.length,
    countedItems: items.filter((i) => i.counted).length,
    ...count,
  };
  let seq = 0;
  const prisma = {
    inventoryCount: {
      findUnique: jest.fn(async ({ include }: { include?: unknown }) =>
        include ? { ...doc, items: items.filter((i) => i.countId === doc.id) } : { ...doc },
      ),
      update: jest.fn(async ({ data }: { data: Partial<Count> }) => Object.assign(doc, data)),
    },
    product: {
      findMany: jest.fn(
        async ({
          where,
        }: {
          where: {
            storeId: string;
            active: boolean;
            categoryId: number;
            inventoryCountItems: { none: { countId: string } };
          };
        }) =>
          products.filter(
            (p) =>
              p.storeId === where.storeId &&
              p.active === where.active &&
              p.categoryId === where.categoryId &&
              !items.some(
                (i) => i.productId === p.id && i.countId === where.inventoryCountItems.none.countId,
              ),
          ),
      ),
    },
    inventoryCountItem: {
      createMany: jest.fn(
        async ({ data }: { data: Array<Omit<Item, 'id' | 'counted' | 'countedQty'>> }) => {
          let added = 0;
          for (const d of data) {
            if (items.some((i) => i.countId === d.countId && i.productId === d.productId)) continue;
            items.push({ ...d, id: `new-${++seq}`, counted: false, countedQty: null });
            added++;
          }
          return { count: added };
        },
      ),
      count: jest.fn(
        async ({ where }: { where: { countId: string; counted?: boolean } }) =>
          items.filter(
            (i) =>
              i.countId === where.countId &&
              (where.counted === undefined || i.counted === where.counted),
          ).length,
      ),
      findFirst: jest.fn(
        async ({ where }: { where: { countId: string; barcode: string } }) =>
          items.find((i) => i.countId === where.countId && i.barcode === where.barcode) ?? null,
      ),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<Item> }) =>
        Object.assign(items.find((i) => i.id === where.id)!, data),
      ),
    },
  };
  const svc = new InventoryCountService(prisma as never, {} as never);
  return { svc, prisma, doc, items };
}

const line = (productId: number, over: Partial<Item> = {}): Item => ({
  id: `L${productId}`,
  countId: 'C1',
  productId,
  barcode: `B${productId}`,
  counted: false,
  countedQty: null,
  expectedQty: D(5),
  ...over,
});

describe('InventoryCountService — category top-up', () => {
  it('opening the document adds a product moved into the category, snapshotting its stock now', async () => {
    const counted = line(1, { counted: true, countedQty: D(3) });
    const { svc, doc, items } = setup({}, [product(1), product(2, { stock: D(12) })], [counted]);

    const res = await svc.findOne('S1', 'C1');

    expect(res.items.map((i: Item) => i.productId).sort()).toEqual([1, 2]);
    expect(items.find((i) => i.productId === 2)).toMatchObject({
      expectedQty: D(12),
      counted: false,
    });
    // The counted line is untouched.
    expect(items.find((i) => i.productId === 1)).toMatchObject({ counted: true, countedQty: D(3) });
    expect(doc.totalItems).toBe(2);
  });

  it('is idempotent: a second open adds nothing', async () => {
    const { svc, prisma } = setup({}, [product(1), product(2)], [line(1)]);
    await svc.findOne('S1', 'C1');
    await svc.findOne('S1', 'C1');
    expect(prisma.inventoryCountItem.createMany).toHaveBeenCalledTimes(1);
  });

  it('scanning a product moved into the category adds its line and counts it', async () => {
    const { svc, items } = setup({}, [product(1), product(2)], [line(1)]);

    const res = await svc.scan('S1', 'C1', 'B2', 2);

    expect(res.item).toMatchObject({ productId: 2, counted: true, countedQty: 2 });
    expect(res.totalItems).toBe(2);
    expect(items).toHaveLength(2);
  });

  it('a barcode outside the category is still refused', async () => {
    const { svc } = setup({}, [product(1), product(9, { categoryId: 2 })], [line(1)]);
    await expect(svc.scan('S1', 'C1', 'B9')).rejects.toThrow('Product not in this count');
  });

  it('leaves FULL-scope, closed and other-store documents alone', async () => {
    for (const over of [{ scope: 'FULL' as const }, { status: 'COMPLETED' as const }]) {
      const { svc, prisma } = setup(over, [product(1), product(2)], [line(1)]);
      await svc.findOne('S1', 'C1');
      expect(prisma.product.findMany).not.toHaveBeenCalled();
    }
    const { svc, prisma } = setup({}, [product(1), product(2)], [line(1)]);
    await expect(svc.findOne('OTHER', 'C1')).rejects.toThrow('Count not found');
    expect(prisma.product.findMany).not.toHaveBeenCalled();
  });

  it('skips inactive and other-store products', async () => {
    const { svc, items } = setup(
      {},
      [product(1), product(2, { active: false }), product(3, { storeId: 'S2' })],
      [line(1)],
    );
    await svc.findOne('S1', 'C1');
    expect(items).toHaveLength(1);
  });
});
