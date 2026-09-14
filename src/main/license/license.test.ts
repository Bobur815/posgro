import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { generateKeyPairSync } from 'crypto';

/**
 * A till's license and the clock it is judged by, against a real SQLite database.
 *
 * The clock is driven by hand — the system clock (`wall`) and the monotonic one (`mono`) apart —
 * because what matters is what happens when they disagree: the shop sets the date back, or it
 * stands still while the app runs. A "restart" forgets everything held in memory and reads the
 * database and the encrypted file again.
 */

const dataDir = mkdtempSync(join(tmpdir(), 'posgro-license-'));
jest.setTimeout(30_000);

jest.mock('electron', () => ({
  app: {
    getPath: () => dataDir,
    getAppPath: () => join(__dirname, '..', '..', '..'),
  },
  // A reversible stand-in for DPAPI: what matters is that the file is not the plain value.
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from([...s].reverse().join(''), 'utf8'),
    decryptString: (b: Buffer) => [...b.toString('utf8')].reverse().join(''),
  },
  BrowserWindow: { getAllWindows: () => [] },
}));

import { closeDatabase, getPrismaClient, initializeDatabase } from '../database/sqlite-client';
import * as clock from './trusted-clock';
import {
  __forgetLicense,
  __useLicensePublicKey,
  acceptLicense,
  assertCanSignIn,
  licenseStatus,
  sellingRefusal,
  UNLICENSED_ALLOWANCE_MS,
} from './license';
import { licensePayload, privateKeyFrom, signLicense } from '../../shared/utils/license';
import { DAY_MS, DEFAULT_SUBSCRIPTION_RULES, subscriptionStatus } from '../../shared/utils/subscription';
import { commitSale, SaleRefusedError } from '../sales/commit-sale';
import { openShift } from '../sales/shifts';

function keyPair() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    priv: privateKeyFrom(privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64')),
    pub64: publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
  };
}

const SERVER = keyPair();
const STORE = '1000';
const T0 = Date.parse('2026-09-20T12:00:00.000Z');
const CLOCK_FILE = join(dataDir, 'license-clock.bin');

let wall = T0;
let mono = 0;
/** Time passing: both clocks move. */
const pass = (ms: number) => {
  wall += ms;
  mono += ms;
};

/** A license the server would sign at `issuedAt` for a plan expiring `expiresInDays` after it. */
function license(
  plan: string | null,
  expiresInDays: number | null,
  { issuedAt = wall, storeId = STORE, signer = SERVER.priv } = {},
) {
  const facts = {
    plan,
    expiresAt: expiresInDays === null ? null : new Date(issuedAt + expiresInDays * DAY_MS),
  };
  const status = subscriptionStatus(facts, DEFAULT_SUBSCRIPTION_RULES, issuedAt);
  return signLicense(licensePayload(storeId, status, issuedAt, 14), signer);
}

/** Everything held in memory forgotten, as when the app starts again. */
function restart() {
  clock.__forgetClock();
  __forgetLicense();
}

beforeAll(async () => {
  await initializeDatabase();
  await getPrismaClient().localConfig.upsert({
    where: { id: 'config' },
    update: { storeId: STORE },
    create: { id: 'config', storeId: STORE, storeName: 'Shop', terminalId: 'T1', apiUrl: 'http://127.0.0.1:9' },
  });
  __useLicensePublicKey(SERVER.pub64);
  clock.__setClockSeams({ now: () => wall, monotonic: () => mono });
  // No server in these tests: every renewal attempt finds it unreachable.
  global.fetch = jest.fn(async () => {
    throw new Error('offline');
  }) as never;
});

beforeEach(async () => {
  wall = T0;
  mono = 0;
  await getPrismaClient().systemSetting.deleteMany({
    where: { key: { in: ['store_license', 'license_clock'] } },
  });
  await getPrismaClient().smena.deleteMany({});
  if (existsSync(CLOCK_FILE)) unlinkSync(CLOCK_FILE);
  restart();
});

afterAll(async () => {
  await closeDatabase();
  rmSync(dataDir, { recursive: true, force: true });
});

describe('taking a license', () => {
  it('keeps a genuine license for this store, across a restart', async () => {
    expect(await acceptLicense(license('PRO', 10))).toBe(true);
    restart();
    expect(await licenseStatus()).toMatchObject({ state: 'active', plan: 'PRO', canSignIn: true, canSell: true });
  });

  it("refuses a forged one, another store's, and anything but a license", async () => {
    expect(await acceptLicense(license('VIP', null, { signer: keyPair().priv }))).toBe(false);
    expect(await acceptLicense(license('VIP', null, { storeId: '2000' }))).toBe(false);
    expect(await acceptLicense('not a license')).toBe(false);
    expect(await acceptLicense(undefined)).toBe(false);
    expect((await licenseStatus()).state).toBe('unlicensed');
  });

  // A license from a month the store was paid up cannot be played back to undo a block.
  it('never goes back to an older license', async () => {
    const paidUp = license('PRO', 30, { issuedAt: T0 - 20 * DAY_MS });
    await acceptLicense(license('PRO', -30));
    expect(await acceptLicense(paidUp)).toBe(false);
    expect((await licenseStatus()).state).toBe('blocked');
  });
});

