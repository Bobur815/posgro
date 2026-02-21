// src/main/ipc/weighed-items-handlers.ts
import { ipcMain } from 'electron';
import { getPrismaClient } from '../database/sqlite-client';
import { getCurrentUser } from './auth-handlers';
import { generateWeightedBarcode } from '../../shared/utils/barcode-parser';

function ipcSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return parseFloat(value) || 0;
  if (typeof value === 'object' && value !== null && 'toNumber' in value) {
    return (value as { toNumber: () => number }).toNumber();
  }
  return 0;
}

function serializeWeighedItem(item: any) {
  if (!item) return null;
  return {
    id: item.id,
    productId: Number(item.productId),
    internalCode: String(item.internalCode),
    weight: toNumber(item.weight),
    barcode: String(item.barcode),
    pricePerKg: toNumber(item.pricePerKg),
    totalPrice: toNumber(item.totalPrice),
    status: item.status,
    createdAt: item.createdAt instanceof Date ? item.createdAt.toISOString() : item.createdAt,
    soldAt: item.soldAt instanceof Date ? item.soldAt.toISOString() : item.soldAt || null,
    saleId: item.saleId || null,
    product: item.product
      ? {
          id: Number(item.product.id),
          nameRu: String(item.product.nameRu || ''),
          nameUz: String(item.product.nameUz || ''),
          barcode: String(item.product.barcode || ''),
          price: toNumber(item.product.price),
          unit: item.product.unit || 'кг',
        }
      : undefined,
  };
}

export function setupWeighedItemsHandlers(): void {
  /**
   * Create a new pre-weighed item record.
   * Generates the EAN-13 barcode from productCode + weightGrams.
   */
  ipcMain.handle(
    'weighedItems:create',
    async (_event, data: {
      productId: number;
      internalCode: string;
      weightKg: number;
      pricePerKg: number;
    }) => {
      const prisma = getPrismaClient();

      const weightGrams = Math.round(data.weightKg * 1000);
      const barcode = generateWeightedBarcode(data.internalCode, weightGrams);
      const totalPrice = data.weightKg * data.pricePerKg;

      // If a barcode already exists for this exact weight+code, delete old AVAILABLE one first
      const existing = await prisma.preWeighedItem.findUnique({ where: { barcode } });
      if (existing && existing.status === 'AVAILABLE') {
        await prisma.preWeighedItem.delete({ where: { id: existing.id } });
      }

      const item = await prisma.preWeighedItem.create({
        data: {
          productId: data.productId,
          internalCode: data.internalCode,
          weight: data.weightKg,
          barcode,
          pricePerKg: data.pricePerKg,
          totalPrice,
          status: 'AVAILABLE',
        },
        include: { product: true },
      });

      return ipcSafe(serializeWeighedItem(item));
    },
  );

  /**
   * Find an AVAILABLE pre-weighed item by barcode.
   */
  ipcMain.handle('weighedItems:findByBarcode', async (_event, barcode: string) => {
    const prisma = getPrismaClient();
    const item = await prisma.preWeighedItem.findFirst({
      where: { barcode, status: 'AVAILABLE' },
      include: { product: true },
    });
    return ipcSafe(serializeWeighedItem(item));
  });

  /**
   * Mark a pre-weighed item as SOLD.
   */
  ipcMain.handle('weighedItems:markAsSold', async (_event, id: string, saleId?: string) => {
    const prisma = getPrismaClient();
    const item = await prisma.preWeighedItem.update({
      where: { id },
      data: {
        status: 'SOLD',
        soldAt: new Date(),
        saleId: saleId || null,
      },
    });
    return ipcSafe(serializeWeighedItem(item));
  });

  /**
   * Get all AVAILABLE items for a product.
   */
  ipcMain.handle('weighedItems:getAvailable', async (_event, productId: number) => {
    const prisma = getPrismaClient();
    const items = await prisma.preWeighedItem.findMany({
      where: { productId: Number(productId), status: 'AVAILABLE' },
      include: { product: true },
      orderBy: { createdAt: 'desc' },
    });
    return ipcSafe(items.map(serializeWeighedItem));
  });

  /**
   * Paginated list of all items with optional filters (admin use).
   */
  ipcMain.handle(
    'weighedItems:getAll',
    async (_event, filters?: {
      productId?: number;
      status?: string;
      search?: string;
      page?: number;
      limit?: number;
    }) => {
      const prisma = getPrismaClient();
      const page = filters?.page || 1;
      const limit = filters?.limit || 50;
      const skip = (page - 1) * limit;

      const where: Record<string, unknown> = {};
      if (filters?.productId) where.productId = Number(filters.productId);
      if (filters?.status && filters.status !== 'ALL') where.status = filters.status;
      if (filters?.search) where.barcode = { contains: filters.search };

      const [items, total] = await Promise.all([
        prisma.preWeighedItem.findMany({
          where,
          include: { product: true },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        prisma.preWeighedItem.count({ where }),
      ]);

      return ipcSafe({ items: items.map(serializeWeighedItem), total, page, limit });
    },
  );

  /**
   * Void (delete) an AVAILABLE item — admin only.
   */
  ipcMain.handle('weighedItems:delete', async (_event, id: string) => {
    const currentUser = getCurrentUser();
    if (!currentUser || currentUser.role !== 'ADMIN') {
      throw new Error('Unauthorized');
    }

    const prisma = getPrismaClient();
    const item = await prisma.preWeighedItem.findUnique({ where: { id } });
    if (!item) throw new Error('Item not found');
    if (item.status === 'SOLD') throw new Error('Cannot void a sold item');

    await prisma.preWeighedItem.delete({ where: { id } });
    return true;
  });
}
