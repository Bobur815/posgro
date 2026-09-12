import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../../../shared/types/user.types';
import type { LoginClient } from '../dashboard-access';

export interface JwtPayload {
  sub: string;
  storeId: string | null; // Null for SUPER_ADMIN
  phone: string;
  role: UserRole;
  sessionId?: string;
  /**
   * The stores this sign-in may switch to without a password (`POST /auth/switch-store`): the ones
   * whose account the password opened at a login that named no store. Absent on a token that named
   * its store — a terminal's, or one from before — which then lists only its own.
   */
  storeIds?: string[];
  /**
   * Which client this token was minted for. The OFFLINE_ONLY refusal is a dashboard rule, and
   * `validateUser()` re-applies it on every request — so without this it would judge a POS token
   * as if it were a browser and 401 every call an OFFLINE_ONLY terminal makes.
   *
   * Absent on tokens issued before this field existed; those fall back to 'dashboard', which is
   * the stricter reading.
   */
  client?: LoginClient;
  iat?: number;
  exp?: number;
}

/** One store a sign-in can open, for the dashboard's store switcher. */
export interface StoreChoice {
  id: string;
  name: string;
  /** The role of this person's account in that store. */
  role: UserRole;
  /** At least one of the store's terminals has reported in lately — the store is open. */
  online: boolean;
  /** Managed on its terminal, not from the dashboard: listed, but it cannot be switched to. */
  offlineOnly: boolean;
}

export interface LoginResponse {
  token: string;
  user: CurrentUser;
  /** Present when the login named no store: every store it can switch between. */
  stores?: StoreChoice[];
}

export type { CurrentUser };
