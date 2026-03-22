import { ipcMain } from 'electron';
import { getPrismaClient } from '../database/sqlite-client';
import { getCurrentUser } from './auth-handlers';
import { getAppConfig } from '../config/app-config';
import { format } from 'date-fns';
import type { Sale, SaleItem as PrismaSaleItem } from '../../generated/prisma-sqlite';

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

    // Check stock availability for all items
    for (const item of data.items as Array<{ productId: number | string; quantity: number }>) {
      const product = await prisma.product.findUnique({
        where: { id: Number(item.productId) },
        select: { id: true, nameRu: true, stock: true, active: true },
      });

      if (!product) {
        throw new Error(JSON.stringify({ code: 'PRODUCT_NOT_FOUND', productId: item.productId }));
      }

      if (!product.active) {
        throw new Error(JSON.stringify({ code: 'PRODUCT_INACTIVE', name: product.nameRu }));
      }

      if (Number(product.stock) < item.quantity) {
        throw new Error(JSON.stringify({
          code: 'INSUFFICIENT_STOCK',
          name: product.nameRu,
          available: Number(product.stock),
          requested: item.quantity,
        }));
      }
    }

    // Calculate totals
    let totalAmount = 0;
    const items = data.items.map((item: {
      productId: number | string;
      productName: string;
      barcode: string;
      quantity: number;
      unitPrice: number;
      preWeighedItemId?: string;
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
        // Keep preWeighedItemId for post-sale update (not stored in DB SaleItem)
        preWeighedItemId: item.preWeighedItemId,
      };
    });

    const discountAmount = data.discountAmount || 0;
    const finalAmount = totalAmount - discountAmount;

    // Generate receipt number
    const receiptNumber = await generateReceiptNumber(config.terminalId);

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

    // Update product stock and check for pending price changes
    for (const item of items) {
      await prisma.product.update({
        where: { id: item.productId },
        data: {
          stock: { decrement: item.quantity },
        },
      });

      // Check if pending price should be applied
      const updatedProduct = await prisma.product.findUnique({
        where: { id: item.productId },
        select: { stock: true, pendingPrice: true, pendingPriceThreshold: true },
      });

      if (
        updatedProduct?.pendingPrice != null &&
        updatedProduct?.pendingPriceThreshold != null &&
        Number(updatedProduct.stock) <= Number(updatedProduct.pendingPriceThreshold)
      ) {
        await prisma.product.update({
          where: { id: item.productId },
          data: {
            price: updatedProduct.pendingPrice,
            pendingPrice: null,
            pendingPriceThreshold: null,
          },
        });
      }
    }

    // Mark any pre-weighed items as SOLD
    for (const item of data.items as Array<{
      productId: number | string;
      quantity: number;
      preWeighedItemId?: string;
    }>) {
      if (item.preWeighedItemId) {
        await prisma.preWeighedItem.update({
          where: { id: item.preWeighedItemId },
          data: { status: 'SOLD', soldAt: new Date(), saleId: sale.id },
        }).catch(() => {
          // Item may have already been marked sold or not exist — not fatal
        });
      }
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
          receiptNumber: sale.receiptNumber,
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
      include: { items: { include: { product: { select: { cost: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const salesWithMargin = (sales as Array<Sale & { items: Array<PrismaSaleItem & { product: { cost: unknown } | null }> }>).map((sale) => {
      const totalCost = sale.items.reduce((sum, item) => {
        const cost = item.product?.cost ? Number(item.product.cost) : 0;
        return sum + cost * Number(item.quantity);
      }, 0);
      const finalAmount = Number(sale.finalAmount);
      const margin = finalAmount > 0 ? ((finalAmount - totalCost) / finalAmount) * 100 : 0;
      return { ...sale, totalCost, margin };
    });

    return ipcSafe(salesWithMargin);
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

  ipcMain.handle('sales:update', async (_event, saleId: string, data) => {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      throw new Error('Not authenticated');
    }

    const prisma = getPrismaClient();

    const existingSale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: { items: true },
    });

    if (!existingSale) {
      throw new Error('Sale not found');
    }

    if (currentUser.role !== 'ADMIN' && existingSale.cashierId !== currentUser.id) {
      throw new Error('Unauthorized');
    }

    // Restore stock from old items
    for (const oldItem of existingSale.items) {
      await prisma.product.update({
        where: { id: oldItem.productId },
        data: { stock: { increment: oldItem.quantity } },
      });
    }

    // Check stock availability for new items (after restoring old stock)
    for (const item of data.items as Array<{ productId: number | string; quantity: number }>) {
      const product = await prisma.product.findUnique({
        where: { id: Number(item.productId) },
        select: { id: true, nameRu: true, stock: true, active: true },
      });

      if (!product) {
        throw new Error(JSON.stringify({ code: 'PRODUCT_NOT_FOUND', productId: item.productId }));
      }

      if (!product.active) {
        throw new Error(JSON.stringify({ code: 'PRODUCT_INACTIVE', name: product.nameRu }));
      }

      if (Number(product.stock) < item.quantity) {
        throw new Error(JSON.stringify({
          code: 'INSUFFICIENT_STOCK',
          name: product.nameRu,
          available: Number(product.stock),
          requested: item.quantity,
        }));
      }
    }

    // Calculate new totals
    let totalAmount = 0;
    const newItems = data.items.map((item: {
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

    // Delete old items, update sale, create new items
    await prisma.saleItem.deleteMany({ where: { saleId } });

    const updatedSale = await prisma.sale.update({
      where: { id: saleId },
      data: {
        totalAmount,
        discountAmount,
        finalAmount,
        paymentMethod: data.paymentMethod,
        synced: false,
        items: {
          create: newItems,
        },
      },
      include: { items: true },
    });

    // Decrement stock for new items and check pending price
    for (const item of newItems) {
      await prisma.product.update({
        where: { id: item.productId },
        data: { stock: { decrement: item.quantity } },
      });

      const updatedProduct = await prisma.product.findUnique({
        where: { id: item.productId },
        select: { stock: true, pendingPrice: true, pendingPriceThreshold: true },
      });

      if (
        updatedProduct?.pendingPrice != null &&
        updatedProduct?.pendingPriceThreshold != null &&
        Number(updatedProduct.stock) <= Number(updatedProduct.pendingPriceThreshold)
      ) {
        await prisma.product.update({
          where: { id: item.productId },
          data: {
            price: updatedProduct.pendingPrice,
            pendingPrice: null,
            pendingPriceThreshold: null,
          },
        });
      }
    }

    await prisma.auditLog.create({
      data: {
        userId: currentUser.id,
        phone: currentUser.phone,
        action: 'update_sale',
        entity: 'sale',
        entityId: saleId,
        details: JSON.stringify({
          receiptNumber: existingSale.receiptNumber,
          oldTotal: Number(existingSale.finalAmount),
          newTotal: finalAmount,
          itemCount: newItems.length,
        }),
      },
    });

    return ipcSafe(updatedSale);
  });

  ipcMain.handle('sales:delete', async (_event, saleId: string) => {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      throw new Error('Not authenticated');
    }

    const prisma = getPrismaClient();

    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: { items: true },
    });

    if (!sale) {
      throw new Error('Sale not found');
    }

    if (currentUser.role !== 'ADMIN' && sale.cashierId !== currentUser.id) {
      throw new Error('Unauthorized');
    }

    // Restore stock for all items
    for (const item of sale.items) {
      await prisma.product.update({
        where: { id: item.productId },
        data: { stock: { increment: item.quantity } },
      });
    }

    // Delete items then sale
    await prisma.saleItem.deleteMany({ where: { saleId } });
    await prisma.sale.delete({ where: { id: saleId } });

    await prisma.auditLog.create({
      data: {
        userId: currentUser.id,
        phone: currentUser.phone,
        action: 'delete_sale',
        entity: 'sale',
        entityId: saleId,
        details: JSON.stringify({
          receiptNumber: sale.receiptNumber,
          totalAmount: Number(sale.finalAmount),
          itemCount: sale.items.length,
        }),
      },
    });

    return true;
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
      (sum: number, sale: Sale & { items: PrismaSaleItem[] }) => sum + Number(sale.finalAmount),
      0
    );
    const totalItems = sales.reduce(
      (sum: number, sale: Sale & { items: PrismaSaleItem[] }) => sum + sale.items.length,
      0
    );
    const cashSales = sales.filter((s: Sale & { items: PrismaSaleItem[] }) => s.paymentMethod === 'cash').length;
    const cardSales = sales.filter((s: Sale & { items: PrismaSaleItem[] }) => s.paymentMethod === 'card').length;

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

ipcMain.handle('analytics:getData', async (_event, filters: {
  startDate: string;
  endDate: string;
}) => {
  const prisma = getPrismaClient();
  // Prisma/SQLite stores DateTime as integer milliseconds since epoch
  const startMs = new Date(filters.startDate).getTime();
  const endMs = new Date(filters.endDate).getTime();

  const [salesTrend, salesByCategory, hourlyDist, topProducts, cashierPerf, profitMargins, summary] = await Promise.all([
    prisma.$queryRawUnsafe(`
      SELECT DATE(datetime(created_at/1000, 'unixepoch', 'localtime')) as date,
             CAST(SUM(final_amount) AS REAL) as revenue,
             CAST(COUNT(*) AS REAL) as count
      FROM sales
      WHERE created_at >= ? AND created_at <= ?
      GROUP BY DATE(datetime(created_at/1000, 'unixepoch', 'localtime'))
      ORDER BY date ASC
    `, startMs, endMs),

    prisma.$queryRawUnsafe(`
      SELECT COALESCE(c.name_ru, 'Без категории') as categoryRu,
             COALESCE(c.name_uz, 'Kategoriyasiz') as categoryUz,
             CAST(SUM(si.subtotal) AS REAL) as revenue,
             CAST(SUM(si.quantity) AS REAL) as quantity
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      JOIN products p ON si.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE s.created_at >= ? AND s.created_at <= ?
      GROUP BY c.id
      ORDER BY revenue DESC
      LIMIT 10
    `, startMs, endMs),

    prisma.$queryRawUnsafe(`
      SELECT CAST(strftime('%H', datetime(created_at/1000, 'unixepoch', 'localtime')) AS INTEGER) as hour,
             CAST(SUM(final_amount) AS REAL) as revenue,
             CAST(COUNT(*) AS REAL) as count
      FROM sales
      WHERE created_at >= ? AND created_at <= ?
      GROUP BY strftime('%H', datetime(created_at/1000, 'unixepoch', 'localtime'))
      ORDER BY hour ASC
    `, startMs, endMs),

    prisma.$queryRawUnsafe(`
      SELECT si.product_name as name,
             CAST(SUM(si.quantity) AS REAL) as quantity,
             CAST(SUM(si.subtotal) AS REAL) as revenue
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      WHERE s.created_at >= ? AND s.created_at <= ?
      GROUP BY si.product_id
      ORDER BY quantity DESC
      LIMIT 10
    `, startMs, endMs),

    prisma.$queryRawUnsafe(`
      SELECT cashier_name as name,
             CAST(SUM(final_amount) AS REAL) as revenue,
             CAST(COUNT(*) AS REAL) as count
      FROM sales
      WHERE created_at >= ? AND created_at <= ?
      GROUP BY cashier_id
      ORDER BY revenue DESC
    `, startMs, endMs),

    prisma.$queryRawUnsafe(`
      SELECT COALESCE(c.name_ru, 'Без категории') as categoryRu,
             COALESCE(c.name_uz, 'Kategoriyasiz') as categoryUz,
             CAST(SUM(si.subtotal) AS REAL) as revenue,
             CAST(SUM(si.quantity * COALESCE(p.cost, 0)) AS REAL) as cost
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      JOIN products p ON si.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE s.created_at >= ? AND s.created_at <= ?
      GROUP BY c.id
      ORDER BY revenue DESC
      LIMIT 10
    `, startMs, endMs),

    prisma.$queryRawUnsafe(`
      SELECT CAST(COUNT(*) AS REAL) as totalSales,
             CAST(SUM(final_amount) AS REAL) as totalRevenue,
             CAST(SUM(CASE WHEN payment_method = 'cash' THEN 1 ELSE 0 END) AS REAL) as cashSales,
             CAST(SUM(CASE WHEN payment_method = 'card' THEN 1 ELSE 0 END) AS REAL) as cardSales
      FROM sales
      WHERE created_at >= ? AND created_at <= ?
    `, startMs, endMs),
  ]);

  const summaryRow = (summary as any[])[0] || {};

  return ipcSafe({
    salesTrend: (salesTrend as any[]).map(r => ({
      date: String(r.date || ''),
      revenue: Number(r.revenue || 0),
      count: Number(r.count || 0),
    })),
    salesByCategory: (salesByCategory as any[]).map(r => ({
      categoryRu: String(r.categoryRu || ''),
      categoryUz: String(r.categoryUz || ''),
      revenue: Number(r.revenue || 0),
      quantity: Number(r.quantity || 0),
    })),
    hourlyDistribution: (hourlyDist as any[]).map(r => ({
      hour: Number(r.hour || 0),
      revenue: Number(r.revenue || 0),
      count: Number(r.count || 0),
    })),
    topProducts: (topProducts as any[]).map(r => ({
      name: String(r.name || ''),
      quantity: Number(r.quantity || 0),
      revenue: Number(r.revenue || 0),
    })),
    cashierPerformance: (cashierPerf as any[]).map(r => ({
      name: String(r.name || ''),
      revenue: Number(r.revenue || 0),
      count: Number(r.count || 0),
    })),
    profitMargins: (profitMargins as any[]).map(r => ({
      categoryRu: String(r.categoryRu || ''),
      categoryUz: String(r.categoryUz || ''),
      revenue: Number(r.revenue || 0),
      cost: Number(r.cost || 0),
    })),
    summary: {
      totalSales: Number(summaryRow.totalSales || 0),
      totalRevenue: Number(summaryRow.totalRevenue || 0),
      cashSales: Number(summaryRow.cashSales || 0),
      cardSales: Number(summaryRow.cardSales || 0),
      averageTransaction:
        Number(summaryRow.totalSales || 0) > 0
          ? Number(summaryRow.totalRevenue || 0) / Number(summaryRow.totalSales || 0)
          : 0,
    },
  });
});

async function generateReceiptNumber(terminalId: string): Promise<string> {
  const prisma = getPrismaClient();
  const now = new Date();
  const dateStr = format(now, 'yyMMdd');
  const prefix = `${terminalId}${dateStr}`;

  // Get ALL receipt numbers with this prefix to find the true max
  const existing = await prisma.sale.findMany({
    where: {
      receiptNumber: { startsWith: prefix },
    },
    select: { receiptNumber: true },
  });

  let maxSeq = 0;
  for (const row of existing) {
    const seqStr = row.receiptNumber.slice(prefix.length);
    const seq = parseInt(seqStr, 10);
    if (!isNaN(seq) && seq > maxSeq) {
      maxSeq = seq;
    }
  }

  return `${prefix}${(maxSeq + 1).toString().padStart(3, '0')}`;
}
