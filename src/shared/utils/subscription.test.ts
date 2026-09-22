import {
  DAY_MS,
  DEFAULT_PLAN_TERMINALS,
  addMonth,
  monthlyFee,
  renewedExpiry,
  DEFAULT_SUBSCRIPTION_RULES,
  normalizePlanTerminals,
  normalizeSubscriptionRules,
  terminalAllowance,
  subscriptionStatus,
  type SubscriptionFacts,
} from './subscription';

const NOW = Date.parse('2026-09-20T12:00:00.000Z');
const days = (n: number) => new Date(NOW + n * DAY_MS);
const rules = DEFAULT_SUBSCRIPTION_RULES; // warn 3, grace 3
const plan = (expiresAt: SubscriptionFacts['expiresAt'], extra: Partial<SubscriptionFacts> = {}) => ({
  plan: 'PRO',
  expiresAt,
  ...extra,
});

describe('subscriptionStatus', () => {
  it('is active until the warning window opens, counting days to the expiry date', () => {
    const s = subscriptionStatus(plan(days(10)), rules, NOW);
    expect(s).toMatchObject({ state: 'active', daysLeft: 10 });
    expect(s.warnFrom).toBe(days(7).toISOString());
    expect(s.blockAt).toBe(days(13).toISOString());
  });

  it('warns from warnDays before the expiry date, to the moment it expires', () => {
    expect(subscriptionStatus(plan(days(3)), rules, NOW)).toMatchObject({ state: 'warning', daysLeft: 3 });
    expect(subscriptionStatus(plan(new Date(NOW + 1)), rules, NOW)).toMatchObject({
      state: 'warning',
      daysLeft: 1,
    });
    // One millisecond before the window, still active.
    expect(subscriptionStatus(plan(new Date(NOW + 3 * DAY_MS + 1)), rules, NOW).state).toBe('active');
  });

  it('gives graceDays after the expiry date, counting days to the block', () => {
    expect(subscriptionStatus(plan(new Date(NOW)), rules, NOW)).toMatchObject({ state: 'grace', daysLeft: 3 });
    expect(subscriptionStatus(plan(days(-2)), rules, NOW)).toMatchObject({ state: 'grace', daysLeft: 1 });
  });

  it('blocks from expiry + graceDays on', () => {
    expect(subscriptionStatus(plan(days(-3)), rules, NOW)).toMatchObject({ state: 'blocked', daysLeft: 0 });
    expect(subscriptionStatus(plan(days(-40)), rules, NOW).state).toBe('blocked');
    expect(subscriptionStatus(plan(new Date(NOW - 3 * DAY_MS + 1)), rules, NOW).state).toBe('grace');
  });

  // A store already expired the day enforcement shipped gets its grace from that day.
  it('counts grace from graceFrom when that is later than the expiry date', () => {
    const shipped = days(-1);
    const s = subscriptionStatus(plan(days(-40), { graceFrom: shipped }), rules, NOW);
    expect(s).toMatchObject({ state: 'grace', daysLeft: 2 });
    expect(s.blockAt).toBe(days(2).toISOString());
    expect(subscriptionStatus(plan(days(-40), { graceFrom: shipped }), rules, days(2)).state).toBe('blocked');
  });

  it('ignores a graceFrom earlier than the expiry date', () => {
    const s = subscriptionStatus(plan(days(-1), { graceFrom: days(-30) }), rules, NOW);
    expect(s).toMatchObject({ state: 'grace', blockAt: days(2).toISOString() });
  });

  it('follows the rules it is given', () => {
    const strict = { ...rules, warnDays: 0, graceDays: 0 };
    expect(subscriptionStatus(plan(days(1)), strict, NOW).state).toBe('active');
    expect(subscriptionStatus(plan(new Date(NOW)), strict, NOW).state).toBe('blocked');
    const lenient = { ...rules, warnDays: 14, graceDays: 10 };
    expect(subscriptionStatus(plan(days(10)), lenient, NOW).state).toBe('warning');
    expect(subscriptionStatus(plan(days(-9)), lenient, NOW).state).toBe('grace');
  });

  it('never expires VIP, whatever date it carries', () => {
    expect(subscriptionStatus({ plan: 'VIP', expiresAt: days(-100) }, rules, NOW)).toMatchObject({
      state: 'unlimited',
      expiresAt: null,
      daysLeft: null,
    });
  });

  it('leaves a plan saved without a date unlimited', () => {
    expect(subscriptionStatus({ plan: 'STARTER', expiresAt: null }, rules, NOW).state).toBe('unlimited');
    expect(subscriptionStatus({ plan: 'STARTER', expiresAt: '' }, rules, NOW).state).toBe('unlimited');
  });

  // Stores from before enforcement keep working with no plan; new ones are blocked without one.
  it('treats no plan as unlimited for an old store and blocked for a new one', () => {
    expect(subscriptionStatus({ plan: null, expiresAt: null }, rules, NOW).state).toBe('unlimited');
    expect(subscriptionStatus({ plan: '  ', expiresAt: days(5), required: false }, rules, NOW).state).toBe(
      'unlimited',
    );
    expect(subscriptionStatus({ plan: null, expiresAt: null, required: true }, rules, NOW).state).toBe(
      'blocked',
    );
  });

  it('judges a trial like any dated plan', () => {
    expect(subscriptionStatus({ plan: 'TRIAL', expiresAt: days(2), required: true }, rules, NOW).state).toBe(
      'warning',
    );
  });

  it('reads ISO strings and Dates alike', () => {
    expect(subscriptionStatus(plan(days(-1).toISOString()), rules, NOW)).toEqual(
      subscriptionStatus(plan(days(-1)), rules, NOW),
    );
  });

  // A date nobody can read must not mean "forever".
  it('fails closed on an unreadable date', () => {
    expect(subscriptionStatus(plan('not a date'), rules, NOW).state).toBe('blocked');
  });
});