describe('the trusted clock', () => {
  it('does not give an expired store its time back when the date is set back', async () => {
    await acceptLicense(license('PRO', 1));
    pass(5 * DAY_MS); // expiry and the three days of grace are behind it
    expect((await licenseStatus()).state).toBe('blocked');

    wall = T0; // the shop sets the date back
    expect(await licenseStatus()).toMatchObject({ state: 'blocked', clockBehind: true });

    restart(); // and restarts the till
    expect(await licenseStatus()).toMatchObject({ state: 'blocked', clockBehind: true });
  });

  it('keeps counting while the app runs, even with the system clock stopped', async () => {
    await acceptLicense(license('PRO', 1));
    mono += 2 * DAY_MS; // the wall clock stays at T0
    expect((await licenseStatus()).state).toBe('grace');
    mono += 3 * DAY_MS;
    expect((await licenseStatus()).state).toBe('blocked');
  });

  it('remembers through the encrypted file when the database row is deleted', async () => {
    pass(10 * DAY_MS);
    await licenseStatus(); // written down at T0 + 10 days
    expect(readFileSync(CLOCK_FILE, 'utf8')).not.toContain('mark');

    await getPrismaClient().systemSetting.deleteMany({ where: { key: 'license_clock' } });
    wall = T0;
    restart();
    expect(await clock.trustedNow()).toBeGreaterThanOrEqual(T0 + 10 * DAY_MS);
  });

  it('falls back on its own records when both copies are gone', async () => {
    await getPrismaClient().smena.create({
      data: {
        terminalId: 'T1',
        cashierId: 'u1',
        cashierName: 'Кассир',
        status: 'CLOSED',
        initialCash: 0,
        zReportNumber: 1,
        openedAt: new Date(T0 + 30 * DAY_MS),
        synced: true,
      },
    });
    restart();
    expect(await clock.trustedNow()).toBeGreaterThanOrEqual(T0 + 30 * DAY_MS);
  });

  // The only way down: a newer license carries the server's own time.
  it('is put right by a newer license after running ahead by accident', async () => {
    await acceptLicense(license('PRO', 30));
    pass(400 * DAY_MS); // the clock jumps a year ahead...
    await licenseStatus();
    wall = T0 + DAY_MS; // ...and is fixed
    expect((await licenseStatus()).clockBehind).toBe(true);

    expect(await acceptLicense(license('PRO', 30, { issuedAt: wall }))).toBe(true);
    expect(await licenseStatus()).toMatchObject({ clockBehind: false, canSell: true });
  });
});

describe('what a till may do', () => {
  it('works for two weeks with no license, then has to check in', async () => {
    expect(await licenseStatus()).toMatchObject({ state: 'unlicensed', canSell: true, daysLeft: 14 });
    pass(UNLICENSED_ALLOWANCE_MS);
    expect(await licenseStatus()).toMatchObject({ state: 'checkin-required', canSignIn: false });
    expect(await sellingRefusal()).toEqual({ code: 'LICENSE_CHECKIN_REQUIRED' });
    await expect(assertCanSignIn()).rejects.toThrow('auth.errors.license_checkin_required');
  });

  it('has to check in after its deadline even with a perpetual license', async () => {
    await acceptLicense(license('VIP', null));
    pass(13 * DAY_MS);
    expect((await licenseStatus()).state).toBe('unlimited');
    pass(DAY_MS);
    expect((await licenseStatus()).state).toBe('checkin-required');
  });

  it('lets nobody in, and sells nothing, once the store is blocked', async () => {
    await acceptLicense(license('PRO', -30));
    await expect(assertCanSignIn()).rejects.toThrow('auth.errors.subscription_blocked');

    const sale = commitSale(
      { items: [], paymentMethod: 'CASH' },
      { terminalId: 'T1', cashierId: 'u1', cashierName: 'Кассир' },
    );
    await expect(sale).rejects.toBeInstanceOf(SaleRefusedError);
    await expect(sale).rejects.toMatchObject({ refusal: { code: 'SUBSCRIPTION_BLOCKED' } });

    await expect(openShift('T1', { id: 'u1', nameRu: 'Кассир' }, 0)).rejects.toMatchObject({
      refusal: { code: 'SUBSCRIPTION_BLOCKED' },
    });
    expect(await getPrismaClient().smena.count()).toBe(0);
  });

  it('keeps working through the grace days', async () => {
    await acceptLicense(license('PRO', -1));
    await expect(assertCanSignIn()).resolves.toBeUndefined();
    expect(await sellingRefusal()).toBeNull();
  });

  // Receipts would carry the wrong date — but signing in stays open, to see why.
  it('stops selling, not signing in, while the clock is set back', async () => {
    await acceptLicense(license('PRO', 30));
    pass(5 * DAY_MS);
    await licenseStatus();
    wall = T0;
    await expect(assertCanSignIn()).resolves.toBeUndefined();
    expect(await sellingRefusal()).toEqual({ code: 'CLOCK_BEHIND' });
  });
});
