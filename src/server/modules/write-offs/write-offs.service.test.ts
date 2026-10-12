import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { WriteOffsService } from './write-offs.service';
import type { CreateWriteOffDto } from './dto/create-write-off.dto';

const D = (v: number | string) => new Prisma.Decimal(v);
const user = { id: 'admin1', nameRu: 'Админ' };

type Doc = { id: string; storeId: string; number: number; items?: unknown[] };

/**
 * An in-memory stand-in for the Prisma calls the service makes, with `stock` held per product so
 * the conditional decrement behaves like the real `updateMany`.
 */
function build(opts: { stock?: Record<number, number>; ledger?: boolean; docs?: Doc[] } = {}) {
  const stock = new Map(
    Object.entries(opts.stock ?? { 1: 10, 2: 5 }).map(([k, v]) => [Number(k), D(v)]),
  );
  const docs = new Map((opts.docs ?? []).map((d) => [d.id, d]));
  let seq = 0;
  const emitted: unknown[] = [];

  const products = () =>
    [...stock].map(([id, s]) => ({
      id,
      nameRu: `P${id}`,
      nameUz: `P${id}uz`,
      barcode: `B${id}`,
      unit: 'шт',
      stock: s,
      cost: D(1000),
      price: D(1500),
    }));

  const tx = {
    writeOff: {
      aggregate: jest.fn(async () => ({ _max: { number: docs.size || null } })),
      create: jest.fn(async ({ data }: { data: Doc & { items: { create: unknown[] } } }) => {
        const id = data.id ?? `wo${++seq}`;
        docs.set(id, { ...data, id, items: data.items.create });
        return { id };
      }),
    },
    product: {
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: number; stock?: { gte: Prisma.Decimal } };
          data: { stock: { decrement: Prisma.Decimal } };
        }) => {
          const s = stock.get(where.id);
          // No guard means an unconditional decrement, as with the real updateMany.
          if (!s || (where.stock && s.lt(where.stock.gte))) return { count: 0 };
          stock.set(where.id, s.minus(data.stock.decrement));
          return { count: 1 };
        },
      ),
      findMany: jest.fn(async () => products()),
    },
  };
  const prisma = {
    product: { findMany: jest.fn(async () => products()) },
    writeOff: {
      findUnique: jest.fn(
        async ({ where }: { where: { id: string } }) => docs.get(where.id) ?? null,
      ),
    },
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const movements = {
    enabled: opts.ledger ?? false,
    emit: jest.fn(async (_tx: unknown, rows: unknown[]) => {
      emitted.push(...rows);
    }),
  };
  const service = new WriteOffsService(prisma as never, movements as never);
  return { service, stock, docs, tx, prisma, emitted };
}

const dto = (over: Partial<CreateWriteOffDto> = {}): CreateWriteOffDto => ({
  reason: 'EXPIRY',
  items: [{ productId: 1, quantity: 4 }],
  ...over,
});

describe('WriteOffsService.create', () => {
  it('posts the document and takes the goods out of stock', async () => {
    const { service, stock, docs } = build();
    const doc = await service.create('S1', dto(), user);
    expect(doc).toMatchObject({
      storeId: 'S1',
      number: 1,
      reason: 'EXPIRY',
      createdByName: 'Админ',
      totalItems: 1,
    });
    expect(stock.get(1)?.toString()).toBe('6');
    expect(docs.size).toBe(1);
  });

  it('returns the document already written when the same id is sent again', async () => {
    const { service, stock, tx } = build();
    await service.create('S1', dto({ id: 'client-1' }), user);
    const again = await service.create('S1', dto({ id: 'client-1' }), user);
    expect(again.id).toBe('client-1');
    expect(stock.get(1)?.toString()).toBe('6'); // taken out once
    expect(tx.writeOff.create).toHaveBeenCalledTimes(1);
  });

  it('refuses an id another store already used', async () => {
    const { service } = build({ docs: [{ id: 'client-1', storeId: 'S2', number: 1 }] });
    await expect(service.create('S1', dto({ id: 'client-1' }), user)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('refuses more than in stock before writing anything', async () => {
    const { service, tx, stock } = build();
    await expect(
      service.create('S1', dto({ items: [{ productId: 2, quantity: 6 }] }), user),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.writeOff.create).not.toHaveBeenCalled();
    expect(stock.get(2)?.toString()).toBe('5');
  });

  it('refuses OTHER without a note', async () => {
    const { service } = build();
    await expect(service.create('S1', dto({ reason: 'OTHER' }), user)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('fails the whole write-off when stock dropped below the line after the check', async () => {
    const { service, stock, tx } = build();
    // A sale lands between the plan and the decrement.
    tx.writeOff.create.mockImplementationOnce(async () => {
      stock.set(1, D(1));
      return { id: 'wo-x' };
    });
    await expect(service.create('S1', dto(), user)).rejects.toThrow(/changed while writing off/);
  });

  it('records ledger rows only when the ledger is on, negative and typed by reason', async () => {
    const off = build();
    await off.service.create('S1', dto(), user);
    expect(off.emitted).toHaveLength(0);

    const on = build({ ledger: true });
    await on.service.create(
      'S1',
      dto({ reason: 'DAMAGE', items: [{ productId: 2, quantity: 2 }] }),
      user,
    );
    expect(on.emitted).toEqual([
      expect.objectContaining({
        productId: 2,
        type: 'WRITE_OFF_DAMAGE',
        sourceType: 'WRITE_OFF',
        reasonCode: 'DAMAGE',
      }),
    ]);
    expect(String((on.emitted[0] as { quantity: Prisma.Decimal }).quantity)).toBe('-2');
  });

  it('books OTHER as a manual adjustment with its reason', async () => {
    const { service, emitted } = build({ ledger: true });
    await service.create('S1', dto({ reason: 'OTHER', note: 'Kalamush' }), user);
    expect(emitted[0]).toMatchObject({
      type: 'MANUAL_ADJUSTMENT',
      reasonCode: 'OTHER',
      note: 'Kalamush',
    });
  });
});