describe('normalizeSubscriptionRules', () => {
  it('fills in the defaults', () => {
    expect(normalizeSubscriptionRules(undefined)).toEqual(DEFAULT_SUBSCRIPTION_RULES);
    expect(normalizeSubscriptionRules({ graceDays: 'x', warnDays: null })).toEqual(DEFAULT_SUBSCRIPTION_RULES);
  });

  it('keeps a trial switched off', () => {
    expect(normalizeSubscriptionRules({ trialEnabled: false }).trialEnabled).toBe(false);
  });

  it('rounds, and holds each number to its bounds', () => {
    expect(
      normalizeSubscriptionRules({ trialDays: 0, warnDays: -5, graceDays: 2.6, offlineCheckinDays: 9999 }),
    ).toEqual({ trialEnabled: true, trialDays: 1, warnDays: 0, graceDays: 3, offlineCheckinDays: 365 });
  });

  it('reads numbers saved as strings', () => {
    expect(normalizeSubscriptionRules({ trialDays: '10' }).trialDays).toBe(10);
  });
});

describe('terminalAllowance', () => {
  it("is the plan's own terminals plus the extra ones bought", () => {
    expect(terminalAllowance('STARTER', 0)).toBe(1);
    expect(terminalAllowance('STARTER', 2)).toBe(3);
    expect(terminalAllowance('PRO', 1)).toBe(4);
    expect(terminalAllowance('TRIAL', null)).toBe(1);
  });

  it('is unlimited for an unlimited plan, extras or not', () => {
    expect(terminalAllowance('VIP', 0)).toBeNull();
    expect(terminalAllowance('VIP', 5)).toBeNull();
  });

  // Whether such a store may work at all is subscriptionStatus's question.
  it('does not limit a store with no plan, or one this build does not know', () => {
    expect(terminalAllowance(null, 3)).toBeNull();
    expect(terminalAllowance('', 0)).toBeNull();
    expect(terminalAllowance('ENTERPRISE', 0)).toBeNull();
  });

  it('reads the limits the super admin set', () => {
    const limits = { ...DEFAULT_PLAN_TERMINALS, STARTER: 2, VIP: 10 };
    expect(terminalAllowance('STARTER', 1, limits)).toBe(3);
    expect(terminalAllowance('VIP', 0, limits)).toBe(10);
  });

  it('never counts negative extras', () => {
    expect(terminalAllowance('STARTER', -4)).toBe(1);
  });
});

