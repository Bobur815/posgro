import * as bcrypt from 'bcryptjs';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  DAY_MS,
  DEFAULT_SUBSCRIPTION_RULES,
  type SubscriptionRules,
} from '../../../shared/utils/subscription';

/**
 * Signing in to the web dashboard without a store ID, and switching between stores.
 *
 * Users are per store, so one person with several stores has one account in each, under one phone.
 * A login that names no store opens the accounts its password opens — never one with another
 * password — and the token lists them, so the dashboard can switch without asking again. A login
 * that names its store (every POS terminal) is unchanged.
 */

const PHONE = '998901234567';
const PASSWORD = 'secret123';
let HASH = '';
let OTHER_HASH = '';

beforeAll(async () => {
  HASH = await bcrypt.hash(PASSWORD, 4);
  OTHER_HASH = await bcrypt.hash('someone-else', 4);
});

type Account = ReturnType<typeof account>;

function account(storeId: string, storeName: string, extra: Record<string, unknown> = {}) {
  return {
    id: `u-${storeId}`,
    storeId,
    phone: PHONE,
    role: 'ADMIN',
    active: true,
    nameUz: 'Admin',
    nameRu: 'Админ',
    password: HASH,
    createdAt: new Date(),
    store: { id: storeId, name: storeName, active: true, mode: 'ONLINE' },
    ...extra,
  };
}

function build(
  accounts: Account[],
  superAdmin: unknown = null,
  heartbeats: Array<{ storeId: string; updatedAt: Date }> = [],
  rules: SubscriptionRules = DEFAULT_SUBSCRIPTION_RULES,
) {
  const sessions: Array<{ id: string; userId: string }> = [];
  const revoked: string[] = [];

  const usersService = {
    findByPhoneAndStore: jest.fn(async (_phone: string, storeId?: string) =>
      storeId ? (accounts.find((a) => a.storeId === storeId) ?? null) : superAdmin,
    ),
    findStoreAccountsByPhone: jest.fn(async () => accounts),
    findById: jest.fn(),
  };
  const jwtService = { sign: jest.fn((payload: unknown) => JSON.stringify(payload)) };
  const prisma = {
    store: {
      findUnique: jest.fn(async ({ where }: any) => accounts.find((a) => a.storeId === where.id)?.store ?? null),
    },
    userSession: {
      create: jest.fn(async ({ data }: any) => {
        const session = { id: `sess-${sessions.length + 1}`, userId: data.userId };
        sessions.push(session);
        return session;
      }),
      findFirst: jest.fn(async () => null),
      updateMany: jest.fn(async ({ where }: any) => {
        revoked.push(where.id);
        return { count: 1 };
      }),
    },
    terminalHeartbeat: {
      findMany: jest.fn(async ({ where }: any) =>
        heartbeats.filter((h) => where.storeId.in.includes(h.storeId) && h.updatedAt >= where.updatedAt.gte),
      ),
    },
    user: {
      findUnique: jest.fn(
        async ({ where }: any) =>
          accounts.find(
            (a) => a.storeId === where.storeId_phone.storeId && a.phone === where.storeId_phone.phone,
          ) ?? null,
      ),
      findMany: jest.fn(async ({ where }: any) =>
        accounts.filter((a) =>
          'password' in where
            ? // The twin-account lookup: same phone, the very same password hash.
              a.phone === where.phone && a.password === where.password && a.active && a.storeId !== null
            : a.phone === where.phone && where.storeId.in.includes(a.storeId) && a.active,
        ),
      ),
    },
  };

  const siteConfig = { getSubscriptionRules: jest.fn(async () => rules) };
  const service = new AuthService(
    usersService as never,
    jwtService as never,
    prisma as never,
    siteConfig as never,
  );
  return { service, usersService, sessions, revoked };
}

const claims = (token: string) => JSON.parse(token);
/** A store whose PRO plan expired a month ago — far past its grace days. */
const unpaid = (id: string, name: string) => ({
  store: {
    id,
    name,
    active: true,
    mode: 'ONLINE',
    subscriptionPlan: 'PRO',
    subscriptionExpiresAt: new Date(Date.now() - 30 * DAY_MS),
  },
});
const login = (extra: Record<string, unknown> = {}) => ({ phone: PHONE, password: PASSWORD, ...extra }) as any;

