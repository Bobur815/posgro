import { getPrismaClient } from '../database/sqlite-client';
import { getAppConfig } from '../config/app-config';
import { getServerToken } from './queue-manager';

const BATCH_SIZE = 50;

export async function syncSales(): Promise<void> {
  const prisma = getPrismaClient();
  const config = getAppConfig();

  // Get unsynced sales
  const unsyncedSales = await prisma.sale.findMany({
    where: { synced: false },
    include: { items: true },
    take: BATCH_SIZE,
    orderBy: { createdAt: 'asc' },
  });

  if (unsyncedSales.length === 0) {
    return;
  }


  const token = getServerToken();
  if (!token) {
    console.warn('[sales-sync] No server token available — skipping sync (user must log in first)');
    return; // No server token yet — will retry on next sync cycle
  }

  let successCount = 0;
  let failCount = 0;

  for (const sale of unsyncedSales) {
    try {
      const response = await fetch(`${config.vpsApiUrl}/sales/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          id: sale.id,
          receiptNumber: sale.receiptNumber,
          totalAmount: sale.totalAmount.toString(),
          discountAmount: sale.discountAmount.toString(),
          finalAmount: sale.finalAmount.toString(),
          paymentMethod: sale.paymentMethod,
          cashierId: sale.cashierId,
          cashierName: sale.cashierName || sale.cashierId,
          terminalId: config.terminalId,
          createdAt: sale.createdAt.toISOString(),
          items: sale.items.map((item: typeof sale.items[number]) => ({
            id: item.id,
            productId: item.productId,
            productName: item.productName,
            barcode: item.barcode,
            quantity: item.quantity.toString(),
            unitPrice: item.unitPrice.toString(),
            subtotal: item.subtotal.toString(),
          })),
        }),
      });

      if (response.ok) {
        // Mark as synced
        await prisma.sale.update({
          where: { id: sale.id },
          data: {
            synced: true,
            syncedAt: new Date(),
          },
        });
        successCount++;
      } else {
        const errorText = await response.text();
        // If the server reports a unique constraint violation, the sale already
        // exists on the server (a previous sync succeeded but the terminal never
        // received the 200 due to a network drop). Treat this as success so we
        // don't retry forever.
        if (errorText.includes('Unique constraint failed') || response.status === 409) {
          await prisma.sale.update({
            where: { id: sale.id },
            data: {
              synced: true,
              syncedAt: new Date(),
            },
          });
          successCount++;
        } else {
          console.error(`Failed to sync sale ${sale.receiptNumber} (HTTP ${response.status}):`, errorText);
          failCount++;
        }
      }
    } catch (error) {
      console.error(`Error syncing sale ${sale.receiptNumber}:`, error);
      failCount++;
      // Continue with next sale
    }
  }


  // Update last sync timestamp
  await prisma.systemSetting.upsert({
    where: { key: 'last_sale_sync' },
    update: { value: new Date().toISOString() },
    create: { key: 'last_sale_sync', value: new Date().toISOString() },
  });
}
