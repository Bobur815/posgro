import { UserRole } from '../constants/roles';

export interface User {
  id: string;
  storeId: string | null; // Null for SUPER_ADMIN
  phone: string;
  nameUz: string;
  nameRu: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserCreateInput {
  storeId: string;
  phone: string;
  password: string;
  nameUz: string;
  nameRu: string;
  role?: UserRole;
}

export interface UserUpdateInput {
  phone?: string;
  password?: string;
  nameUz?: string;
  nameRu?: string;
  role?: UserRole;
  isActive?: boolean;
}

export interface UserLoginInput {
  phone: string;
  password: string;
  storeId?: string; // Optional: for store-scoped login
}

export interface AuthResponse {
  accessToken: string;
  user: Omit<User, 'createdAt' | 'updatedAt'>;
}

export interface CurrentUser {
  id: string;
  storeId: string | null;
  phone: string;
  nameUz: string;
  nameRu: string;
  role: UserRole;
}
