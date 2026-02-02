import { ipcMain } from 'electron';
import { getPrismaClient } from '../database/sqlite-client';
import { getCurrentUser } from './auth-handlers';

export function setupProductsHandlers(): void {
  ipcMain.handle('products:getAll', async (_event, filters) => {
    const prisma = getPrismaClient();

    const where: Record<string, unknown> = {};

    if (filters?.categoryId) {
      where.categoryId = filters.categoryId;
    }

    if (filters?.active !== undefined) {
      where.active = filters.active;
    } else {
      where.active = true;
    }

    return prisma.product.findMany({
      where,
      include: { category: true },
      orderBy: { nameRu: 'asc' },
    });
  });

  ipcMain.handle('products:getById', async (_event, id: string) => {
    const prisma = getPrismaClient();
    return prisma.product.findUnique({
      where: { id },
      include: { category: true },
    });
  });

  ipcMain.handle('products:getByBarcode', async (_event, barcode: string) => {
    const prisma = getPrismaClient();
    return prisma.product.findUnique({
      where: { barcode },
      include: { category: true },
    });
  });

  ipcMain.handle('products:search', async (_event, query: string) => {
    const prisma = getPrismaClient();
    const searchQuery = query.toLowerCase();

    return prisma.product.findMany({
      where: {
        active: true,
        OR: [
          { barcode: { contains: searchQuery } },
          { nameRu: { contains: searchQuery } },
          { nameUz: { contains: searchQuery } },
        ],
      },
      include: { category: true },
      take: 20,
    });
  });

  ipcMain.handle('products:create', async (_event, data) => {
    const currentUser = getCurrentUser();
    if (!currentUser || currentUser.role !== 'ADMIN') {
      throw new Error('Unauthorized');
    }

    const prisma = getPrismaClient();

    // Check if barcode already exists
    const existing = await prisma.product.findUnique({
      where: { barcode: data.barcode },
    });

    if (existing) {
      throw new Error('Product with this barcode already exists');
    }

    const product = await prisma.product.create({
      data: {
        barcode: data.barcode,
        nameUz: data.nameUz,
        nameRu: data.nameRu,
        price: data.price,
        cost: data.cost || null,
        stock: data.stock || 0,
        minStock: data.minStock || 0,
        unit: data.unit || 'шт',
        categoryId: data.categoryId,
        active: true,
      },
      include: { category: true },
    });

    // Log action
    await prisma.auditLog.create({
      data: {
        userId: currentUser.id,
        userName: currentUser.username,
        action: 'create_product',
        entity: 'product',
        entityId: product.id,
        details: JSON.stringify({
          barcode: product.barcode,
          name: product.nameRu,
        }),
      },
    });

    return product;
  });

  ipcMain.handle('products:update', async (_event, id: string, data) => {
    const currentUser = getCurrentUser();
    if (!currentUser || currentUser.role !== 'ADMIN') {
      throw new Error('Unauthorized');
    }

    const prisma = getPrismaClient();

    // Check if barcode is being changed and if new barcode exists
    if (data.barcode) {
      const existing = await prisma.product.findFirst({
        where: {
          barcode: data.barcode,
          NOT: { id },
        },
      });

      if (existing) {
        throw new Error('Product with this barcode already exists');
      }
    }

    const product = await prisma.product.update({
      where: { id },
      data: {
        barcode: data.barcode,
        nameUz: data.nameUz,
        nameRu: data.nameRu,
        price: data.price,
        cost: data.cost,
        stock: data.stock,
        minStock: data.minStock,
        unit: data.unit,
        categoryId: data.categoryId,
        active: data.active,
      },
      include: { category: true },
    });

    // Log action
    await prisma.auditLog.create({
      data: {
        userId: currentUser.id,
        userName: currentUser.username,
        action: 'update_product',
        entity: 'product',
        entityId: product.id,
        details: JSON.stringify({
          barcode: product.barcode,
          name: product.nameRu,
        }),
      },
    });

    return product;
  });

  ipcMain.handle('products:delete', async (_event, id: string) => {
    const currentUser = getCurrentUser();
    if (!currentUser || currentUser.role !== 'ADMIN') {
      throw new Error('Unauthorized');
    }

    const prisma = getPrismaClient();

    // Soft delete
    await prisma.product.update({
      where: { id },
      data: { active: false },
    });

    // Log action
    await prisma.auditLog.create({
      data: {
        userId: currentUser.id,
        userName: currentUser.username,
        action: 'delete_product',
        entity: 'product',
        entityId: id,
      },
    });

    return true;
  });
}
