import { getPrismaClient } from '../database/sqlite-client';
import { getAppConfig } from '../config/app-config';
import { getServerToken } from './queue-manager';
import { endpointKnownMissing, noteEndpointStatus } from './missing-endpoints';

/**
 * Send the server the tenders of split-payment receipts (sale_payments rows).
 *
 * Its own endpoint, never fields on /sales/sync: the server's ValidationPipe rejects unknown
 * properties, so an older server would refuse the whole sale. Until the server has the endpoint
 * (404) the rows stay unsent and go once it has — the sale itself synced long before.
 *
 * Only for sales the server already has (`synced`), like fiscal-status-sync. A receipt's lines are
 * sent together and replaced together there; editing the sale recreates its rows unsent, so the
 * new lines go up and replace the old ones.
 */

const BATCH = 200;
const KEY = 'sales/payments-sync';

export async function syncSalePayments(): Promise<void> {
  const prisma = getPrismaClient();
  const token = getServerToken();
  if (!token) return;
  if (endpointKnownMissing(KEY)) return;

  const rows = (await prisma.salePayment.findMany({
    where: { synced: false, sale: { synced: true } },
    select: {
      id: true,
      saleId: true,
      method: true,
      amount: true,
      sale: { select: { receiptNumber: true } },
    },
    take: BATCH,
  })) as {
    id: string;
    saleId: string;
    method: string;
    amount: unknown;
    sale: { receiptNumber: string };
  }[];
  if (rows.length === 0) return;

  // Whole receipts only: a receipt cut by the batch limit would replace its lines with part of them.
  const bySale = new Map<string, typeof rows>();
  for (const r of rows) bySale.set(r.saleId, [...(bySale.get(r.saleId) ?? []), r]);
  const all = await prisma.salePayment.findMany({
    where: { saleId: { in: [...bySale.keys()] } },
    select: { id: true, saleId: true, method: true, amount: true },
  });
  const receipts = [...bySale.entries()].map(([saleId, some]) => ({
    saleId,
    receiptNumber: some[0].sale.receiptNumber,
    lines: (all as typeof rows).filter((l) => l.saleId === saleId),
  }));

  const res = await fetch(`${getAppConfig().vpsApiUrl}/${KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      sales: receipts.map((r) => ({
        receiptNumber: r.receiptNumber,
        payments: r.lines.map((l) => ({ method: l.method, amount: Number(l.amount).toFixed(2) })),
      })),
    }),
  });
  noteEndpointStatus(KEY, res.status);
  if (res.status === 404) return;
  if (!res.ok) {
    console.error(`[payments-sync] upload failed (HTTP ${res.status})`);
    return;
  }

  const { synced = [] } = (await res.json().catch(() => ({}))) as { synced?: string[] };
  for (const r of receipts) {
    if (!synced.includes(r.receiptNumber)) continue;
    // Only the rows that were sent: rows an edit created meanwhile stay unsent and go next cycle.
    await prisma.salePayment.updateMany({
      where: { id: { in: r.lines.map((l) => l.id) } },
      data: { synced: true },
    });
  }
}
