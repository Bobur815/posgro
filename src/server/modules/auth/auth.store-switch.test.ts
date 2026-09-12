import * as bcrypt from 'bcryptjs';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

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

function build(accounts: Account[], superAdmin: unknown = null) {
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
    user: {
      findUnique: jest.fn(
        async ({ where }: any) =>
          accounts.find(
            (a) => a.storeId === where.storeId_phone.storeId && a.phone === where.storeId_phone.phone,
          ) ?? null,
      ),
      findMany: jest.fn(async ({ where }: any) =>
        accounts.filter((a) => a.phone === where.phone && where.storeId.in.includes(a.storeId) && a.active),
      ),
    },
  };

  const service = new AuthService(usersService as never, jwtService as never, prisma as never);
  return { service, usersService, sessions, revoked };
}

const claims = (token: string) => JSON.parse(token);
const login = (extra: Record<string, unknown> = {}) => ({ phone: PHONE, password: PASSWORD, ...extra }) as any;

describe('login without a store ID', () => {
  it('signs in to the only store the password opens, and lists it', async () => {
    const { service } = build([account('A', 'Alpha')]);
    const res = await service.login(login());
    expect(res.user.storeId).toBe('A');
    expect(claims(res.token).storeIds).toEqual(['A']);
    expect(res.stores).toEqual([{ id: 'A', name: 'Alpha', role: 'ADMIN' }]);
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

  it('leaves out a store that cannot be managed from the dashboard', async () => {
    const { service } = build([
      account('A', 'Alpha'),
      account('B', 'Bravo', { store: { id: 'B', name: 'Bravo', active: true, mode: 'OFFLINE_ONLY' } }),
    ]);
    const res = await service.login(login({ preferredStoreId: 'B' }));
    expect(res.user.storeId).toBe('A');
    expect(claims(res.token).storeIds).toEqual(['A']);
  });

  it('says why when every store it opens is blocked', async () => {
    const { service } = build([
      account('A', 'Alpha', { store: { id: 'A', name: 'Alpha', active: false, mode: 'ONLINE' } }),
    ]);
    await expect(service.login(login())).rejects.toThrow(new ForbiddenException('auth.errors.store_inactive'));
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
});

describe('listing stores', () => {
  it('a token without a list lists its own store', async () => {
    const { service } = build([account('A', 'Alpha'), account('B', 'Bravo')]);
    expect(await service.listStores({ phone: PHONE, storeId: 'A', storeIds: [] })).toEqual([
      { id: 'A', name: 'Alpha', role: 'ADMIN' },
    ]);
  });
});
