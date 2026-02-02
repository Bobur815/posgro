import { ipcMain, app } from 'electron';
import { setupAuthHandlers } from './auth-handlers';
import { setupProductsHandlers } from './products-handlers';
import { setupSalesHandlers } from './sales-handlers';
import { getAppConfig } from '../config/app-config';

export function setupIpcHandlers(): void {
  // Setup all IPC handlers
  setupAuthHandlers();
  setupProductsHandlers();
  setupSalesHandlers();
  setupCategoriesHandlers();
  setupInventoryHandlers();
  setupSettingsHandlers();
  setupAppHandlers();

  console.log('IPC handlers initialized');
}

function setupCategoriesHandlers(): void {
  const { getPrismaClient } = require('../database/sqlite-client');

  ipcMain.handle('categories:getAll', async () => {
    const prisma = getPrismaClient();
    return prisma.category.findMany({
      where: { active: true },
      orderBy: { nameRu: 'asc' },
    });
  });

  ipcMain.handle('categories:create', async (_event, data) => {
    const prisma = getPrismaClient();
    return prisma.category.create({ data });
  });

  ipcMain.handle('categories:update', async (_event, id: string, data) => {
    const prisma = getPrismaClient();
    return prisma.category.update({
      where: { id },
      data,
    });
  });
}

function setupInventoryHandlers(): void {
  const { getPrismaClient } = require('../database/sqlite-client');

  ipcMain.handle('inventory:createArrival', async (_event, data) => {
    const prisma = getPrismaClient();

    // Create arrival record
    const arrival = await prisma.inventoryArrival.create({
      data: {
        productId: data.productId,
        quantity: data.quantity,
        cost: data.cost,
        totalCost: data.quantity * data.cost,
        supplierId: data.supplierId || null,
        notes: data.notes || null,
        createdBy: data.createdBy,
      },
    });

    // Update product stock
    await prisma.product.update({
      where: { id: data.productId },
      data: {
        stock: { increment: data.quantity },
        cost: data.cost, // Update cost to latest purchase cost
      },
    });

    return arrival;
  });

  ipcMain.handle('inventory:getArrivals', async (_event, filters) => {
    const prisma = getPrismaClient();

    const where: Record<string, unknown> = {};
    if (filters?.productId) {
      where.productId = filters.productId;
    }

    return prisma.inventoryArrival.findMany({
      where,
      include: {
        product: true,
        supplier: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  });

  ipcMain.handle('inventory:getLowStock', async () => {
    const prisma = getPrismaClient();
    return prisma.product.findMany({
      where: {
        active: true,
        stock: {
          lte: prisma.product.fields.minStock,
        },
      },
      include: { category: true },
      orderBy: { stock: 'asc' },
    });
  });
}

function setupSettingsHandlers(): void {
  const { getPrismaClient } = require('../database/sqlite-client');

  ipcMain.handle('settings:get', async (_event, key: string) => {
    const prisma = getPrismaClient();
    const setting = await prisma.systemSetting.findUnique({
      where: { key },
    });
    return setting?.value || null;
  });

  ipcMain.handle('settings:set', async (_event, key: string, value: string) => {
    const prisma = getPrismaClient();
    await prisma.systemSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  });

  ipcMain.handle('settings:getAll', async () => {
    const prisma = getPrismaClient();
    const settings = await prisma.systemSetting.findMany();
    return settings.reduce(
      (acc, s) => ({ ...acc, [s.key]: s.value }),
      {} as Record<string, string>
    );
  });
}

function setupAppHandlers(): void {
  const config = getAppConfig();

  ipcMain.handle('app:getVersion', () => {
    return app.getVersion();
  });

  ipcMain.handle('app:getTerminalId', () => {
    return config.terminalId;
  });

  ipcMain.handle('app:quit', () => {
    app.quit();
  });
}
