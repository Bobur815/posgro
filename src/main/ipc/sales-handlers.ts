import { ipcMain } from 'electron';
import { getPrismaClient } from '../database/sqlite-client';
import { getCurrentUser } from './auth-handlers';
import { getAppConfig } from '../config/app-config';
import { format } from 'date-fns';

function ipcSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export function setupSalesHandlers(): void {
  ipcMain.handle('sales:create', async (_event, data) => {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      throw new Error('Not authenticated');
    }

    const prisma = getPrismaClient();
    const config = getAppConfig();

    // Generate receipt number
    const receiptNumber = generateReceiptNumber(config.terminalId);

    // Calculate totals
    let totalAmount = 0;
    const items = data.items.map((item: {
      productId: number | string;
      productName: string;
      barcode: string;
      quantity: number;
      unitPrice: number;
    }) => {
      const subtotal = item.quantity * item.unitPrice;
      totalAmount += subtotal;
      return {
        productId: Number(item.productId),
        productName: item.productName,
        barcode: item.barcode,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal,
      };
    });

    const discountAmount = data.discountAmount || 0;
    const finalAmount = totalAmount - discountAmount;

    // Create sale with items
    const sale = await prisma.sale.create({
      data: {
        receiptNumber,
        totalAmount,
        discountAmount,
        finalAmount,
        paymentMethod: data.paymentMethod,
        cashierId: currentUser.id,
        cashierName: currentUser.nameRu,
        terminalId: config.terminalId,
        synced: false,
        items: {
          create: items,
        },
      },
      include: { items: true },
    });

    // Update product stock
    for (const item of items) {
      await prisma.product.update({
        where: { id: item.productId },
        data: {
          stock: { decrement: item.quantity },
        },
      });
    }

    // Log action
    await prisma.auditLog.create({
      data: {
        userId: currentUser.id,
        phone: currentUser.phone,
        action: 'create_sale',
        entity: 'sale',
        entityId: sale.id,
        details: JSON.stringify({
          receiptNumber,
          totalAmount,
          itemCount: items.length,
        }),
      },
    });

    return ipcSafe(sale);
  });

  ipcMain.handle('sales:getAll', async (_event, filters) => {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      throw new Error('Not authenticated');
    }

    const prisma = getPrismaClient();

    const where: Record<string, unknown> = {};

    // Non-admin users can only see their own sales
    if (currentUser.role !== 'ADMIN') {
      where.cashierId = currentUser.id;
    }

    if (filters?.startDate) {
      where.createdAt = {
        ...(where.createdAt as Record<string, Date> || {}),
        gte: new Date(filters.startDate),
      };
    }

    if (filters?.endDate) {
      where.createdAt = {
        ...(where.createdAt as Record<string, Date> || {}),
        lte: new Date(filters.endDate),
      };
    }

    if (filters?.cashierId && currentUser.role === 'ADMIN') {
      where.cashierId = filters.cashierId;
    }

    const sales = await prisma.sale.findMany({
      where,
      include: { items: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return ipcSafe(sales);
  });

  ipcMain.handle('sales:getById', async (_event, id: string) => {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      throw new Error('Not authenticated');
    }

    const prisma = getPrismaClient();

    const sale = await prisma.sale.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!sale) {
      throw new Error('Sale not found');
    }

    // Non-admin users can only see their own sales
    if (currentUser.role !== 'ADMIN' && sale.cashierId !== currentUser.id) {
      throw new Error('Unauthorized');
    }

    return ipcSafe(sale);
  });

  ipcMain.handle('sales:getTodaySummary', async () => {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      throw new Error('Not authenticated');
    }

    const prisma = getPrismaClient();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const where: Record<string, unknown> = {
      createdAt: {
        gte: today,
        lt: tomorrow,
      },
    };

    // Non-admin users can only see their own sales
    if (currentUser.role !== 'ADMIN') {
      where.cashierId = currentUser.id;
    }

    const sales = await prisma.sale.findMany({
      where,
      include: { items: true },
    });

    const totalSales = sales.length;
    const totalRevenue = sales.reduce(
      (sum, sale) => sum + Number(sale.finalAmount),
      0
    );
    const totalItems = sales.reduce(
      (sum, sale) => sum + sale.items.length,
      0
    );
    const cashSales = sales.filter((s) => s.paymentMethod === 'cash').length;
    const cardSales = sales.filter((s) => s.paymentMethod === 'card').length;

    return {
      date: format(today, 'yyyy-MM-dd'),
      totalSales,
      totalRevenue,
      totalItems,
      cashSales,
      cardSales,
      averageTransaction: totalSales > 0 ? totalRevenue / totalSales : 0,
    };
  });
}

function generateReceiptNumber(terminalId: string): string {
  const now = new Date();
  const dateStr = format(now, 'yyyyMMdd');
  const timeStr = format(now, 'HHmmss');
  const random = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, '0');

  return `${terminalId}-${dateStr}-${timeStr}-${random}`;
}
