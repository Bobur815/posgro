import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../../../shared/types/user.types';

export interface JwtPayload {
  sub: string;
  storeId: string | null; // Null for SUPER_ADMIN
  phone: string;
  role: UserRole;
  sessionId?: string;
  iat?: number;
  exp?: number;
}

export interface LoginResponse {
  token: string;
  user: CurrentUser;
}

export type { CurrentUser };