describe('normalizePlanTerminals', () => {
  it('fills in defaults for anything missing or unreadable', () => {
    expect(normalizePlanTerminals(null)).toEqual(DEFAULT_PLAN_TERMINALS);
    expect(normalizePlanTerminals({ PRO: 'lots', STARTER: undefined })).toEqual(DEFAULT_PLAN_TERMINALS);
  });

  it('keeps null (and a cleared field) as unlimited', () => {
    expect(normalizePlanTerminals({ PRO: null, STARTER: '' })).toMatchObject({ PRO: null, STARTER: null });
  });

  it('rounds and bounds a number — a plan always includes at least one terminal', () => {
    expect(normalizePlanTerminals({ STARTER: 0, PRO: 2.6, TRIAL: '4', VIP: 5000 })).toEqual({
      TRIAL: 4,
      STARTER: 1,
      PRO: 3,
      VIP: 999,
    });
  });
});

describe('monthlyFee', () => {
  const prices = { starter: 150_000, pro: 300_000, extraTerminal: 50_000 };

  it("is the plan's price plus each extra terminal", () => {
    expect(monthlyFee('STARTER', 0, prices)).toBe(150_000);
    expect(monthlyFee('STARTER', 2, prices)).toBe(250_000);
    expect(monthlyFee('PRO', 1, prices)).toBe(350_000);
  });

  it('bills neither TRIAL, VIP nor a store without a plan', () => {
    expect(monthlyFee('TRIAL', 0, prices)).toBeNull();
    expect(monthlyFee('VIP', 3, prices)).toBeNull();
    expect(monthlyFee(null, 0, prices)).toBeNull();
    expect(monthlyFee('ENTERPRISE', 0, prices)).toBeNull();
  });

  it('never goes below zero, and ignores negative extras', () => {
    expect(monthlyFee('STARTER', -3, prices)).toBe(150_000);
    expect(monthlyFee('STARTER', 0, { ...prices, starter: -1 })).toBe(0);
  });
});

describe('addMonth', () => {
  it('moves one calendar month, keeping the time of day', () => {
    expect(addMonth('2026-09-22T10:30:00.000Z').toISOString()).toBe('2026-10-22T10:30:00.000Z');
    expect(addMonth('2026-12-15T00:00:00.000Z').toISOString()).toBe('2027-01-15T00:00:00.000Z');
  });

  it('holds a day the next month lacks to its last day', () => {
    expect(addMonth('2026-01-31T08:00:00.000Z').toISOString()).toBe('2026-02-28T08:00:00.000Z');
    expect(addMonth('2028-01-31T08:00:00.000Z').toISOString()).toBe('2028-02-29T08:00:00.000Z');
    expect(addMonth('2026-08-31T08:00:00.000Z').toISOString()).toBe('2026-09-30T08:00:00.000Z');
  });
});

describe('renewedExpiry', () => {
  const expired = '2026-09-10T00:00:00.000Z';
  const now = Date.parse('2026-09-20T12:00:00.000Z');

  it('counts from the old expiry when paid in the grace days — the store used them', () => {
    expect(renewedExpiry(expired, 'grace', now).toISOString()).toBe('2026-10-10T00:00:00.000Z');
  });

  it('counts from the payment once the store was blocked', () => {
    expect(renewedExpiry(expired, 'blocked', now).toISOString()).toBe('2026-10-20T12:00:00.000Z');
  });
});
