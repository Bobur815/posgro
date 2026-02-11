import { ipcMain, app } from 'electron';
import { setupAuthHandlers } from './auth-handlers';
import { setupProductsHandlers } from './products-handlers';
import { setupSalesHandlers } from './sales-handlers';
import { getAppConfig } from '../config/app-config';
import { getPrismaClient } from '../database/sqlite-client';

export function setupIpcHandlers(): void {
  // Setup all IPC handlers
  setupAuthHandlers();
  setupProductsHandlers();
  setupSalesHandlers();
  setupCategoriesHandlers();
  setupInventoryHandlers();
  setupSuppliersHandlers();
  setupSettingsHandlers();
  setupAppHandlers();

  console.log('IPC handlers initialized');
}

function setupCategoriesHandlers(): void {
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

  ipcMain.handle('categories:delete', async (_event, id: string) => {
    const prisma = getPrismaClient();
    await prisma.category.update({
      where: { id },
      data: { active: false },
    });
    return true;
  });
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

function ipcSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function serializeSupplier(supplier: any) {
  if (!supplier) return null;
  return {
    id: supplier.id,
    nameRu: supplier.nameRu,
    nameUz: supplier.nameUz,
    phone: supplier.phone || undefined,
    address: supplier.address || undefined,
    active: Boolean(supplier.active),
    balance: toNumber(supplier.balance),
    createdAt: supplier.createdAt?.toISOString?.() || supplier.createdAt,
  };
}

function serializeTransaction(tx: any) {
  if (!tx) return null;
  return {
    id: tx.id,
    supplierId: tx.supplierId,
    supplier: tx.supplier ? serializeSupplier(tx.supplier) : undefined,
    type: tx.type,
    paymentMethod: tx.paymentMethod,
    amount: toNumber(tx.amount),
    description: tx.description || undefined,
    referenceId: tx.referenceId || undefined,
    referenceType: tx.referenceType || undefined,
    dueDate: tx.dueDate?.toISOString?.() || tx.dueDate || undefined,
    paidAt: tx.paidAt?.toISOString?.() || tx.paidAt || undefined,
    createdBy: tx.createdBy,
    createdAt: tx.createdAt?.toISOString?.() || tx.createdAt,
    updatedAt: tx.updatedAt?.toISOString?.() || tx.updatedAt,
  };
}

function setupSuppliersHandlers(): void {
  // Get all suppliers
  ipcMain.handle('suppliers:getAll', async (_event, includeInactive?: boolean) => {
    const prisma = getPrismaClient();
    const where = includeInactive ? {} : { active: true };
    const suppliers = await prisma.supplier.findMany({
      where,
      orderBy: { nameRu: 'asc' },
    });
    return ipcSafe(suppliers.map(serializeSupplier));
  });

  // Get supplier by ID with transactions
  ipcMain.handle('suppliers:getById', async (_event, id: string) => {
    const prisma = getPrismaClient();
    const supplier = await prisma.supplier.findUnique({
      where: { id },
      include: {
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
      },
    });
    if (!supplier) return null;

    const serialized = serializeSupplier(supplier);
    return ipcSafe({
      ...serialized,
      transactions: supplier.transactions.map(serializeTransaction),
    });
  });

  // Create supplier
  ipcMain.handle('suppliers:create', async (_event, data: {
    nameRu: string;
    nameUz: string;
    phone?: string;
    address?: string;
  }) => {
    const prisma = getPrismaClient();
    const supplier = await prisma.supplier.create({
      data: {
        nameRu: data.nameRu,
        nameUz: data.nameUz,
        phone: data.phone || null,
        address: data.address || null,
        balance: 0,
      },
    });
    return ipcSafe(serializeSupplier(supplier));
  });

  // Update supplier
  ipcMain.handle('suppliers:update', async (_event, id: string, data: {
    nameRu?: string;
    nameUz?: string;
    phone?: string;
    address?: string;
    active?: boolean;
  }) => {
    const prisma = getPrismaClient();
    const supplier = await prisma.supplier.update({
      where: { id },
      data: {
        ...(data.nameRu !== undefined && { nameRu: data.nameRu }),
        ...(data.nameUz !== undefined && { nameUz: data.nameUz }),
        ...(data.phone !== undefined && { phone: data.phone || null }),
        ...(data.address !== undefined && { address: data.address || null }),
        ...(data.active !== undefined && { active: data.active }),
      },
    });
    return ipcSafe(serializeSupplier(supplier));
  });

  // Delete (soft) supplier
  ipcMain.handle('suppliers:delete', async (_event, id: string) => {
    const prisma = getPrismaClient();
    await prisma.supplier.update({
      where: { id },
      data: { active: false },
    });
    return true;
  });

  // Get transactions for a supplier
  ipcMain.handle('suppliers:getTransactions', async (_event, filters: {
    supplierId?: string;
    type?: string;
    paymentMethod?: string;
    startDate?: string;
    endDate?: string;
  }) => {
    const prisma = getPrismaClient();
    const where: Record<string, unknown> = {};

    if (filters.supplierId) where.supplierId = filters.supplierId;
    if (filters.type) where.type = filters.type;
    if (filters.paymentMethod) where.paymentMethod = filters.paymentMethod;

    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) (where.createdAt as Record<string, Date>).gte = new Date(filters.startDate);
      if (filters.endDate) {
        const endDate = new Date(filters.endDate);
        endDate.setHours(23, 59, 59, 999);
        (where.createdAt as Record<string, Date>).lte = endDate;
      }
    }

    const transactions = await prisma.supplierTransaction.findMany({
      where,
      include: { supplier: true },
      orderBy: { createdAt: 'desc' },
    });

    return ipcSafe(transactions.map(serializeTransaction));
  });

  // Create transaction and update supplier balance
  ipcMain.handle('suppliers:createTransaction', async (_event, data: {
    supplierId: string;
    type: string;
    paymentMethod: string;
    amount: number;
    description?: string;
    referenceId?: string;
    referenceType?: string;
    dueDate?: string;
    createdBy: string;
  }) => {
    const prisma = getPrismaClient();

    // Determine balance change based on transaction type
    // PURCHASE: negative (we owe more)
    // PAYMENT, RETURN: positive (we owe less)
    // ADVANCE: positive (they owe us)
    // ADJUSTMENT: use amount as-is
    let balanceChange = data.amount;
    if (data.type === 'PURCHASE') {
      balanceChange = -Math.abs(data.amount); // Always negative
    } else if (['PAYMENT', 'RETURN', 'ADVANCE'].includes(data.type)) {
      balanceChange = Math.abs(data.amount); // Always positive
    }
    // ADJUSTMENT uses the amount as provided (can be + or -)

    const transaction = await prisma.supplierTransaction.create({
      data: {
        supplierId: data.supplierId,
        type: data.type,
        paymentMethod: data.paymentMethod,
        amount: balanceChange,
        description: data.description || null,
        referenceId: data.referenceId || null,
        referenceType: data.referenceType || null,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        paidAt: ['PAYMENT', 'ADVANCE'].includes(data.type) ? new Date() : null,
        createdBy: data.createdBy,
      },
      include: { supplier: true },
    });

    // Update supplier balance
    await prisma.supplier.update({
      where: { id: data.supplierId },
      data: {
        balance: { increment: balanceChange },
      },
    });

    return ipcSafe(serializeTransaction(transaction));
  });

  // Update transaction
  ipcMain.handle('suppliers:updateTransaction', async (_event, id: string, data: {
    type?: string;
    paymentMethod?: string;
    amount?: number;
    description?: string;
    dueDate?: string;
    paidAt?: string;
  }) => {
    const prisma = getPrismaClient();

    // Get original transaction to calculate balance difference
    const original = await prisma.supplierTransaction.findUnique({ where: { id } });
    if (!original) throw new Error('Transaction not found');

    const oldAmount = toNumber(original.amount);
    const newAmount = data.amount !== undefined ? data.amount : oldAmount;
    const balanceDiff = newAmount - oldAmount;

    const transaction = await prisma.supplierTransaction.update({
      where: { id },
      data: {
        ...(data.type !== undefined && { type: data.type }),
        ...(data.paymentMethod !== undefined && { paymentMethod: data.paymentMethod }),
        ...(data.amount !== undefined && { amount: data.amount }),
        ...(data.description !== undefined && { description: data.description || null }),
        ...(data.dueDate !== undefined && { dueDate: data.dueDate ? new Date(data.dueDate) : null }),
        ...(data.paidAt !== undefined && { paidAt: data.paidAt ? new Date(data.paidAt) : null }),
      },
      include: { supplier: true },
    });

    // Update supplier balance if amount changed
    if (balanceDiff !== 0) {
      await prisma.supplier.update({
        where: { id: original.supplierId },
        data: {
          balance: { increment: balanceDiff },
        },
      });
    }

    return ipcSafe(serializeTransaction(transaction));
  });

  // Delete transaction and reverse balance
  ipcMain.handle('suppliers:deleteTransaction', async (_event, id: string) => {
    const prisma = getPrismaClient();

    const transaction = await prisma.supplierTransaction.findUnique({ where: { id } });
    if (!transaction) throw new Error('Transaction not found');

    // Reverse the balance change
    const amount = toNumber(transaction.amount);
    await prisma.supplier.update({
      where: { id: transaction.supplierId },
      data: {
        balance: { decrement: amount },
      },
    });

    await prisma.supplierTransaction.delete({ where: { id } });

    return true;
  });

  // Get supplier balance summary
  ipcMain.handle('suppliers:getBalance', async (_event, supplierId: string) => {
    const prisma = getPrismaClient();

    const supplier = await prisma.supplier.findUnique({
      where: { id: supplierId },
    });

    if (!supplier) return null;

    // Get transaction summary
    const transactions = await prisma.supplierTransaction.findMany({
      where: { supplierId },
    });

    let totalDebt = 0;   // What we owe (sum of negative)
    let totalCredit = 0; // What they owe us (sum of positive)

    for (const tx of transactions) {
      const amount = toNumber(tx.amount);
      if (amount < 0) totalDebt += Math.abs(amount);
      else totalCredit += amount;
    }

    return ipcSafe({
      balance: toNumber(supplier.balance),
      totalDebt,
      totalCredit,
    });
  });

  // Record payment shortcut
  ipcMain.handle('suppliers:recordPayment', async (_event, data: {
    supplierId: string;
    amount: number;
    paymentMethod: string;
    description?: string;
    createdBy: string;
  }) => {
    const prisma = getPrismaClient();

    const transaction = await prisma.supplierTransaction.create({
      data: {
        supplierId: data.supplierId,
        type: 'PAYMENT',
        paymentMethod: data.paymentMethod,
        amount: Math.abs(data.amount), // Positive = reduces our debt
        description: data.description || null,
        paidAt: new Date(),
        createdBy: data.createdBy,
      },
    });

    await prisma.supplier.update({
      where: { id: data.supplierId },
      data: {
        balance: { increment: Math.abs(data.amount) },
      },
    });

    return ipcSafe(serializeTransaction(transaction));
  });
}

