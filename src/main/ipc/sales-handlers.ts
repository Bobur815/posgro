import { ipcMain } from 'electron';
import { getPrismaClient } from '../database/sqlite-client';
import { getCurrentUser } from './auth-handlers';
import { getAppConfig } from '../config/app-config';
import { getServerToken } from '../sync/queue-manager';
import { regosVcrService } from '../fiscal/regos-vcr-service';
import { printReceipt } from '../printer/thermal-printer';
import { format } from 'date-fns';
import { commitSale, deleteSale, updateSale } from '../sales/commit-sale';
import { settleSale, type SettleOptions } from '../sales/settle-sale';
import {
  rankProducts,
  rankingCategories,
  type ProductPerformanceRow,
} from '../../server/modules/analytics/analytics.ranking';
import type { Sale, SaleItem as PrismaSaleItem } from '../../generated/prisma-sqlite';

function ipcSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

/**
 * Print the paper receipt for a freshly created sale — unless the virtual cash register prints it
 * itself ("Чек печатает виртуальная касса" in Fiscal settings), in which case the POS printing one
 * too would hand the customer two receipts for one sale.
 *
 * When the sale is being fiscalized right now, this waits for that round-trip first: printReceipt()
 * reads sale.regosQrCodeUrl off the row, so printing any earlier yields paper with no Soliq QR and
 * no cashback for the customer. A FAILED fiscalization still prints — the customer leaves with a
 * receipt (minus the QR) and the sale stays queued for a later retry, which is strictly better than
 * handing them nothing.
 *
 * printReceipt() is a no-op returning true when no printer is configured, so this stays quiet on
 * terminals that have none.
 */
async function printSaleReceipt(saleId: string, fiscalizing: Promise<void> | null): Promise<void> {
  if (await regosVcrService.vcrPrintsReceipt()) return;
  if (fiscalizing) await fiscalizing;
  await printReceipt(saleId);
}

/**
 * Everything that happens to a sale once its rows are written: the fiscal step (settle-sale.ts,
 * shared with a main answering its satellites) and then the paper receipt on this till's printer.
 *
 * Shared by sales:create and sales:update so an edited receipt goes through exactly the same
 * pipeline a new one does — the previous split (create only) is why editing a sale left it
 * un-fiscalized and unprinted.
 *
 * Never blocks on the printer: the cashier gets the sale back immediately.
 */
async function finalizeSale(saleId: string, data: SettleOptions): Promise<void> {
  const { fiscalizing } = await settleSale(saleId, data, getAppConfig().terminalId);
  printSaleReceipt(saleId, fiscalizing).catch((e) =>
    console.error('[printer] auto receipt print failed:', e instanceof Error ? e.message : e),
  );
}

