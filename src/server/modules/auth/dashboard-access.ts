/**
 * Whether a store may be managed from the web dashboard.
 *
 * Kept DB-free and separate from `AuthService` so the rule can be tested without standing up Nest
 * — the same reason `sync-policy.ts` and `analytics.ranking.ts` are shaped this way.
 */
import {
  DEFAULT_SUBSCRIPTION_RULES,
  storeSubscriptionFacts,
  subscriptionStatus,
  type SubscriptionRules,
} from '../../../shared/utils/subscription';

/** Roles as strings, so this file does not depend on the generated Prisma enum. */
export const SUPER_ADMIN = 'SUPER_ADMIN';

export interface DashboardStore {
  active: boolean;
  /** 'ONLINE' | 'OFFLINE_ONLY'. */
  mode: string;
  subscriptionPlan?: string | null;
  subscriptionExpiresAt?: Date | string | null;
  subscriptionGraceFrom?: Date | string | null;
  subscriptionRequired?: boolean | null;
}

/** The store columns this rule reads — select these wherever a store is gated. */
export const DASHBOARD_STORE_SELECT = {
  active: true,
  mode: true,
  subscriptionPlan: true,
  subscriptionExpiresAt: true,
  subscriptionGraceFrom: true,
  subscriptionRequired: true,
} as const;

/** An `auth.errors.*` key the browser translates, or null when the login may proceed. */
export type BlockReason =
  | 'auth.errors.store_inactive'
  | 'auth.errors.subscription_blocked'
  | 'auth.errors.store_offline_only'
  | null;

/**
 * Which client is asking. Defaults to 'dashboard' everywhere, so anything that does not say
 * otherwise keeps the stricter rule — the safe direction for an omitted field.
 */
export type LoginClient = 'dashboard' | 'pos';

/**
 * Three refusals, for different reasons:
 *
 *  - **Deactivated store** — its people should not keep working in the dashboard after it has
 *    been switched off.
 *  - **Subscription blocked** — past its expiry date and grace days (shared/utils/subscription.ts).
 *  - **OFFLINE_ONLY store** — the terminal's SQLite is the source of truth and it never syncs, so
 *    this server holds nothing for that shop. Letting them in would show an empty or long-stale
 *    store and invite edits the till would never see. Their dashboard is the one the terminal
 *    serves on the shop's own network.
 *
 * A SUPER_ADMIN is always allowed: they have no store of their own, and they are the one who has
 * to be able to log in and switch a store back on. A user with no store is likewise not blocked
 * here — that case is already rejected earlier in the login flow.
 *
 * A store that cannot be found is treated as inactive rather than allowed: failing closed is the
 * right side to err on when the row backing the session is missing.
 *
 * The OFFLINE_ONLY refusal is scoped to the DASHBOARD, which is the only thing it was ever about.
 * A POS terminal asking for a token is a different case: it is not going to browse a stale store,
 * it needs a credential to read its own store's billing row and to reach the vendor's shared
 * services (marking codes, MXIK, invoice AI). Refusing it left such a terminal permanently without
 * a credential once its setup token expired — setup-handlers.ts already assumed a VPS login stayed
 * possible for exactly this reason.
 *
 * The subscription refusal is scoped to the dashboard too, for the same kind of reason: a blocked
 * till still has to sign in to learn it has been paid for. The till enforces the block itself,
 * from the license it is sent, and refuses to sell.
 *
 * Deactivation still blocks BOTH: a store that has been switched off should not have a working
 * till either, and that is the more fundamental refusal.
 *
 * The client field is a hint the caller supplies, so it is not an authorization boundary and is not
 * treated as one — the password check above it is. What it changes is which of two *product*
 * rules applies, and the token it yields carries exactly the same claims either way.
 */
export function dashboardLoginBlockReason(
  role: string,
  storeId: string | null,
  store: DashboardStore | null,
  client: LoginClient = 'dashboard',
  rules: SubscriptionRules = DEFAULT_SUBSCRIPTION_RULES,
  now: number = Date.now(),
): BlockReason {
  if (role === SUPER_ADMIN || !storeId) return null;
  if (!store || !store.active) return 'auth.errors.store_inactive';
  if (client === 'pos') return null;
  // Ahead of offline mode: paying is what the owner can act on, wherever the store is managed.
  if (subscriptionStatus(storeSubscriptionFacts(store), rules, now).state === 'blocked') {
    return 'auth.errors.subscription_blocked';
  }
  if (store.mode === 'OFFLINE_ONLY') return 'auth.errors.store_offline_only';
  return null;
}
