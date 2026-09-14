import { ProductsService } from './products.service';

/**
 * A product deleted on the dashboard must stay deleted: a terminal still holding it uploads it on
 * every cycle an admin is signed in, and `syncBulk` used to recreate it — with the next store code
 * and without its MXIK. Terminals learn of deletions from `findDeletedSince`; re-adding the barcode
 * on the dashboard (`create`) makes it live again.
 */

type Row = Record<string, any>;

function build() {
  const products: Row[] = [];
  const deleted: Row[] = [];
  const created: Row[] = [];

  const matches = (row: Row, where: Row) =>
    Object.entries(where).every(([k, v]) => {
      if (v && typeof v === 'object' && 'in' in v) return (v.in as unknown[]).includes(row[k]);
      if (v && typeof v === 'object' && 'gt' in v) return row[k] > v.gt;
      return row[k] === v;
    });

  const prisma = {
    product: {
      findUnique: jest.fn(async ({ where }: any) => {
        const key = where.storeId_barcode;
        return products.find((p) => p.storeId === key.storeId && p.barcode === key.barcode) ?? null;
      }),
      findFirst: jest.fn(async ({ where }: any) => products.find((p) => matches(p, where)) ?? null),
      findMany: jest.fn(async ({ where }: any) => products.filter((p) => matches(p, where))),
      create: jest.fn(async ({ data }: any) => {
        created.push(data);
        products.push({ id: products.length + 100, ...data });
        return data;
      }),
    },
    deletedProduct: {
      findFirst: jest.fn(async ({ where }: any) => deleted.find((d) => matches(d, where)) ?? null),
      findMany: jest.fn(async ({ where }: any) =>
        deleted
          .filter((d) => matches(d, where))
          .sort((a, b) => a.deletedAt - b.deletedAt)
          .map(({ barcode, productId, deletedAt }) => ({ barcode, productId, deletedAt })),
      ),
      deleteMany: jest.fn(async ({ where }: any) => {
        for (let i = deleted.length - 1; i >= 0; i--) if (matches(deleted[i], where)) deleted.splice(i, 1);
        return { count: 0 };
      }),
    },
  };

  const service = new ProductsService(prisma as any);
  jest.spyOn(service as any, 'getNextStoreProductCode').mockResolvedValue(3128);
  return { service, products, deleted, created };
}

const upload = (barcode: string, extra: Row = {}) => ({
  barcode,
  nameUz: 'Shaftoli tukli',
  nameRu: 'Персик',
  price: 30000,
  categoryId: 1,
  ...extra,
});

describe('syncBulk', () => {
  it('does not bring back a product deleted on the dashboard', async () => {
    const { service, deleted, created } = build();
    deleted.push({ storeId: 'st', barcode: 'P1', productId: 2431, deletedAt: new Date('2026-09-12') });

    await expect(service.syncBulk('st', [upload('P1')])).resolves.toMatchObject({ created: 0, deleted: 1 });
    expect(created).toEqual([]);
  });

  it('only minds deletions in its own store', async () => {
    const { service, deleted } = build();
    deleted.push({ storeId: 'other', barcode: 'P1', productId: 1, deletedAt: new Date() });
    await expect(service.syncBulk('st', [upload('P1')])).resolves.toMatchObject({ created: 1 });
  });

  it('creates a product made offline with its MXIK, package code, VAT and marking', async () => {
    const { service, created } = build();
    await service.syncBulk('st', [
      upload('NEW', { mxik: '08112001001000000', packageCode: '1511386', vatRate: 12, isMarked: false }),
    ]);
    expect(created[0]).toMatchObject({
      barcode: 'NEW',
      mxik: '08112001001000000',
      packageCode: '1511386',
      vatRate: 12,
      isMarked: false,
      storeProductCode: 3128,
    });
  });

  it('still leaves an existing product alone', async () => {
    const { service, products, created } = build();
    products.push({ id: 1, storeId: 'st', barcode: 'P1' });
    await expect(service.syncBulk('st', [upload('P1')])).resolves.toMatchObject({ skipped: 1 });
    expect(created).toEqual([]);
  });
});

describe('findDeletedSince', () => {
  it("lists this store's deletions after the cursor, oldest first", async () => {
    const { service, deleted } = build();
    deleted.push(
      { storeId: 'st', barcode: 'B', productId: 2, deletedAt: new Date('2026-09-12T10:00:00Z') },
      { storeId: 'st', barcode: 'A', productId: 1, deletedAt: new Date('2026-09-12T09:00:00Z') },
      { storeId: 'st', barcode: 'OLD', productId: 3, deletedAt: new Date('2026-09-01T00:00:00Z') },
      { storeId: 'other', barcode: 'X', productId: 4, deletedAt: new Date('2026-09-12T11:00:00Z') },
    );
    const rows = await service.findDeletedSince('st', new Date('2026-09-10T00:00:00Z'));
    expect(rows.map((r) => r.barcode)).toEqual(['A', 'B']);
  });

  it('leaves out a barcode that is live again', async () => {
    const { service, deleted, products } = build();
    deleted.push({ storeId: 'st', barcode: 'P1', productId: 2431, deletedAt: new Date() });
    products.push({ id: 9, storeId: 'st', barcode: 'P1' });
    expect(await service.findDeletedSince('st')).toEqual([]);
  });
});

describe('create', () => {
  it('clears the deletion record when the barcode is added again', async () => {
    const { service, deleted } = build();
    deleted.push(
      { storeId: 'st', barcode: 'P1', productId: 2431, deletedAt: new Date() },
      { storeId: 'other', barcode: 'P1', productId: 5, deletedAt: new Date() },
    );
    await service.create('st', upload('P1') as any);
    expect(deleted.map((d) => d.storeId)).toEqual(['other']);
  });
});
