import * as bcrypt from 'bcryptjs';
import { ConflictException } from '@nestjs/common';
import { StoresService } from './stores.service';
import {
  DAY_MS,
  DEFAULT_SUBSCRIPTION_RULES,
  type SubscriptionRules,
} from '../../../shared/utils/subscription';

/**
 * One owner, several stores. Users are per store, so the owner has one admin account in each under
 * one phone — and the dashboard's single login opens the stores whose account the password opens.
 * A new store's admin account therefore takes the password of the account that phone already has;
 * a phone new to the system still starts at the default.
 */

type Account = { id: string; storeId: string | null; role: string; active: boolean; password: string };

function build(accounts: Account[], rules: SubscriptionRules = DEFAULT_SUBSCRIPTION_RULES) {
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
      update: jest.fn(async ({ data }: any) => ({ id: '1000', name: 'Shop', superAdminPassword: null, _count: {}, ...data })),
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
  const siteConfig = { getSubscriptionRules: jest.fn(async () => rules) };
  return {
    service: new StoresService(prisma as never, siteConfig as never),
    created,
    updated,
    tx,
    prisma,
  };
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

/**
 * A phone is stored one way, 998XXXXXXXXX — the way the dashboard's login sends it. Store contact
 * phones used to be saved as typed, so "+998 932144774" and "998932144774" were the same number
 * shown two ways on the super admin dashboard.
 */
describe('store phones', () => {
  it('saves a store and its admin under the phone the way accounts store it', async () => {
    const { service, created, tx } = build([]);
    await service.create({ name: 'Shop', phone: '+998 93 214 47 74' } as never);
    expect(tx.store.create.mock.calls[0][0].data.phone).toBe('998932144774');
    expect(created[0].phone).toBe('998932144774');
  });

  it('cleans the phone up when a store is edited', async () => {
    const { service, prisma } = build([]);
    await service.update('1000', { phone: '+998 932144774' } as never);
    expect(prisma.store.update.mock.calls[0][0].data.phone).toBe('998932144774');
  });

  it('clears the phone when an edit empties it', async () => {
    const { service, prisma } = build([]);
    await service.update('1000', { phone: '' } as never);
    expect(prisma.store.update.mock.calls[0][0].data.phone).toBeNull();
  });

  it("links an admin phone typed another way to the owner's account", async () => {
    const { service, created } = build([owner('1000')]);
    await service.resetAdminUser('2000', '+998 (93) 214-47-74');
    expect(created[0]).toMatchObject({ phone: '998932144774', password: OWNER_HASH });
  });
});

/**
 * A new store is held to its subscription from the day it is made: with no plan it is blocked
 * (shared/utils/subscription.ts), so while trials are on it opens on one.
 */
describe("a new store's subscription", () => {
  const storeData = (tx: ReturnType<typeof build>['tx']) => tx.store.create.mock.calls[0][0].data;

  it('starts on a trial of the configured length', async () => {
    const { service, tx } = build([], { ...DEFAULT_SUBSCRIPTION_RULES, trialDays: 10 });
    const before = Date.now();
    await service.create({ name: 'Shop' } as never);
    const data = storeData(tx);
    expect(data).toMatchObject({ subscriptionRequired: true, subscriptionPlan: 'TRIAL' });
    const expires = (data.subscriptionExpiresAt as Date).getTime();
    expect(expires).toBeGreaterThanOrEqual(before + 10 * DAY_MS);
    expect(expires).toBeLessThanOrEqual(Date.now() + 10 * DAY_MS);
  });

  it('starts with no plan, and so blocked, when trials are switched off', async () => {
    const { service, tx } = build([], { ...DEFAULT_SUBSCRIPTION_RULES, trialEnabled: false });
    await service.create({ name: 'Shop' } as never);
    const data = storeData(tx);
    expect(data.subscriptionRequired).toBe(true);
    expect(data.subscriptionPlan).toBeUndefined();
    expect(data.subscriptionExpiresAt).toBeUndefined();
  });
});

/** Grace left over from the day enforcement shipped ends when a new date is set, and only then. */
describe("setting a store's subscription date", () => {
  const OLD = new Date('2026-08-01T00:00:00.000Z');
  const withDate = (prisma: ReturnType<typeof build>['prisma']) =>
    prisma.store.findUnique.mockResolvedValueOnce({
      id: '1000',
      name: 'Shop',
      superAdminPassword: null,
      _count: {},
      subscriptionExpiresAt: OLD,
    } as never);
  const sent = (prisma: ReturnType<typeof build>['prisma']) => prisma.store.update.mock.calls[0][0].data;

  it('clears the grace start when the date changes', async () => {
    const { service, prisma } = build([]);
    withDate(prisma);
    await service.update('1000', { subscriptionPlan: 'PRO', subscriptionExpiresAt: '2026-10-12T00:00:00.000Z' } as never);
    expect(sent(prisma)).toMatchObject({ subscriptionGraceFrom: null });
  });

  // The store screen sends the date with every save.
  it('keeps it when the same date is saved again', async () => {
    const { service, prisma } = build([]);
    withDate(prisma);
    await service.update('1000', { subscriptionPlan: 'PRO', subscriptionExpiresAt: OLD.toISOString() } as never);
    expect(sent(prisma)).not.toHaveProperty('subscriptionGraceFrom');
  });

  it('accepts the trial plan', async () => {
    const { service, prisma } = build([]);
    await service.update('1000', { subscriptionPlan: 'TRIAL' } as never);
    expect(sent(prisma).subscriptionPlan).toBe('TRIAL');
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
