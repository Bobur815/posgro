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

export interface LoginResponse {
  token: string;
  user: CurrentUser;
}

export type { CurrentUser };
