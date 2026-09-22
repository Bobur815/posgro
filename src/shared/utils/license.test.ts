import { generateKeyPairSync } from 'crypto';
import {
  holdsSeat,
  licensePayload,
  licenseState,
  privateKeyFrom,
  publicKeyFrom,
  readLicense,
  signLicense,
  type LicensePayload,
} from './license';
import { DAY_MS, DEFAULT_SUBSCRIPTION_RULES, subscriptionStatus } from './subscription';

function keyPair() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    priv: privateKeyFrom(privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64')),
    pub: publicKeyFrom(publicKey.export({ format: 'der', type: 'spki' }).toString('base64')),
  };
}

const NOW = Date.parse('2026-09-20T12:00:00.000Z');
const days = (n: number) => NOW + n * DAY_MS;
const rules = DEFAULT_SUBSCRIPTION_RULES;
const pro = (expiresInDays: number) =>
  licensePayload('1000', subscriptionStatus({ plan: 'PRO', expiresAt: new Date(days(expiresInDays)) }, rules, NOW), NOW, 14);

describe('signing and reading a license', () => {
  const { priv, pub } = keyPair();

  it('reads back exactly what was signed', () => {
    const payload = pro(10);
    expect(readLicense(signLicense(payload, priv), pub)).toEqual(payload);
  });

  // The point of it: a till cannot give itself a later date.
  it('rejects a license whose payload was edited', () => {
    const token = signLicense(pro(-30), priv);
    const [, sig] = token.split('.');
    const forged = { ...pro(-30), expiresAt: '2099-01-01T00:00:00.000Z', blockAt: '2099-01-04T00:00:00.000Z' };
    expect(readLicense(`${Buffer.from(JSON.stringify(forged)).toString('base64url')}.${sig}`, pub)).toBeNull();
  });

  it('rejects one signed with another key', () => {
    const other = keyPair();
    expect(readLicense(signLicense(pro(10), other.priv), pub)).toBeNull();
  });

  it.each([[undefined], [''], ['abc'], ['a.b'], ['a.b.c'], [42]])('rejects %p', (token) => {
    expect(readLicense(token, pub)).toBeNull();
  });

  it('rejects a signed payload of the wrong shape or version', () => {
    expect(readLicense(signLicense({ ...pro(10), v: 2 } as unknown as LicensePayload, priv), pub)).toBeNull();
    expect(readLicense(signLicense({ ...pro(10), storeId: '' }, priv), pub)).toBeNull();
    expect(readLicense(signLicense({ ...pro(10), checkinBy: 'soon' }, priv), pub)).toBeNull();
  });
});

describe('licensePayload', () => {
  it('carries the subscription dates and the check-in deadline', () => {
    expect(pro(10)).toEqual({
      v: 1,
      storeId: '1000',
      plan: 'PRO',
      expiresAt: new Date(days(10)).toISOString(),
      warnFrom: new Date(days(7)).toISOString(),
      blockAt: new Date(days(13)).toISOString(),
      issuedAt: new Date(NOW).toISOString(),
      checkinBy: new Date(days(14)).toISOString(),
    });
  });

  it('leaves the dates empty when nothing counts down', () => {
    const vip = licensePayload('1', subscriptionStatus({ plan: 'VIP', expiresAt: null }, rules, NOW), NOW, 14);
    expect(vip).toMatchObject({ expiresAt: null, warnFrom: null, blockAt: null });
  });

  it('blocks a new store with no plan from the moment it is signed', () => {
    const none = licensePayload('1', subscriptionStatus({ plan: null, expiresAt: null, required: true }, rules, NOW), NOW, 14);
    expect(none.blockAt).toBe(new Date(NOW).toISOString());
    expect(licenseState(none, NOW).state).toBe('blocked');
  });
});

describe('licenseState', () => {
  // Signed now; judged later by the till's clock.
  it('moves through the same states as the subscription', () => {
    const license = pro(10);
    expect(licenseState(license, NOW)).toEqual({ state: 'active', daysLeft: 10 });
    expect(licenseState(license, days(8))).toEqual({ state: 'warning', daysLeft: 2 });
    expect(licenseState(license, days(11))).toEqual({ state: 'grace', daysLeft: 2 });
    expect(licenseState(license, days(13))).toEqual({ state: 'blocked', daysLeft: 0 });
  });

  it('asks for a check-in once checkinBy has passed', () => {
    const vip = licensePayload('1', subscriptionStatus({ plan: 'VIP', expiresAt: null }, rules, NOW), NOW, 14);
    expect(licenseState(vip, days(13)).state).toBe('unlimited');
    expect(licenseState(vip, days(14)).state).toBe('checkin-required');
  });

  it('says blocked rather than check-in when both apply', () => {
    expect(licenseState(pro(1), days(20)).state).toBe('blocked');
  });

  it('agrees with subscriptionStatus at every point it signed', () => {
    const facts = { plan: 'STARTER', expiresAt: new Date(days(5)) };
    const license = licensePayload('1', subscriptionStatus(facts, rules, NOW), NOW, 60);
    for (let d = 0; d <= 10; d += 0.5) {
      expect(licenseState(license, days(d)).state).toBe(subscriptionStatus(facts, rules, days(d)).state);
    }
  });
});

describe('terminal slots in a license', () => {
  const { priv, pub } = keyPair();
  const seated = licensePayload('1000', subscriptionStatus({ plan: 'STARTER', expiresAt: new Date(days(30)) }, rules, NOW), NOW, 14, {
    terminals: 1,
    seats: ['T1'],
  });

  it('carries the allowance and the seats, signed', () => {
    expect(readLicense(signLicense(seated, priv), pub)).toMatchObject({ terminals: 1, seats: ['T1'] });
  });

  it('seats only the terminals it names', () => {
    expect(holdsSeat(seated, 'T1')).toBe(true);
    expect(holdsSeat(seated, 'T2')).toBe(false);
  });

  // A license from a server before terminal limits, or for an unlimited plan.
  it('seats every terminal when it names none', () => {
    const unlimited = pro(10);
    expect(unlimited).not.toHaveProperty('seats');
    expect(readLicense(signLicense(unlimited, priv), pub)).not.toBeNull();
    expect(holdsSeat(unlimited, 'T7')).toBe(true);
  });

  it('stays version 1, so a till from before still reads it', () => {
    expect(seated.v).toBe(1);
  });

  it('rejects seats that are not a list of ids', () => {
    for (const bad of [{ seats: 'T1' }, { seats: [1] }, { terminals: -1 }, { terminals: '2' }]) {
      const token = signLicense({ ...seated, ...bad } as never, priv);
      expect(readLicense(token, pub)).toBeNull();
    }
  });
});
