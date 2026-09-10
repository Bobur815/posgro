import { AuthService } from './auth.service';

/**
 * The store gate as it is actually wired, not just the rule.
 *
 * `dashboard-access.test.ts` covers the decision. This covers the two places that consult it —
 * `login()` refusing to mint a token, and `validateUser()` cutting off a session that is already
 * running — because a correct rule wired to nothing protects nothing.
 *
 * AuthService is a plain class with constructor injection, so it can be built with fakes instead
 * of standing up a Nest module.
 */

// bcrypt.compare against a real hash is slow and irrelevant here; every password is "right".
jest.mock('bcryptjs', () => ({ compare: jest.fn(async () => true), hash: jest.fn(async () => 'h') }));

type Store = { active: boolean; mode: string } | null;

const ONLINE: Store = { active: true, mode: 'ONLINE' };
const OFFLINE_ONLY: Store = { active: true, mode: 'OFFLINE_ONLY' };
const DEACTIVATED: Store = { active: false, mode: 'ONLINE' };

function build(user: {
  role: string;
  storeId: string | null;
  store: Store;
  active?: boolean;
}) {
  const row = {
    id: 'u1',
    phone: '+998900000001',
    password: 'hashed',
    nameUz: 'A',
    nameRu: 'А',
    active: user.active ?? true,
    createdAt: new Date(),
    role: user.role,
    storeId: user.storeId,
    store: user.store,
  };

  const usersService = { findById: jest.fn(async () => row) };
  const jwtService = { sign: jest.fn(() => 'signed.jwt.token') };
  const prisma = {
    store: { findUnique: jest.fn(async () => user.store) },
    userSession: {
      create: jest.fn(async () => ({ id: 'sess1' })),
      findUnique: jest.fn(async () => ({ id: 'sess1', isRevoked: false })),
      findFirst: jest.fn(async () => null),
    },
  };
  const findByPhoneAndStore = jest.fn(async () => row);

  const service = new AuthService(
    { ...usersService, findByPhoneAndStore } as never,
    jwtService as never,
    prisma as never,
  );
  return { service, prisma, jwtService, row };
}

const creds = { phone: '+998900000001', password: 'secret123', storeId: 's1' };

describe('login()', () => {
  it('issues a token for a live online store', async () => {
    const { service, jwtService } = build({ role: 'ADMIN', storeId: 's1', store: ONLINE });
    await expect(service.login(creds)).resolves.toMatchObject({ token: 'signed.jwt.token' });
    expect(jwtService.sign).toHaveBeenCalled();
  });

  it.each([
    ['a deactivated store', DEACTIVATED, 'auth.errors.store_inactive'],
    ['an OFFLINE_ONLY store', OFFLINE_ONLY, 'auth.errors.store_offline_only'],
  ])('refuses %s with a translatable reason', async (_label, store, expected) => {
    const { service } = build({ role: 'ADMIN', storeId: 's1', store });
    await expect(service.login(creds)).rejects.toThrow(expected);
  });

  // No token means no session either — a refused login must leave nothing behind.
  it('creates no session and signs nothing when it refuses', async () => {
    const { service, prisma, jwtService } = build({
      role: 'ADMIN',
      storeId: 's1',
      store: DEACTIVATED,
    });
    await expect(service.login(creds)).rejects.toThrow();
    expect(prisma.userSession.create).not.toHaveBeenCalled();
    expect(jwtService.sign).not.toHaveBeenCalled();
  });

  it('still lets a SUPER_ADMIN in so they can switch the store back on', async () => {
    const { service } = build({ role: 'SUPER_ADMIN', storeId: null, store: null });
    await expect(service.login(creds)).resolves.toMatchObject({ token: 'signed.jwt.token' });
  });

  // The token has to carry the client, or validateUser() cannot reproduce this decision.
  it('records the calling client in the token payload', async () => {
    const { service, jwtService } = build({ role: 'ADMIN', storeId: 's1', store: OFFLINE_ONLY });
    await service.login({ ...creds, client: 'pos' });
    expect(jwtService.sign).toHaveBeenCalledWith(expect.objectContaining({ client: 'pos' }));
  });

  it('lets a POS sign in to an OFFLINE_ONLY store', async () => {
    const { service } = build({ role: 'ADMIN', storeId: 's1', store: OFFLINE_ONLY });
    await expect(service.login({ ...creds, client: 'pos' })).resolves.toMatchObject({
      token: 'signed.jwt.token',
    });
  });
});

