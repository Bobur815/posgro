import * as bcrypt from 'bcryptjs';
import { ConflictException } from '@nestjs/common';
import { StoresService } from './stores.service';

/**
 * One owner, several stores. Users are per store, so the owner has one admin account in each under
 * one phone — and the dashboard's single login opens the stores whose account the password opens.
 * A new store's admin account therefore takes the password of the account that phone already has;
 * a phone new to the system still starts at the default.
 */

type Account = { id: string; storeId: string | null; role: string; active: boolean; password: string };

function build(accounts: Account[]) {
  const created: Array<Record<string, any>> = [];
  const updated: Array<Record<string, any>> = [];
  const tx = {
    store: { create: jest.fn(async ({ data }: any) => ({ id: data.id })) },
    user: {
      create: jest.fn(async ({ data }: any) => {
        created.push(data);
        return data;
      }),
    },
  };
  const prisma = {
    store: {
      findMany: jest.fn(async () => []),
      findUnique: jest.fn(async () => ({ id: '1000', name: 'Shop', superAdminPassword: null, _count: {} })),
    },
    user: {
      // Every account here is under PHONE — the only phone these tests use.
      findMany: jest.fn(async () => accounts),
      create: jest.fn(async ({ data }: any) => {
        created.push(data);
        return data;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        updated.push({ id: where.id, ...data });
        return data;
      }),
    },
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  return { service: new StoresService(prisma as never), created, updated, tx };
}

let OWNER_HASH = '';
beforeAll(async () => {
  OWNER_HASH = await bcrypt.hash('owner-password', 4);
});

const PHONE = '998901234567';
const owner = (storeId: string, extra: Partial<Account> = {}): Account => ({
  id: `u-${storeId}`,
  storeId,
  role: 'ADMIN',
  active: true,
  password: OWNER_HASH,
  ...extra,
});

describe('creating a store', () => {
  it("gives a phone new to the system the default password", async () => {
    const { service, created } = build([]);
    await service.create({ name: 'First', phone: PHONE } as never);
    expect(created).toHaveLength(1);
    expect(await bcrypt.compare('123456', created[0].password)).toBe(true);
  });

  it("lets an owner's phone have a second store, with the password they already use", async () => {
    const { service, created } = build([owner('1000')]);
    await expect(service.create({ name: 'Second', phone: PHONE } as never)).resolves.toBeDefined();
    expect(created[0]).toMatchObject({ phone: PHONE, role: 'ADMIN', password: OWNER_HASH });
  });

  it('takes the password from an active admin account over an old or disabled one', async () => {
    const { service, created } = build([
      owner('1000', { active: false, password: 'disabled-hash' }),
      owner('1001', { role: 'USER', password: 'cashier-hash' }),
      owner('1002'),
    ]);
    await service.create({ name: 'Third', phone: PHONE } as never);
    expect(created[0].password).toBe(OWNER_HASH);
  });

  it("refuses a super admin's phone, which could never sign in to a store", async () => {
    const { service, created, tx } = build([owner('x', { storeId: null, role: 'SUPER_ADMIN' })]);
    await expect(service.create({ name: 'Nope', phone: PHONE } as never)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.store.create).not.toHaveBeenCalled();
    expect(created).toEqual([]);
  });
});

describe('resetting a store admin', () => {
  it("gives this store an admin account with the password the phone's other stores use", async () => {
    const { service, created } = build([owner('1000')]);
    await service.resetAdminUser('2000', PHONE);
    expect(created[0]).toMatchObject({ storeId: '2000', phone: PHONE, role: 'ADMIN', password: OWNER_HASH });
  });

  it("resets this store's own account to the default password", async () => {
    const { service, updated, created } = build([owner('1000'), owner('2000')]);
    await service.resetAdminUser('2000', PHONE);
    expect(created).toEqual([]);
    expect(updated[0].id).toBe('u-2000');
    expect(await bcrypt.compare('123456', updated[0].password)).toBe(true);
  });
});
