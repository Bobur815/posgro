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
  DEFAULT_PLAN_TERMINALS,
  DEFAULT_SUBSCRIPTION_RULES,
  subscriptionStatus,
} from '../../../shared/utils/subscription';
import { terminalClaim } from './licenses.service';

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
  extraTerminals?: number;
};

type TerminalRow = { storeId: string; terminalId: string; firstSeenAt: Date; lastSeenAt: Date };

/** store_terminals in memory: the calls LicensesService makes, with Prisma's semantics. */
function terminalTable(rows: TerminalRow[] = []) {
  return {
    rows,
    createMany: jest.fn(async ({ data }: { data: TerminalRow[] }) => {
      for (const r of data) {
        if (!rows.some((x) => x.storeId === r.storeId && x.terminalId === r.terminalId)) rows.push({ ...r });
      }
    }),
    updateMany: jest.fn(
      async ({
        where,
        data,
      }: {
        where: { storeId: string; terminalId: { in: string[] } };
        data: { lastSeenAt: Date };
      }) => {
        for (const r of rows) {
          if (r.storeId === where.storeId && where.terminalId.in.includes(r.terminalId)) {
            r.lastSeenAt = data.lastSeenAt;
          }
        }
      },
    ),
    findMany: jest.fn(async ({ where, take }: { where: { storeId: string }; take?: number }) =>
      rows
        .filter((r) => r.storeId === where.storeId)
        .sort(
          (a, b) =>
            a.firstSeenAt.getTime() - b.firstSeenAt.getTime() || a.terminalId.localeCompare(b.terminalId),
        )
        .slice(0, take ?? Infinity),
    ),
  };
}

/** The service as it starts with LICENSE_SIGNING_KEY set to `key` (null: not set). */
function build(
  stores: Record<string, Row>,
  key: string | null = SERVER.privateB64,
  storeTerminal = terminalTable(),
) {
  const saved = process.env.LICENSE_SIGNING_KEY;
  if (key === null) delete process.env.LICENSE_SIGNING_KEY;
  else process.env.LICENSE_SIGNING_KEY = key;
  const prisma = {
    store: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
        stores[where.id] ? { extraTerminals: 0, ...stores[where.id] } : null,
      ),
    },
    storeTerminal,
  };
  const siteConfig = {
    getSubscriptionRules: jest.fn(async () => DEFAULT_SUBSCRIPTION_RULES),
    getPlanTerminals: jest.fn(async () => DEFAULT_PLAN_TERMINALS),
  };
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
describe('terminal slots', () => {
  const STARTER: Row = { subscriptionPlan: 'STARTER', subscriptionExpiresAt: ago(-30) };
  const PRO: Row = { subscriptionPlan: 'PRO', subscriptionExpiresAt: ago(-30) };
  const seen = (terminalId: string, daysAgo: number): TerminalRow => ({
    storeId: '1000',
    terminalId,
    firstSeenAt: ago(daysAgo),
    lastSeenAt: ago(daysAgo),
  });
  const read = (token: string | null) => readLicense(token, SERVER.pub)!;
  const issue = (row: Row, table: ReturnType<typeof terminalTable>, terminalId?: string, satellites?: string[]) =>
    build({ '1000': row }, undefined, table)
      .issue('1000', terminalId ? { terminalId, satellites } : null)
      .then(read);

  it('gives the first till on STARTER its one slot', async () => {
    const table = terminalTable();
    expect(await issue(STARTER, table, 'T1')).toMatchObject({ terminals: 1, seats: ['T1'] });
    expect(table.rows.map((r) => r.terminalId)).toEqual(['T1']);
  });

  // Recorded all the same, so it takes the next slot that frees up.
  it('records a second till on STARTER but gives it no slot', async () => {
    const table = terminalTable([seen('T1', 10)]);
    expect(await issue(STARTER, table, 'T2')).toMatchObject({ terminals: 1, seats: ['T1'] });
    expect(table.rows.map((r) => r.terminalId)).toEqual(['T1', 'T2']);
  });

  it('seats it once an extra terminal is bought', async () => {
    const table = terminalTable([seen('T1', 10), seen('T2', 5)]);
    expect(await issue({ ...STARTER, extraTerminals: 1 }, table, 'T2')).toMatchObject({
      terminals: 2,
      seats: ['T1', 'T2'],
    });
  });

  it('seats the waiting till once a slot is freed', async () => {
    const table = terminalTable([seen('T2', 5)]); // T1 freed by the super admin
    expect((await issue(STARTER, table, 'T2')).seats).toEqual(['T2']);
  });

  // A PC reinstalled under its old id must not lose its place.
  it('keeps an existing till in its place when it asks again', async () => {
    const table = terminalTable([seen('T1', 10), seen('T2', 5)]);
    const first = table.rows[0].firstSeenAt;
    await issue(STARTER, table, 'T1');
    expect(table.rows.find((r) => r.terminalId === 'T1')!.firstSeenAt).toBe(first);
    expect(table.rows.find((r) => r.terminalId === 'T1')!.lastSeenAt.getTime()).toBeGreaterThan(ago(1).getTime());
  });

  it('after a downgrade, keeps the earliest tills and refuses the newest', async () => {
    const table = terminalTable([seen('T3', 1), seen('T1', 30), seen('T2', 20)]);
    expect((await issue(STARTER, table, 'T3')).seats).toEqual(['T1']);
  });

  it('ranks a main ahead of the satellites it names in the same request', async () => {
    const table = terminalTable();
    expect(await issue(PRO, table, 'T9', ['T1', 'T2', 'T3'])).toMatchObject({
      terminals: 3,
      seats: ['T9', 'T1', 'T2'],
    });
  });

  it('puts no limit in the license of an unlimited plan, and still records the till', async () => {
    const table = terminalTable();
    const license = await issue({ subscriptionPlan: 'VIP', subscriptionExpiresAt: null }, table, 'T1');
    expect(license.terminals).toBeUndefined();
    expect(license.seats).toBeUndefined();
    expect(table.rows).toHaveLength(1);
  });

  // A till from before terminal limits names nothing: nothing is written for it.
  it('records nothing for a request that names no till', async () => {
    const table = terminalTable([seen('T1', 10)]);
    expect((await issue(STARTER, table)).seats).toEqual(['T1']);
    expect(table.createMany).not.toHaveBeenCalled();
  });

  it('renews with the claim, too', async () => {
    const table = terminalTable();
    const old = signLicense(
      licensePayload('1000', subscriptionStatus({ plan: null, expiresAt: null }), Date.now() - DAY_MS, 14),
      privateKeyFrom(SERVER.privateB64),
    );
    const fresh = read(await build({ '1000': STARTER }, undefined, table).renew(old, { terminalId: 'T1' }));
    expect(fresh.seats).toEqual(['T1']);
  });
});

describe('terminalClaim', () => {
  it('reads a query string of comma-separated satellites', () => {
    expect(terminalClaim('T1', 'T2, T3,,')).toEqual({ terminalId: 'T1', satellites: ['T2', 'T3'] });
  });

  it('is null when no till is named', () => {
    expect(terminalClaim(undefined, ['T2'])).toBeNull();
    expect(terminalClaim('  ', undefined)).toBeNull();
  });

  it('bounds what one request can register', () => {
    const many = Array.from({ length: 100 }, (_, i) => `S${i}`);
    expect(terminalClaim('T1', many)!.satellites).toHaveLength(32);
    expect(terminalClaim('x'.repeat(200), undefined)!.terminalId).toHaveLength(64);
  });
});

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
