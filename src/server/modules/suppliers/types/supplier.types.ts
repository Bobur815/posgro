import { Prisma } from '@prisma/client';

export interface SupplierFilters {
  active?: boolean;
  search?: string;
}

export type SupplierWhereInput = Prisma.SupplierWhereInput;
