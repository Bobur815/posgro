/**
 * Where a store's subscription stands, judged one way everywhere: by the server (dashboard access,
 * and the license it signs for terminals), by the web dashboard (its warning banner and the super
 * admin's store screen), and by the POS (sign-in and selling).
 *
 * Pure, with "now" passed in, so each side judges by the clock it trusts — the server by its own, a
 * till by one that cannot be wound back.
 *
 *        expiresAt − warnDays        expiresAt          blockAt = expiresAt + graceDays
 *   ──── active ────┼──── warning ────┼──── grace ────┼──── blocked ────
 */

export type SubscriptionState = 'unlimited' | 'active' | 'warning' | 'grace' | 'blocked';

/** Set by the super admin (site config `subscription_rules`). */
export interface SubscriptionRules {
  /** New stores start on a free trial. Off: a new store is blocked until it is given a plan. */
  trialEnabled: boolean;
  trialDays: number;
  /** How many days before the expiry date the warning starts. */
  warnDays: number;
  /** How many days after the expiry date the store keeps working, to pay. */
  graceDays: number;
  /** How often a till must reach the server to renew its license, even one that never syncs. */
  offlineCheckinDays: number;
}

/** Bounds for each rule — the dashboard form, the API and a stored value are all held to them. */
export const SUBSCRIPTION_RULE_LIMITS = {
  trialDays: { min: 1, max: 365 },
  warnDays: { min: 0, max: 60 },
  graceDays: { min: 0, max: 60 },
  offlineCheckinDays: { min: 1, max: 365 },
} as const;

export const DEFAULT_SUBSCRIPTION_RULES: SubscriptionRules = {
  trialEnabled: true,
  trialDays: 7,
  warnDays: 3,
  graceDays: 3,
  offlineCheckinDays: 14,
};

/** The plan a new store starts on while the trial is enabled. */
export const TRIAL_PLAN = 'TRIAL';
/** A plan bought outright: it never expires, whatever date it carries. */
export const PERPETUAL_PLAN = 'VIP';

export const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Rules as saved, made whole: a missing or unreadable value takes its default, and a number is
 * rounded and held to its bounds — a negative grace, say, cannot block every store at once.
 */
export function normalizeSubscriptionRules(
  input: Partial<Record<keyof SubscriptionRules, unknown>> | null | undefined,
): SubscriptionRules {
  const src = input ?? {};
  const days = (key: keyof typeof SUBSCRIPTION_RULE_LIMITS): number => {
    const raw = src[key];
    const value =
      typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() ? Number(raw) : NaN;
    if (!Number.isFinite(value)) return DEFAULT_SUBSCRIPTION_RULES[key];
    const { min, max } = SUBSCRIPTION_RULE_LIMITS[key];
    return Math.min(max, Math.max(min, Math.round(value)));
  };
  return {
    trialEnabled:
      typeof src.trialEnabled === 'boolean'
        ? src.trialEnabled
        : DEFAULT_SUBSCRIPTION_RULES.trialEnabled,
    trialDays: days('trialDays'),
    warnDays: days('warnDays'),
    graceDays: days('graceDays'),
    offlineCheckinDays: days('offlineCheckinDays'),
  };
}

export interface SubscriptionFacts {
  plan: string | null | undefined;
  expiresAt: Date | string | null | undefined;
  /**
   * For a store already expired the day enforcement shipped: its grace counts from here rather
   * than from the old expiry date, so it is not blocked the moment the release lands.
   */
  graceFrom?: Date | string | null;
  /**
   * Created once subscriptions were enforced. With no plan such a store is blocked; a store from
   * before, with no plan, keeps working until the super admin sets one.
   */
  required?: boolean | null;
}

export interface SubscriptionStatus {
  state: SubscriptionState;
  plan: string | null;
  expiresAt: string | null;
  warnFrom: string | null;
  blockAt: string | null;
  /**
   * Whole days left, rounded up: until the expiry date while active or warning, until the block
   * during grace, 0 once blocked. Null when nothing is counting down.
   */
  daysLeft: number | null;
}

/** A date as epoch ms. An unreadable one counts as long past: it must not mean "forever". */
function epochMs(value: Date | string): number {
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isNaN(ms) ? 0 : ms;
}

const iso = (ms: number): string => new Date(ms).toISOString();

export function subscriptionStatus(
  facts: SubscriptionFacts,
  rules: SubscriptionRules = DEFAULT_SUBSCRIPTION_RULES,
  now: Date | number = Date.now(),
): SubscriptionStatus {
  const nowMs = typeof now === 'number' ? now : now.getTime();
  const plan = facts.plan?.trim() || null;
  const undated = { plan, expiresAt: null, warnFrom: null, blockAt: null, daysLeft: null };

  if (plan === PERPETUAL_PLAN) return { state: 'unlimited', ...undated };
  if (!plan) return { state: facts.required ? 'blocked' : 'unlimited', ...undated };
  // A plan the super admin saved without a date: theirs to give, so it does not run out.
  if (facts.expiresAt === null || facts.expiresAt === undefined || facts.expiresAt === '') {
    return { state: 'unlimited', ...undated };
  }

  const expires = epochMs(facts.expiresAt);
  const warnFrom = expires - rules.warnDays * DAY_MS;
  const graceStart = facts.graceFrom ? Math.max(expires, epochMs(facts.graceFrom)) : expires;
  const blockAt = graceStart + rules.graceDays * DAY_MS;
  const dated = { plan, expiresAt: iso(expires), warnFrom: iso(warnFrom), blockAt: iso(blockAt) };
  const daysUntil = (ms: number) => Math.max(0, Math.ceil((ms - nowMs) / DAY_MS));

  if (nowMs < warnFrom) return { state: 'active', ...dated, daysLeft: daysUntil(expires) };
  if (nowMs < expires) return { state: 'warning', ...dated, daysLeft: daysUntil(expires) };
  if (nowMs < blockAt) return { state: 'grace', ...dated, daysLeft: daysUntil(blockAt) };
  return { state: 'blocked', ...dated, daysLeft: 0 };
}

/** A store row's subscription columns, by their Prisma names, as the facts the rule reads. */
export function storeSubscriptionFacts(store: {
  subscriptionPlan?: string | null;
  subscriptionExpiresAt?: Date | string | null;
  subscriptionGraceFrom?: Date | string | null;
  subscriptionRequired?: boolean | null;
}): SubscriptionFacts {
  return {
    plan: store.subscriptionPlan,
    expiresAt: store.subscriptionExpiresAt,
    graceFrom: store.subscriptionGraceFrom,
    required: store.subscriptionRequired,
  };
}
