import { ipcMain } from 'electron';
import { getAppConfig } from '../config/app-config';
import { getServerToken } from '../sync/queue-manager';
import { getPrismaClient } from '../database/sqlite-client';

export interface PaynetReceiptInfo {
  id: string;
  receiptNumber: string;
  fiscalMark: string;
  ofdUrl: string;
  amount: number | null;
  issuedAt: string;
}

export function setupPaynetHandlers(): void {
  ipcMain.handle('paynetReceipts:getByAmount', async (): Promise<PaynetReceiptInfo[]> => {
    const config = getAppConfig();
    const token = getServerToken();
    if (!token) return [];

    try {
      const res = await fetch(`${config.vpsApiUrl}/paynet-receipts`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return [];
      return (await res.json()) as PaynetReceiptInfo[];
    } catch {
      return [];
    }
  });

  ipcMain.handle('paynetReceipts:integrate', async (
    _event,
    id: string,
    saleReceiptNumber: string,
    paynetReceiptNumber: string,
    ofdUrl: string,
  ): Promise<void> => {
    const prisma = getPrismaClient();

    // Write Paynet data to the local SQLite sale so subsequent prints include QR + fiscal mark
    await prisma.sale.updateMany({
      where: { receiptNumber: saleReceiptNumber },
      data: { paynetReceiptNumber, paynetOfdUrl: ofdUrl },
    });

    // Notify VPS (non-fatal — local state is the source of truth for printing)
    const config = getAppConfig();
    const token = getServerToken();
    if (token) {
      await fetch(`${config.vpsApiUrl}/paynet-receipts/${id}/integrate`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ saleReceiptNumber }),
        signal: AbortSignal.timeout(5000),
      }).catch(() => {});
    }
  });
}
