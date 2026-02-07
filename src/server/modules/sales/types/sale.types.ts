import { Prisma, User } from '@prisma/client';

export interface SaleFilters {
  startDate?: Date;
  endDate?: Date;
  cashierId?: string;
}

export type SaleWhereInput = Prisma.SaleWhereInput;

export type SaleUser = Pick<User, 'id' | 'role'>;
