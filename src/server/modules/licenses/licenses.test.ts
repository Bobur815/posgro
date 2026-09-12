import { generateKeyPairSync } from 'crypto';
import { lastValueFrom, of } from 'rxjs';
import { Reflector } from '@nestjs/core';
import {
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { LicensesService } from './licenses.service';
import { refusesTill, SubscriptionInterceptor } from './subscription.interceptor';
import type { DashboardStore } from '../auth/dashboard-access';
import {
  ALLOW_WHEN_BLOCKED,
  AllowWhenBlocked,
} from '../../common/decorators/allow-when-blocked.decorator';
import { AuthController } from '../auth/auth.controller';
import { StoreConfigController } from '../stores/store-config.controller';
import { TerminalsController } from '../terminals/terminals.controller';
import { LogsController } from '../logs/logs.controller';
import { SalesController } from '../sales/sales.controller';
import {
  licensePayload,
  privateKeyFrom,
  publicKeyFrom,
  readLicense,
  signLicense,
} from '../../../shared/utils/license';
import {
  DAY_MS,
  DEFAULT_SUBSCRIPTION_RULES,
  subscriptionStatus,
} from '../../../shared/utils/subscription';

function keyPair() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    privateB64: privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'),
    pub: publicKeyFrom(publicKey.export({ format: 'der', type: 'spki' }).toString('base64')),
  };
}
const SERVER = keyPair();
const ago = (days: number) => new Date(Date.now() - days * DAY_MS);

type Row = {
  subscriptionPlan: string | null;
  subscriptionExpiresAt: Date | null;
  subscriptionGraceFrom?: Date | null;
  subscriptionRequired?: boolean;
};

/** The service as it starts with LICENSE_SIGNING_KEY set to `key` (null: not set). */
function build(stores: Record<string, Row>, key: string | null = SERVER.privateB64) {
  const saved = process.env.LICENSE_SIGNING_KEY;
  if (key === null) delete process.env.LICENSE_SIGNING_KEY;
  else process.env.LICENSE_SIGNING_KEY = key;
  const prisma = {
    store: { findUnique: jest.fn(async ({ where }: { where: { id: string } }) => stores[where.id] ?? null) },
  };
  const siteConfig = { getSubscriptionRules: jest.fn(async () => DEFAULT_SUBSCRIPTION_RULES) };
  const service = new LicensesService(prisma as never, siteConfig as never);
  if (saved === undefined) delete process.env.LICENSE_SIGNING_KEY;
  else process.env.LICENSE_SIGNING_KEY = saved;
  return service;
}

const PRO_FOR_10_DAYS: Row = { subscriptionPlan: 'PRO', subscriptionExpiresAt: ago(-10) };