export function setupSalesHandlers(): void {
  ipcMain.handle('sales:create', async (_event, data) => {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      throw new Error('Not authenticated');
    }

    // Stock check, shift, receipt number and the decrement happen in one serialized transaction —
    // the same path a satellite's sale takes when this terminal is its main (commit-sale.ts).
    // No caller-supplied id: that is the idempotency key for a satellite's network commit, and a
    // till writing to its own database has no lost response to retry.
    const { sale } = await commitSale({ ...data, id: undefined }, {
      terminalId: getAppConfig().terminalId,
      cashierId: currentUser.id,
      cashierName: currentUser.nameRu,
    });

    // Marking-label snapshot, REGOS:VCR fiscalization and the paper receipt. Fiscalization is
    // opt-in per sale: the sale is always saved as PENDING and only sent to the OFD now when the
    // caller asked (data.fiscalize — quick pay always does, the checkout modal follows its
    // checkbox). Otherwise it stays PENDING and can be fiscalized later from Sales History.
    await finalizeSale(sale.id, data);

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

    if (filters?.terminalId && currentUser.role === 'ADMIN') {
      where.terminalId = filters.terminalId;
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
        return sum + cost * Number(item.quantity) * (item.piecesPerUnit ?? 1);
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

    // Guards (owner, fiscalized, paid by UzQR), the stock swap and the rewrite run as one
    // transaction in the same queue as new sales — so a refused edit leaves stock as it was.
    const { sale: updatedSale } = await updateSale(saleId, data, {
      userId: currentUser.id,
      phone: currentUser.phone,
      role: currentUser.role,
    });

    // Same fiscal + print pipeline a new sale gets. The edit replaced the contents, so the labels
    // are re-snapshotted from what was just scanned rather than carried over from the old version.
    await finalizeSale(saleId, data);

    return ipcSafe(updatedSale);
  });

  ipcMain.handle('sales:delete', async (_event, saleId: string) => {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      throw new Error('Not authenticated');
    }

    // Stock back on the shelf, the rows gone, and the return recorded for the Z-report — together.
    const sale = await deleteSale(saleId, {
      userId: currentUser.id,
      phone: currentUser.phone,
      role: currentUser.role,
    });

    // If the sale was already synced to VPS, delete it there too so the
    // receipt number is freed and stock is restored on the server.
    if (sale.synced) {
      try {
        const appConfig = getAppConfig();
        const token = getServerToken();
        if (token) {
          const res = await fetch(`${appConfig.vpsApiUrl}/sales/${saleId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) {
            console.error(`[sales:delete] VPS delete failed for sale ${saleId}: HTTP ${res.status}`);
          }
        }
      } catch (err) {
        console.error(`[sales:delete] VPS delete error for sale ${saleId}:`, err instanceof Error ? err.message : err);
      }
    }

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
    // Counted separately, not folded into cardSales: these three must still add up to
    // totalSales, otherwise a UzQR sale disappears from the summary entirely.
    const uzqrSales = sales.filter((s: Sale & { items: PrismaSaleItem[] }) => s.paymentMethod === 'uzqr').length;

    return {
      date: format(today, 'yyyy-MM-dd'),
      totalSales,
      totalRevenue,
      totalItems,
      cashSales,
      cardSales,
      uzqrSales,
      averageTransaction: totalSales > 0 ? totalRevenue / totalSales : 0,
    };
  });
}

/**
 * The POS's own analytics screen.
 *
 * This is the THIRD implementation of the same report — the others are the Nest service (an ONLINE
 * store's dashboard) and local-server/routes/analytics.ts (an OFFLINE_ONLY store's LAN dashboard).
 * They must agree on the response shape, because one page renders all three. `rankProducts()` and
 * `rankingCategories()` are imported rather than reimplemented for exactly that reason: the
 * ordering rules around missing cost prices are subtle enough that a third copy would drift.
 */
ipcMain.handle('analytics:getData', async (_event, filters: {
  startDate: string;
  endDate: string;
  terminalId?: string;
  /** Narrows the product rankings only; every other figure stays whole-store. */
  categoryId?: number;
}) => {
  const prisma = getPrismaClient();
  // Prisma/SQLite stores DateTime as integer milliseconds since epoch
  const startMs = new Date(filters.startDate).getTime();
  const endMs = new Date(filters.endDate).getTime();

  // Build optional terminal filter clause for direct sales queries
  const terminalClause = filters.terminalId ? ` AND terminal_id = '${filters.terminalId.replace(/'/g, "''")}'` : '';
  // Same clause prefixed for join queries where sales table is aliased as 's'
  const terminalClauseS = filters.terminalId ? ` AND s.terminal_id = '${filters.terminalId.replace(/'/g, "''")}'` : '';

  const [salesTrend, salesByCategory, hourlyDist, topProducts, cashierPerf, profitMargins, summary, productPerformance] = await Promise.all([
    prisma.$queryRawUnsafe(`
      SELECT DATE(datetime(created_at/1000, 'unixepoch', 'localtime')) as date,
             CAST(SUM(final_amount) AS REAL) as revenue,
             CAST(COUNT(*) AS REAL) as count
      FROM sales
      WHERE created_at >= ? AND created_at <= ?${terminalClause}
      GROUP BY DATE(datetime(created_at/1000, 'unixepoch', 'localtime'))
      ORDER BY date ASC
    `, startMs, endMs),

    prisma.$queryRawUnsafe(`
      SELECT COALESCE(c.name_ru, 'Без категории') as categoryRu,
             COALESCE(c.name_uz, 'Kategoriyasiz') as categoryUz,
             CAST(SUM(si.subtotal) AS REAL) as revenue,
             CAST(SUM(si.quantity * si.pieces_per_unit) AS REAL) as quantity
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      JOIN products p ON si.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE s.created_at >= ? AND s.created_at <= ?${terminalClauseS}
      GROUP BY c.id
      ORDER BY revenue DESC
      LIMIT 10
    `, startMs, endMs),

    prisma.$queryRawUnsafe(`
      SELECT CAST(strftime('%H', datetime(created_at/1000, 'unixepoch', 'localtime')) AS INTEGER) as hour,
             CAST(SUM(final_amount) AS REAL) as revenue,
             CAST(COUNT(*) AS REAL) as count
      FROM sales
      WHERE created_at >= ? AND created_at <= ?${terminalClause}
      GROUP BY strftime('%H', datetime(created_at/1000, 'unixepoch', 'localtime'))
      ORDER BY hour ASC
    `, startMs, endMs),

    prisma.$queryRawUnsafe(`
      SELECT si.product_name as name,
             CAST(SUM(si.quantity * si.pieces_per_unit) AS REAL) as quantity,
             CAST(SUM(si.subtotal) AS REAL) as revenue
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      WHERE s.created_at >= ? AND s.created_at <= ?${terminalClauseS}
      GROUP BY si.product_id
      ORDER BY quantity DESC
      LIMIT 10
    `, startMs, endMs),

    prisma.$queryRawUnsafe(`
      SELECT cashier_name as name,
             CAST(SUM(final_amount) AS REAL) as revenue,
             CAST(COUNT(*) AS REAL) as count
      FROM sales
      WHERE created_at >= ? AND created_at <= ?${terminalClause}
      GROUP BY cashier_id
      ORDER BY revenue DESC
    `, startMs, endMs),

    prisma.$queryRawUnsafe(`
      SELECT COALESCE(c.name_ru, 'Без категории') as categoryRu,
             COALESCE(c.name_uz, 'Kategoriyasiz') as categoryUz,
             CAST(SUM(si.subtotal) AS REAL) as revenue,
             CAST(SUM(si.quantity * si.pieces_per_unit * COALESCE(p.cost, 0)) AS REAL) as cost
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      JOIN products p ON si.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE s.created_at >= ? AND s.created_at <= ?${terminalClauseS}
      GROUP BY c.id
      ORDER BY revenue DESC
      LIMIT 10
    `, startMs, endMs),

    prisma.$queryRawUnsafe(`
      SELECT CAST(COUNT(*) AS REAL) as totalSales,
             CAST(SUM(final_amount) AS REAL) as totalRevenue,
             CAST(SUM(CASE WHEN payment_method = 'cash' THEN 1 ELSE 0 END) AS REAL) as cashSales,
             CAST(SUM(CASE WHEN payment_method = 'card' THEN 1 ELSE 0 END) AS REAL) as cardSales,
             CAST(SUM(CASE WHEN payment_method = 'uzqr' THEN 1 ELSE 0 END) AS REAL) as uzqrSales
      FROM sales
      WHERE created_at >= ? AND created_at <= ?${terminalClause}
    `, startMs, endMs),

    // Drives the top/bottom rankings. Starts from `products`, not `sale_items`, so a product
    // that sold NOTHING still appears with zeros and can rank as a worst seller — which is the
    // whole point of a worst-sellers list. The period filter stays inside the subquery: moved
    // outside it would turn the LEFT JOIN back into an inner one and drop exactly those rows.
    //
    // Unlike the other queries here this one is NOT terminal-scoped: a product's ranking is a
    // property of the shop's catalogue, and slicing it per till would make "never sold" mean
    // "never sold on this till".
    prisma.$queryRawUnsafe(`
      SELECT p.id AS productId,
             p.name_ru AS nameRu,
             p.name_uz AS nameUz,
             p.category_id AS categoryId,
             COALESCE(c.name_ru, 'Без категории') AS categoryRu,
             COALESCE(c.name_uz, 'Kategoriyasiz') AS categoryUz,
             CAST(COALESCE(agg.quantity, 0) AS REAL) AS quantity,
             CAST(COALESCE(agg.revenue, 0) AS REAL) AS revenue,
             CAST(COALESCE(agg.quantity, 0) * COALESCE(p.cost, 0) AS REAL) AS cost,
             (p.cost IS NOT NULL) AS hasCost
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN (
        SELECT si.product_id,
               SUM(si.quantity * si.pieces_per_unit) AS quantity,
               SUM(si.subtotal) AS revenue
        FROM sale_items si
        JOIN sales s ON si.sale_id = s.id
        WHERE s.created_at >= ? AND s.created_at <= ?
        GROUP BY si.product_id
      ) agg ON agg.product_id = p.id
      WHERE p.active = 1
    `, startMs, endMs),
  ]);

  const summaryRow = (summary as any[])[0] || {};

  // SQLite has no boolean type, so `hasCost` arrives as 0/1.
  const performanceRows: ProductPerformanceRow[] = (productPerformance as any[]).map((r) => ({
    productId: Number(r.productId || 0),
    nameRu: String(r.nameRu || ''),
    nameUz: String(r.nameUz || ''),
    categoryId: Number(r.categoryId || 0),
    categoryRu: String(r.categoryRu || ''),
    categoryUz: String(r.categoryUz || ''),
    quantity: Number(r.quantity || 0),
    revenue: Number(r.revenue || 0),
    cost: Number(r.cost || 0),
    hasCost: Boolean(r.hasCost),
  }));
  // Narrowed BEFORE the top/bottom slice, or "best in this category" would instead mean "the
  // members of this category that made the overall top ten".
  const rankedRows =
    filters.categoryId == null
      ? performanceRows
      : performanceRows.filter((r) => r.categoryId === filters.categoryId);

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
    productRanking: rankProducts(rankedRows),
    // Always the unfiltered list, so the dropdown keeps every option once one is chosen.
    rankingCategories: rankingCategories(performanceRows),
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
      uzqrSales: Number(summaryRow.uzqrSales || 0),
      averageTransaction:
        Number(summaryRow.totalSales || 0) > 0
          ? Number(summaryRow.totalRevenue || 0) / Number(summaryRow.totalSales || 0)
          : 0,
    },
  });
});

ipcMain.handle('terminals:getKnown', async () => {
  const prisma = getPrismaClient();
  const rows = await prisma.$queryRaw<{ terminal_id: string }[]>`
    SELECT DISTINCT terminal_id FROM sales ORDER BY terminal_id
  `;
  return rows.map((r: { terminal_id: string }) => r.terminal_id);
});

ipcMain.handle('terminals:getStatus', async () => {
  const config = getAppConfig();
  const token = getServerToken();
  if (!token) return [];

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(
      `${config.vpsApiUrl}/terminals/status?storeId=${encodeURIComponent(config.storeId)}`,
      { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal }
    );
    clearTimeout(timeoutId);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
});