describe('login without a store ID', () => {
  it('signs in to the only store the password opens, and lists it', async () => {
    const { service } = build([account('A', 'Alpha')]);
    const res = await service.login(login());
    expect(res.user.storeId).toBe('A');
    expect(claims(res.token).storeIds).toEqual(['A']);
    expect(res.stores).toEqual([
      { id: 'A', name: 'Alpha', role: 'ADMIN', online: false, offlineOnly: false, subscriptionBlocked: false },
    ]);
  });

  it('opens the store this browser used last when it may, else the first by name', async () => {
    const accounts = [account('B', 'Bravo'), account('A', 'Alpha')];
    expect((await build(accounts).service.login(login({ preferredStoreId: 'B' }))).user.storeId).toBe('B');
    expect((await build(accounts).service.login(login())).user.storeId).toBe('A');
    expect((await build(accounts).service.login(login({ preferredStoreId: 'ZZ' }))).user.storeId).toBe('A');
  });

  it('never offers an account the password does not open', async () => {
    const { service } = build([account('A', 'Alpha'), account('B', 'Bravo', { password: OTHER_HASH })]);
    const res = await service.login(login());
    expect(claims(res.token).storeIds).toEqual(['A']);
    expect(res.stores?.map((s) => s.id)).toEqual(['A']);
  });

  it('refuses a wrong password, and opens nothing', async () => {
    const { service, sessions } = build([account('A', 'Alpha')]);
    await expect(service.login(login({ password: 'wrong-one' }))).rejects.toBeInstanceOf(UnauthorizedException);
    expect(sessions).toEqual([]);
  });

  it('lists an offline-only store greyed out, but signs in to one the dashboard can open', async () => {
    const { service } = build([
      account('A', 'Alpha'),
      account('B', 'Bravo', { store: { id: 'B', name: 'Bravo', active: true, mode: 'OFFLINE_ONLY' } }),
    ]);
    const res = await service.login(login({ preferredStoreId: 'B' }));
    expect(res.user.storeId).toBe('A');
    expect(claims(res.token).storeIds).toEqual(['A', 'B']);
    expect(res.stores?.map((s) => [s.id, s.offlineOnly])).toEqual([
      ['A', false],
      ['B', true],
    ]);
  });

  it('leaves a deactivated store out of the list altogether', async () => {
    const { service } = build([
      account('A', 'Alpha'),
      account('B', 'Bravo', { store: { id: 'B', name: 'Bravo', active: false, mode: 'ONLINE' } }),
    ]);
    const res = await service.login(login());
    expect(res.stores?.map((s) => s.id)).toEqual(['A']);
  });

  it('says why when every store it opens is blocked', async () => {
    const { service } = build([
      account('A', 'Alpha', { store: { id: 'A', name: 'Alpha', active: false, mode: 'ONLINE' } }),
    ]);
    await expect(service.login(login())).rejects.toThrow(new ForbiddenException('auth.errors.store_inactive'));
  });

  it('lists a store blocked for its subscription greyed out, and signs in to another', async () => {
    const { service } = build([account('A', 'Alpha'), account('B', 'Bravo', unpaid('B', 'Bravo'))]);
    const res = await service.login(login({ preferredStoreId: 'B' }));
    expect(res.user.storeId).toBe('A');
    expect(claims(res.token).storeIds).toEqual(['A', 'B']);
    expect(res.stores?.map((s) => [s.id, s.subscriptionBlocked])).toEqual([
      ['A', false],
      ['B', true],
    ]);
  });

  it('says so when the only store it opens is blocked for its subscription', async () => {
    const { service, sessions } = build([account('A', 'Alpha', unpaid('A', 'Alpha'))]);
    await expect(service.login(login())).rejects.toThrow(
      new ForbiddenException('auth.errors.subscription_blocked'),
    );
    expect(sessions).toEqual([]);
  });

  // The grace the super admin set is the one applied, not the default.
  it('judges by the rules the super admin saved', async () => {
    const { service } = build([account('A', 'Alpha', unpaid('A', 'Alpha'))], null, [], {
      ...DEFAULT_SUBSCRIPTION_RULES,
      graceDays: 60,
    });
    await expect(service.login(login())).resolves.toMatchObject({ user: { storeId: 'A' } });
  });

  it('says the account is deactivated when that is the only thing wrong', async () => {
    const { service } = build([account('A', 'Alpha', { active: false })]);
    await expect(service.login(login())).rejects.toThrow('Account is deactivated');
  });
});

describe('logins that are unchanged', () => {
  it('a login that names its store — every POS terminal — gets no store list', async () => {
    const { service, usersService } = build([account('A', 'Alpha'), account('B', 'Bravo')]);
    const res = await service.login(login({ storeId: 'A', client: 'pos' }));
    expect(res.user.storeId).toBe('A');
    expect(claims(res.token).storeIds).toBeUndefined();
    expect(res.stores).toBeUndefined();
    expect(usersService.findStoreAccountsByPhone).not.toHaveBeenCalled();
  });

  it('a super admin signs in as before', async () => {
    const superAdmin = { ...account('X', 'X'), storeId: null, role: 'SUPER_ADMIN', store: null };
    const { service, usersService } = build([], superAdmin);
    const res = await service.login(login());
    expect(claims(res.token)).toMatchObject({ storeId: null, role: 'SUPER_ADMIN' });
    expect(claims(res.token).storeIds).toBeUndefined();
    expect(usersService.findStoreAccountsByPhone).not.toHaveBeenCalled();
  });
});

