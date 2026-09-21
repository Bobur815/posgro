/**
 * `POST /users/sync-bulk`: a terminal's users, merged into the store's — with the server's copy
 * of who a user is winning unless the terminal says it changed the user itself.
 *
 * A row without a profile (names, password) comes from a terminal that did not edit that user:
 * only its nasiya balance may move, and a user this server no longer has must not come back.
 */
import { UsersService } from './users.service';

type Row = { id: string; storeId: string; phone: string; role: string; active: boolean };

function service(rows: Row[]) {
  const prisma = {
    user: {
      findUnique: jest.fn(async ({ where }: { where: { id?: string; storeId_phone?: { storeId: string; phone: string } } }) =>
        where.id
          ? rows.find((r) => r.id === where.id) ?? null
          : rows.find((r) => r.storeId === where.storeId_phone!.storeId && r.phone === where.storeId_phone!.phone) ?? null,
      ),
      update: jest.fn(async () => ({})),
      create: jest.fn(async () => ({})),
    },
  };
  return { svc: new UsersService(prisma as never), prisma };
}

const stored: Row = { id: 'u1', storeId: 'S1', phone: '998901111111', role: 'USER', active: true };

describe('UsersService.upsertBulk', () => {
  it('moves only the balance of a user the terminal did not edit', async () => {
    const { svc, prisma } = service([stored]);
    const res = await svc.upsertBulk([{ id: 'u1', phone: '998901111111', debt: 7000, debtDueDate: null }], 'S1');

    expect(res).toMatchObject({ updated: 1, created: 0, skipped: 0, errors: [] });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { debt: 7000, debtDueDate: null },
    });
  });

  it('does not re-create a user deleted on the server', async () => {
    const { svc, prisma } = service([]);
    const res = await svc.upsertBulk([{ id: 'gone', phone: '998902222222', debt: 0 }], 'S1');

    expect(res).toMatchObject({ created: 0, skipped: 1 });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('applies a profile the terminal edited, found by id even with a new phone', async () => {
    const { svc, prisma } = service([stored]);
    await svc.upsertBulk(
      [{ id: 'u1', phone: '998903333333', password: 'h', nameUz: 'Yangi', nameRu: 'Новый', role: 'USER', active: false }],
      'S1',
    );

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: expect.objectContaining({ phone: '998903333333', nameRu: 'Новый', active: false }),
    });
  });

  it('creates a user the terminal created', async () => {
    const { svc, prisma } = service([]);
    const res = await svc.upsertBulk(
      [{ id: 'c1', phone: '998904444444', password: 'h', nameUz: 'Mijoz', nameRu: 'Клиент', role: 'CLIENT' }],
      'S1',
    );

    expect(res).toMatchObject({ created: 1 });
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ id: 'c1', storeId: 'S1', role: 'CLIENT' }),
    });
  });

  it('ignores an id that belongs to another store and matches by phone instead', async () => {
    const other: Row = { ...stored, id: 'x', storeId: 'S2' };
    const mine: Row = { ...stored, id: 'm', phone: '998905555555' };
    const { svc, prisma } = service([other, mine]);
    await svc.upsertBulk([{ id: 'x', phone: '998905555555', debt: 1 }], 'S1');

    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'm' }, data: { debt: 1 } });
  });
});
