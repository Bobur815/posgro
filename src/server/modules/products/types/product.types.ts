import { Prisma } from '@prisma/client';

export interface ProductFilters {
  categoryId?: number;
  active?: boolean;
  updatedAfter?: Date;
}

export type ProductWhereInput = Prisma.ProductWhereInput;