describe('switching store', () => {
  const current = { phone: PHONE, sessionId: 'old-session', storeIds: ['A', 'B'] };

  it("opens that store's account in a new session, and ends the old one", async () => {
    const { service, revoked, sessions } = build([account('A', 'Alpha'), account('B', 'Bravo')]);
    const res = await service.switchStore(current, 'B');
    expect(res.user.storeId).toBe('B');
    expect(sessions[0].userId).toBe('u-B');
    expect(revoked).toEqual(['old-session']);
    // Still able to switch back.
    expect(claims(res.token).storeIds).toEqual(['A', 'B']);
  });

  it('refuses a store the sign-in does not list', async () => {
    const { service, sessions } = build([account('A', 'Alpha'), account('C', 'Charlie')]);
    await expect(service.switchStore(current, 'C')).rejects.toThrow(
      new ForbiddenException('auth.errors.store_not_allowed'),
    );
    expect(sessions).toEqual([]);
  });

  it('refuses when the account there has been deactivated since', async () => {
    const { service } = build([account('A', 'Alpha'), account('B', 'Bravo', { active: false })]);
    await expect(service.switchStore(current, 'B')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses an offline-only store, which is managed on its terminal', async () => {
    const { service } = build([
      account('A', 'Alpha'),
      account('B', 'Bravo', { store: { id: 'B', name: 'Bravo', active: true, mode: 'OFFLINE_ONLY' } }),
    ]);
    await expect(service.switchStore(current, 'B')).rejects.toThrow(
      new ForbiddenException('auth.errors.store_offline_only'),
    );
  });

  it('refuses a store blocked for its subscription', async () => {
    const { service, sessions } = build([account('A', 'Alpha'), account('B', 'Bravo', unpaid('B', 'Bravo'))]);
    await expect(service.switchStore(current, 'B')).rejects.toThrow(
      new ForbiddenException('auth.errors.subscription_blocked'),
    );
    expect(sessions).toEqual([]);
  });

  it('opens a store created after sign-in whose account carries this password', async () => {
    const { service } = build([account('A', 'Alpha'), account('B', 'Bravo')]);
    const res = await service.switchStore(
      { phone: PHONE, storeId: 'A', sessionId: 'old-session', storeIds: ['A'], password: HASH },
      'B',
    );
    expect(res.user.storeId).toBe('B');
    expect(claims(res.token).storeIds).toEqual(['A', 'B']);
  });
});

describe('listing stores', () => {
  it('a token without a list lists its own store', async () => {
    const { service } = build([account('A', 'Alpha'), account('B', 'Bravo')]);
    expect(await service.listStores({ phone: PHONE, storeId: 'A', storeIds: [] })).toEqual([
      { id: 'A', name: 'Alpha', role: 'ADMIN', online: false, offlineOnly: false, subscriptionBlocked: false },
    ]);
  });

  // A store created for this owner after they signed in: its account got a copy of their password
  // hash, so it shows up without signing in again. One set up with another password does not.
  it('lists a store created after sign-in whose account carries this password, and no other', async () => {
    const { service } = build([
      account('A', 'Alpha'),
      account('B', 'Bravo'),
      account('C', 'Charlie', { password: OTHER_HASH }),
    ]);
    const stores = await service.listStores({ phone: PHONE, storeId: 'A', storeIds: ['A'], password: HASH });
    expect(stores.map((s) => s.id)).toEqual(['A', 'B']);
  });

  // The switcher's dot: green while a terminal of the store reports in, red when none has lately.
  it('marks a store open while one of its terminals has reported in lately', async () => {
    const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);
    const { service } = build([account('A', 'Alpha'), account('B', 'Bravo'), account('C', 'Charlie')], null, [
      { storeId: 'A', updatedAt: minutesAgo(3) },
      { storeId: 'B', updatedAt: minutesAgo(45) },
    ]);
    const stores = await service.listStores({ phone: PHONE, storeId: 'A', storeIds: ['A', 'B', 'C'] });
    expect(stores.map((s) => [s.id, s.online])).toEqual([
      ['A', true],
      ['B', false],
      ['C', false],
    ]);
  });
});
