import {
  __setPairingClock,
  cancelPairingCode,
  generateDeviceSecret,
  getPairingCode,
  isPairingOpen,
  issuePairingCode,
  redeemPairingCode,
} from './pairing';

/**
 * A pairing code is briefly the only thing between the shop's data and anyone on its wifi, so the
 * properties that make it safe — single use, short life, no reuse after cancel — are asserted
 * rather than assumed.
 */

let now = 1_000_000;
beforeEach(() => {
  now = 1_000_000;
  __setPairingClock(() => now);
  cancelPairingCode();
});

afterAll(() => __setPairingClock(Date.now));

describe('issuePairingCode', () => {
  it('is six digits, so it can be read off a screen', () => {
    expect(issuePairingCode().code).toMatch(/^\d{6}$/);
  });

  it('replaces any previous code, so only one is ever live', () => {
    const first = issuePairingCode();
    const second = issuePairingCode();

    expect(redeemPairingCode(first.code)).toBe(false);
    expect(redeemPairingCode(second.code)).toBe(true);
  });
});

describe('redeemPairingCode', () => {
  it('accepts the right code once and never again', () => {
    const { code } = issuePairingCode();

    expect(redeemPairingCode(code)).toBe(true);
    // The second attempt is the one that matters: a code glimpsed over a shoulder is worthless
    // once the intended till has used it.
    expect(redeemPairingCode(code)).toBe(false);
  });

  it('rejects a wrong code without consuming the right one', () => {
    const { code } = issuePairingCode();

    expect(redeemPairingCode('000000' === code ? '111111' : '000000')).toBe(false);
    expect(redeemPairingCode(code)).toBe(true);
  });

  it('tolerates the spaces a person types', () => {
    const { code } = issuePairingCode();
    expect(redeemPairingCode(`  ${code} `)).toBe(true);
  });

  it('rejects a code that has expired', () => {
    const { code } = issuePairingCode();
    now += 10 * 60 * 1000 + 1;

    expect(redeemPairingCode(code)).toBe(false);
  });

  it('rejects everything when no code was issued', () => {
    expect(redeemPairingCode('123456')).toBe(false);
  });
});

describe('isPairingOpen', () => {
  // This is what lets the very first satellite reach the server at all: the LAN listener runs when
  // a satellite is paired, and a satellite has to reach the listener to become paired.
  it('is open only while a code is live', () => {
    expect(isPairingOpen()).toBe(false);

    issuePairingCode();
    expect(isPairingOpen()).toBe(true);

    now += 10 * 60 * 1000 + 1;
    expect(isPairingOpen()).toBe(false);
  });

  it('closes as soon as the code is redeemed', () => {
    const { code } = issuePairingCode();
    redeemPairingCode(code);
    expect(isPairingOpen()).toBe(false);
  });

  it('closes when cancelled', () => {
    issuePairingCode();
    cancelPairingCode();
    expect(isPairingOpen()).toBe(false);
    expect(getPairingCode()).toBeNull();
  });
});

describe('generateDeviceSecret', () => {
  it('is long and does not repeat', () => {
    const secrets = new Set(Array.from({ length: 50 }, generateDeviceSecret));
    expect(secrets.size).toBe(50);
    expect([...secrets][0]).toMatch(/^[0-9a-f]{64}$/);
  });
});
