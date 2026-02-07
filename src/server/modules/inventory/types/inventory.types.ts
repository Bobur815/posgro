import { Prisma } from '@prisma/client';

export interface ArrivalFilters {
  productId?: number;
  startDate?: Date;
}

export type InventoryArrivalWhereInput = Prisma.InventoryArrivalWhereInput;