describe('validateUser()', () => {
  const payload = { sub: 'u1', storeId: 's1', phone: '+998900000001', role: 'ADMIN' } as never;

  it('accepts a session belonging to a live online store', async () => {
    const { service } = build({ role: 'ADMIN', storeId: 's1', store: ONLINE });
    await expect(service.validateUser(payload)).resolves.toMatchObject({ id: 'u1' });
  });

  // The whole point of this check: an eight-hour token must not outlive the store's access.
  it.each([
    ['deactivated mid-session', DEACTIVATED],
    ['switched to OFFLINE_ONLY mid-session', OFFLINE_ONLY],
  ])('cuts off a running session when the store is %s', async (_label, store) => {
    const { service } = build({ role: 'ADMIN', storeId: 's1', store });
    await expect(service.validateUser(payload)).resolves.toBeNull();
  });

  /**
   * The OFFLINE_ONLY refusal is a *dashboard* rule. A POS terminal for such a store logs in
   * legitimately (`client: 'pos'`), so re-checking its token as if it came from a browser 401s
   * every request it makes — which is what left the login screen's subscription panel empty.
   */
  it('keeps a POS session alive for an OFFLINE_ONLY store', async () => {
    const { service } = build({ role: 'ADMIN', storeId: 's1', store: OFFLINE_ONLY });
    const posPayload = { ...(payload as object), client: 'pos' } as never;
    await expect(service.validateUser(posPayload)).resolves.toMatchObject({ id: 'u1' });
  });

  // A POS token is not a skeleton key: it only relaxes the OFFLINE_ONLY rule.
  it('still cuts off a POS session when the store is deactivated', async () => {
    const { service } = build({ role: 'ADMIN', storeId: 's1', store: DEACTIVATED });
    const posPayload = { ...(payload as object), client: 'pos' } as never;
    await expect(service.validateUser(posPayload)).resolves.toBeNull();
  });

  // Tokens minted before `client` existed have no such field; they must keep being judged as
  // dashboard sessions rather than silently gaining POS latitude.
  it('treats a token with no client as a dashboard session', async () => {
    const { service } = build({ role: 'ADMIN', storeId: 's1', store: OFFLINE_ONLY });
    await expect(service.validateUser(payload)).resolves.toBeNull();
  });

  it('keeps rejecting a deactivated user, as before', async () => {
    const { service } = build({ role: 'ADMIN', storeId: 's1', store: ONLINE, active: false });
    await expect(service.validateUser(payload)).resolves.toBeNull();
  });

  it('never cuts off a SUPER_ADMIN', async () => {
    const { service } = build({ role: 'SUPER_ADMIN', storeId: null, store: null });
    const superPayload = { ...(payload as object), role: 'SUPER_ADMIN', storeId: null } as never;
    await expect(service.validateUser(superPayload)).resolves.toMatchObject({ id: 'u1' });
  });

  // It must read the user's OWN store, not the token's storeId — a super admin acting on a store
  // carries that store's id in the payload, and must not be locked out by its state.
  it('judges by the user row, not the token payload', async () => {
    const { service } = build({ role: 'SUPER_ADMIN', storeId: null, store: null });
    const actingOnDeadStore = { ...(payload as object), role: 'SUPER_ADMIN', storeId: 'dead' } as never;
    await expect(service.validateUser(actingOnDeadStore)).resolves.not.toBeNull();
  });
});
