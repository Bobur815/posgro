export interface Store {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  active: boolean;
  settings: StoreSettings | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface StoreSettings {
  taxRate?: number;
  receiptHeader?: string;
  receiptFooter?: string;
  currency?: string;
  logoUrl?: string;
}

export interface StoreCreateInput {
  name: string;
  address?: string;
  phone?: string;
  settings?: StoreSettings;
}

export interface StoreUpdateInput {
  name?: string;
  address?: string;
  phone?: string;
  active?: boolean;
  settings?: StoreSettings;
}

export interface StoreWithStats extends Store {
  usersCount: number;
  productsCount: number;
  salesCount: number;
  totalRevenue: number;
}

/**
 * Subscription status for this terminal's store, as shown on the POS login screen.
 *
 * `stale` marks a reply served from the local cache because the VPS was unreachable — the
 * numbers are the last ones seen, not necessarily the current ones.
 */
export interface StoreSubscription {
  /**
   * Which store this is. The terminal knows its own storeId from LocalConfig, but the *name* only
   * exists on the server — and on a shop with more than one terminal, "whose subscription am I
   * looking at" is the first thing the dialog has to answer.
   */
  storeId: string | null;
  storeName: string | null;
  plan: string | null;
  expiresAt: string | null;
  aiPlan: string;
  balanceUzs: number | null;
  /** Null from a server before terminal limits, or before the first live read. */
  terminals: StoreTerminalUsage | null;
  /**
   * The next monthly charge from the balance, and what is owed if the last one left it negative.
   * Null for a plan that is not billed, or from a server before billing.
   */
  nextCharge: { at: string; amountUzs: number; owedUzs: number } | null;
  payment: SubscriptionPaymentInfo;
  /** True when this is a cached snapshot rather than a live read. `reason` says why. */
  stale: boolean;
  /**
   * Why the live read did not happen, when it did not.
   *
   * Without this a blank dialog is indistinguishable from a store with no plan, and the cashier —
   * or whoever they call — has nothing to act on. Each value maps to a different fix: sign in with
   * a password, check the connection, or call support.
   */
  reason?: SubscriptionFailureReason;
}

/** A store's terminals against its plan, as GET /store-config/subscription reports them. */
export interface StoreTerminalUsage {
  /** How many it may run; null is unlimited. */
  allowed: number | null;
  /** How many have registered. Above `allowed`, the newest are refused. */
  used: number;
  /** The plan's own, before extras; null is unlimited. */
  included: number | null;
  extra: number;
  /** A month of one extra terminal, in UZS. */
  extraPriceUzs: number;
}

/** Why `subscription:get` fell back to the cache. */
export type SubscriptionFailureReason =
  /**
   * This terminal's store is OFFLINE_ONLY, and the vendor's server refuses `/auth/login` for such
   * a store (403 auth.errors.store_offline_only). So the terminal cannot obtain a credential at
   * all, and no amount of signing in will change that — the shop has to contact the vendor.
   * Distinct from 'no-credential' precisely because the advice is different.
   */
  | 'offline-only-store'
  /** No VPS token on this terminal — only a password login mints one, a PIN login cannot. */
  | 'no-credential'
  /** The server was not reachable, or did not answer in time. */
  | 'unreachable'
  /** It answered, but with an error — an expired token, or a server without this endpoint. */
  | 'server-error';

export interface SubscriptionPaymentInfo {
  /** Bank-transfer payload, already rendered to a QR image by the main process. */
  qrDataUrl: string | null;
  /** Self-service Click/Payme/Paynet link for this store, or "" when none is configured. */
  paymentUrl: string;
  supportPhone: string;
}

/**
 * Where a till stands by its signed license (src/main/license/license.ts): the subscription states,
 * overdue for a check-in with the server, or not licensed yet.
 */
export type TillLicenseState =
  | 'unlimited'
  | 'active'
  | 'warning'
  | 'grace'
  | 'blocked'
  | 'checkin-required'
  | 'unlicensed'
  /** The store is fine, but this till holds none of its terminal slots. */
  | 'terminal-limit';

export interface TillLicenseStatus {
  state: TillLicenseState;
  /** Days until the next cut-off: expiry, the block, or the end of the unlicensed allowance. */
  daysLeft: number | null;
  plan: string | null;
  expiresAt: string | null;
  blockAt: string | null;
  /** The system clock is more than a day behind the trusted one: receipts would be misdated. */
  clockBehind: boolean;
  canSignIn: boolean;
  canSell: boolean;
  /** How many terminals the store may run by the license; null is unlimited (or not known). */
  terminals: number | null;
  /** Whether this till holds one of them. */
  seated: boolean;
}