describe('LicensesService', () => {
  it("issues a license the public key reads, carrying the store's own plan and dates", async () => {
    const token = await build({ '1000': PRO_FOR_10_DAYS }).issue('1000');
    expect(readLicense(token, SERVER.pub)).toMatchObject({
      storeId: '1000',
      plan: 'PRO',
      expiresAt: PRO_FOR_10_DAYS.subscriptionExpiresAt!.toISOString(),
    });
  });

  // The till whose sign-in token lapsed long ago: its old license is its credential.
  it('renews a license of any age with the store as it stands now', async () => {
    const yearAgo = Date.now() - 365 * DAY_MS;
    const old = signLicense(
      licensePayload('1000', subscriptionStatus({ plan: null, expiresAt: null }, DEFAULT_SUBSCRIPTION_RULES, yearAgo), yearAgo, 14),
      privateKeyFrom(SERVER.privateB64),
    );
    const fresh = readLicense(await build({ '1000': PRO_FOR_10_DAYS }).renew(old), SERVER.pub);
    expect(fresh).toMatchObject({ storeId: '1000', plan: 'PRO' });
    expect(Date.parse(fresh!.issuedAt)).toBeGreaterThan(Date.now() - 60_000);
  });

  it('refuses a license another key signed', async () => {
    const forged = signLicense(
      licensePayload('1000', subscriptionStatus({ plan: 'VIP', expiresAt: null }), Date.now(), 14),
      privateKeyFrom(keyPair().privateB64),
    );
    await expect(build({ '1000': PRO_FOR_10_DAYS }).renew(forged)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refuses a license for a store that no longer exists', async () => {
    const service = build({});
    const old = signLicense(
      licensePayload('gone', subscriptionStatus({ plan: 'VIP', expiresAt: null }), Date.now(), 14),
      privateKeyFrom(SERVER.privateB64),
    );
    await expect(service.renew(old)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('issues nothing without a signing key, and says so on renewal', async () => {
    const service = build({ '1000': PRO_FOR_10_DAYS }, null);
    expect(await service.issue('1000')).toBeNull();
    expect(service.sign('1000', { plan: 'PRO', expiresAt: ago(-5) }, DEFAULT_SUBSCRIPTION_RULES)).toBeNull();
    await expect(service.renew('x.y')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  // A bad key must cost the licenses, not the whole API.
  it('turns licenses off rather than failing to start on a broken key', async () => {
    expect(await build({ '1000': PRO_FOR_10_DAYS }, 'not-a-key').issue('1000')).toBeNull();
  });
});

const STORE: DashboardStore = { active: true, mode: 'ONLINE' };
const blockedStore: DashboardStore = { ...STORE, subscriptionPlan: 'PRO', subscriptionExpiresAt: ago(30) };
const paidStore: DashboardStore = { ...STORE, subscriptionPlan: 'PRO', subscriptionExpiresAt: ago(-30) };
const till = (store: DashboardStore) => ({ role: 'ADMIN', client: 'pos', store });

describe('refusesTill', () => {
  const rules = DEFAULT_SUBSCRIPTION_RULES;
  it('refuses a till of a store past its grace days', () => {
    expect(refusesTill(till(blockedStore), rules)).toBe(true);
  });
  it('serves a till of a paid store, or one still in grace', () => {
    expect(refusesTill(till(paidStore), rules)).toBe(false);
    expect(refusesTill(till({ ...blockedStore, subscriptionExpiresAt: ago(1) }), rules)).toBe(false);
  });
  it('leaves dashboard sessions, super admins and anonymous calls alone', () => {
    expect(refusesTill({ ...till(blockedStore), client: 'dashboard' }, rules)).toBe(false);
    expect(refusesTill({ ...till(blockedStore), role: 'SUPER_ADMIN' }, rules)).toBe(false);
    expect(refusesTill(undefined, rules)).toBe(false);
  });
});

class Probe {
  @AllowWhenBlocked()
  open() {}
  closed() {}
}

function call(user: unknown, handler: 'open' | 'closed') {
  const interceptor = new SubscriptionInterceptor(new Reflector(), {
    getSubscriptionRules: async () => DEFAULT_SUBSCRIPTION_RULES,
  } as never);
  const context = {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => Probe.prototype[handler],
    getClass: () => Probe,
  };
  return interceptor
    .intercept(context as never, { handle: () => of('served') })
    .then((result) => lastValueFrom(result));
}

describe('SubscriptionInterceptor', () => {
  it('refuses a blocked till with a translatable reason', async () => {
    await expect(call(till(blockedStore), 'closed')).rejects.toThrow(
      new ForbiddenException('auth.errors.subscription_blocked'),
    );
  });

  it('lets a blocked till through where the route allows it', async () => {
    await expect(call(till(blockedStore), 'open')).resolves.toBe('served');
  });

  it('serves everyone else', async () => {
    await expect(call(till(paidStore), 'closed')).resolves.toBe('served');
    await expect(call({ ...till(blockedStore), client: 'dashboard' }, 'closed')).resolves.toBe('served');
    await expect(call(undefined, 'closed')).resolves.toBe('served');
  });
});

// A blocked till must still sign in, read its license, report in and send its logs — and nothing
// else. Checked on the real controllers, so a route moved or renamed cannot quietly open or close.
describe('routes open to a blocked till', () => {
  const reflector = new Reflector();
  const open = (target: object) => reflector.get<boolean>(ALLOW_WHEN_BLOCKED, target as never) === true;

  it('signing in, store config and license, heartbeat and log upload', () => {
    expect(open(AuthController)).toBe(true);
    expect(open(StoreConfigController)).toBe(true);
    expect(open(TerminalsController.prototype.heartbeat)).toBe(true);
    expect(open(LogsController.prototype.upload)).toBe(true);
  });

  it('not sync or anything else', () => {
    expect(open(TerminalsController)).toBe(false);
    expect(open(TerminalsController.prototype.getStatus)).toBe(false);
    expect(open(LogsController)).toBe(false);
    expect(open(SalesController)).toBe(false);
  });
});