function setupInventoryHandlers(): void {
  ipcMain.handle('inventory:createArrival', async (_event, data) => {
    const prisma = getPrismaClient();

    const totalCost = data.quantity * data.cost;

    // Create arrival record
    const arrival = await prisma.inventoryArrival.create({
      data: {
        productId: data.productId,
        quantity: data.quantity,
        cost: data.cost,
        totalCost: totalCost,
        supplierId: data.supplierId || null,
        notes: data.notes || null,
        createdBy: data.createdBy,
      },
    });

    // Update product stock and cost
    const productUpdate: Record<string, unknown> = {
      stock: { increment: data.quantity },
      cost: data.cost, // Update cost to latest purchase cost
    };

    if (data.newPrice !== undefined && data.priceMode) {
      if (data.priceMode === 'immediate') {
        // Change price immediately for all stock
        productUpdate.price = data.newPrice;
        productUpdate.pendingPrice = null;
        productUpdate.pendingPriceThreshold = null;
      } else if (data.priceMode === 'deferred') {
        // Apply new price after old stock is sold (when stock drops to new arrival qty)
        productUpdate.pendingPrice = data.newPrice;
        productUpdate.pendingPriceThreshold = data.quantity;
      }
    }

    await prisma.product.update({
      where: { id: data.productId },
      data: productUpdate,
    });

    // If supplier is specified, create a supplier transaction (PURCHASE type)
    if (data.supplierId && data.createdBy) {
      const balanceChange = -Math.abs(totalCost); // PURCHASE = negative (we owe more)

      await prisma.supplierTransaction.create({
        data: {
          supplierId: data.supplierId,
          type: 'PURCHASE',
          paymentMethod: data.paymentMethod || 'INSTALLMENT', // Default to installment (credit)
          amount: balanceChange,
          description: data.notes || null,
          referenceId: arrival.id,
          referenceType: 'INVENTORY_ARRIVAL',
          createdBy: data.createdBy,
        },
      });

      // Update supplier balance
      await prisma.supplier.update({
        where: { id: data.supplierId },
        data: {
          balance: { increment: balanceChange },
        },
      });
    }

    return ipcSafe(arrival);
  });

  ipcMain.handle('inventory:getArrivals', async (_event, filters) => {
    const prisma = getPrismaClient();

    const where: Record<string, unknown> = {};
    if (filters?.productId) {
      where.productId = filters.productId;
    }

    const arrivals = await prisma.inventoryArrival.findMany({
      where,
      include: {
        product: true,
        supplier: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return ipcSafe(arrivals);
  });

  ipcMain.handle('inventory:getLowStock', async () => {
    const prisma = getPrismaClient();
    // Fetch products where stock <= minStock using raw query for column comparison
    const products = await prisma.$queryRaw`
      SELECT p.*, c.name_uz as category_name_uz, c.name_ru as category_name_ru
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.active = 1 AND p.stock <= p.min_stock
      ORDER BY p.stock ASC
    `;
    return products;
  });
}

function setupSettingsHandlers(): void {
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
    const result: Record<string, string> = {};
    for (const setting of settings) {
      result[setting.key] = setting.value;
    }
    return result;
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

  ipcMain.handle('app:getStoreInfo', () => {
    return {
      storeId: config.storeId,
      storeName: config.storeName,
    };
  });

  ipcMain.handle('app:quit', () => {
    app.quit();
  });
}
